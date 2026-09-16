import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CarnetDB } from '../db/db'
import { countDirty, saveRow, setMeta } from '../db/repo'
import { makeTrip, makeVehicle } from '../test/fixtures'
import { createSyncEngine } from './engine'
import { fakeRemote } from './fake-remote'
import { pullAll, UUID_NUL } from './pull'
import { pushDirty } from './push'
import { SyncError } from './remote'

let db: CarnetDB
beforeEach(() => {
  db = new CarnetDB(`test-${crypto.randomUUID()}`)
})

describe('pushDirty', () => {
  it('envoie les lignes à pousser sans champs locaux ni owner_id, puis les marque propres', async () => {
    const r = fakeRemote()
    const v = makeVehicle()
    await saveRow(db, 'vehicles', { ...v, owner_id: 'x' } as typeof v)
    const res = await pushDirty(db, r.api)
    expect(res).toEqual({ pushed: 1, rejected: [] })
    expect(r.get('vehicles', v.id)).not.toHaveProperty('_dirty')
    expect(r.get('vehicles', v.id)).not.toHaveProperty('owner_id')
    expect((await db.vehicles.get(v.id))?._dirty).toBe(0)
  })

  it('une écriture locale pendant l’envoi garde la ligne à pousser', async () => {
    const r = fakeRemote()
    const v = makeVehicle()
    await saveRow(db, 'vehicles', v)
    const upsert = r.api.upsert
    r.api.upsert = async (t, rows) => {
      await saveRow(db, 'vehicles', { ...v, nom: 'Modifiée pendant l’envoi' })
      return upsert(t, rows)
    }
    await pushDirty(db, r.api)
    expect(await db.vehicles.get(v.id)).toMatchObject({ _dirty: 1, _rev: 2 })
  })

  it('refus serveur : la version serveur remplace la locale et le refus est signalé', async () => {
    const r = fakeRemote()
    const t = makeTrip({ statut: 'exporte', motif: 'Motif verrouillé côté serveur' })
    r.put('trips', t)
    r.rejectIds.add(t.id)
    await saveRow(db, 'trips', { ...t, statut: 'valide', motif: 'Tentative de modification locale' })
    const res = await pushDirty(db, r.api)
    expect(res.rejected).toHaveLength(1)
    expect(await db.trips.get(t.id)).toMatchObject({ motif: 'Motif verrouillé côté serveur', _dirty: 0 })
  })

  it('coupure réseau : SyncError fatale, les lignes restent à pousser', async () => {
    const r = fakeRemote()
    r.setOffline(true)
    await saveRow(db, 'vehicles', makeVehicle())
    await expect(pushDirty(db, r.api)).rejects.toBeInstanceOf(SyncError)
    expect(await countDirty(db)).toBe(1)
  })

  it('refus serveur avec réécriture locale pendant l’isolement : la version locale est conservée, à pousser, et le refus est signalé', async () => {
    const r = fakeRemote()
    const t = makeTrip({ statut: 'exporte', motif: 'Motif verrouillé côté serveur' })
    r.put('trips', t)
    r.rejectIds.add(t.id)
    await saveRow(db, 'trips', { ...t, statut: 'valide', motif: 'Tentative de modification locale' })
    const fetchById = r.api.fetchById
    // Simule une saisie utilisateur entre la capture du lot à pousser et l'appel réseau d'isolement.
    r.api.fetchById = async (table, id) => {
      await saveRow(db, 'trips', { ...t, motif: 'Modifiée pendant l’isolement' })
      return fetchById(table, id)
    }
    const res = await pushDirty(db, r.api)
    expect(res.rejected).toHaveLength(1)
    expect(await db.trips.get(t.id)).toMatchObject({ motif: 'Modifiée pendant l’isolement', _dirty: 1, _rev: 2 })
  })
})

describe('pullAll', () => {
  it('importe les lignes serveur, pagine et mémorise le curseur', async () => {
    const r = fakeRemote()
    // Id au format uuid (comme en production) : au-delà d'une page, le curseur mémorisé porte cet
    // id et est retransmis au serveur — le double le valide désormais comme le ferait Postgres.
    for (let i = 0; i < 3; i++) r.put('trips', makeTrip({ id: crypto.randomUUID() }))
    expect(await pullAll(db, r.api, 2)).toBeGreaterThanOrEqual(3)
    expect(await db.trips.count()).toBe(3)
    expect((await db.meta.get('cursor:trips'))?.value).toBeTruthy()
  })

  it('n’écrase pas une ligne locale encore à pousser', async () => {
    const r = fakeRemote()
    const t = makeTrip({ motif: 'Version serveur du motif' })
    r.put('trips', t)
    await saveRow(db, 'trips', { ...t, motif: 'Version locale plus récente' })
    await pullAll(db, r.api)
    expect((await db.trips.get(t.id))?.motif).toBe('Version locale plus récente')
  })

  it('plus de pageSize lignes partageant exactement le même updated_at sont toutes récupérées', async () => {
    const r = fakeRemote()
    const meme_horodatage = new Date(Date.UTC(2026, 8, 15, 12, 0, 0)).toISOString()
    // Id au format uuid : la pagination sur ce même horodatage renvoie ces id comme curseur.
    for (let i = 0; i < 5; i++) r.putAt('trips', makeTrip({ id: crypto.randomUUID() }), meme_horodatage)
    expect(await pullAll(db, r.api, 2)).toBe(5)
    expect(await db.trips.count()).toBe(5)
  })

  it('exactement pageSize lignes partageant le dernier horodatage : la synchro se termine sans erreur', async () => {
    const r = fakeRemote()
    const meme_horodatage = new Date(Date.UTC(2026, 8, 15, 12, 0, 0)).toISOString()
    r.putAt('trips', makeTrip({ id: crypto.randomUUID() }), meme_horodatage)
    r.putAt('trips', makeTrip({ id: crypto.randomUUID() }), meme_horodatage)
    await expect(pullAll(db, r.api, 2)).resolves.toBe(2)
    expect(await db.trips.count()).toBe(2)
  })

  it('un curseur déjà stocké sous l’ancienne forme (chaîne seule) est accepté et ne fait rien perdre', async () => {
    const r = fakeRemote()
    const t1 = makeTrip()
    r.put('trips', t1)
    const stored1 = r.get('trips', t1.id)!
    // Simule un curseur mémorisé par l'ancien code : une simple chaîne d'horodatage, sans identifiant.
    // Traité comme (horodatage, identifiant nul), il ne fait rien perdre : au pire il refait
    // repasser les lignes de cet horodatage précis (idempotent), jamais tout l'historique.
    await setMeta(db, 'cursor:trips', stored1.updated_at)
    const t2 = makeTrip()
    r.putAt('trips', t2, stored1.updated_at) // même horodatage que le curseur déjà enregistré
    const fetchSince = vi.spyOn(r.api, 'fetchSince')
    await expect(pullAll(db, r.api)).resolves.toBe(2)
    expect(await db.trips.get(t1.id)).toBeDefined()
    expect(await db.trips.get(t2.id)).toBeDefined()
    // Le filtre transmis au serveur doit porter l'uuid nul, pas une chaîne vide : une colonne `id`
    // de type uuid fait échouer Postgres sur `id.gt.""` (code 22P02).
    expect(fetchSince).toHaveBeenCalledWith('trips', { updatedAt: stored1.updated_at, id: UUID_NUL }, expect.anything())
  })

  it('le double refuse un curseur dont l’identifiant n’a pas la forme d’un uuid (comme le vrai serveur)', async () => {
    const r = fakeRemote()
    r.put('trips', makeTrip())
    const { rows, error } = await r.api.fetchSince('trips', { updatedAt: new Date(0).toISOString(), id: '' }, 10)
    expect(rows).toEqual([])
    expect(error).toMatch(/invalid input syntax for type uuid/)
  })
})

describe('createSyncEngine', () => {
  it('pousse, tire, appelle afterPull et publie l’état', async () => {
    const r = fakeRemote()
    const afterPull = vi.fn(async () => {})
    const engine = createSyncEngine({ db, remote: r.api, afterPull, isOnline: () => true })
    await saveRow(db, 'vehicles', makeVehicle())
    await engine.syncNow()
    expect(afterPull).toHaveBeenCalledOnce()
    expect(engine.getState()).toMatchObject({ status: 'idle', pending: 0, message: null })
    expect(engine.getState().lastSync).not.toBeNull()
  })

  it('hors ligne : ne contacte pas le serveur', async () => {
    const r = fakeRemote()
    const spy = vi.spyOn(r.api, 'upsert')
    const engine = createSyncEngine({ db, remote: r.api, isOnline: () => false })
    await saveRow(db, 'vehicles', makeVehicle())
    await engine.syncNow()
    expect(spy).not.toHaveBeenCalled()
    expect(engine.getState()).toMatchObject({ status: 'offline', pending: 1 })
  })
})

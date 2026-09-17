import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CarnetDB } from '../db/db'
import { countDirty, saveRow, setMeta } from '../db/repo'
import { makeTrip, makeVehicle } from '../test/fixtures'
import { createSyncEngine } from './engine'
import { fakeRemote } from './fake-remote'
import { pullAll, UUID_NUL } from './pull'
import { pushDirty } from './push'
import { isFatal, SyncError } from './remote'

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

describe('pushDirty — erreurs non métier et changement de véhicule', () => {
  it('erreur SQL autre que le verrou métier (P0001) : la ligne locale reste à pousser, intacte, et le refus est signalé', async () => {
    const r = fakeRemote()
    const t = makeTrip({ motif: 'Version serveur du trajet' })
    r.put('trips', t)
    r.failIds.set(t.id, { code: '23503', error: 'violates foreign key constraint' })
    await saveRow(db, 'trips', { ...t, motif: 'Version locale à ne pas perdre' })
    const res = await pushDirty(db, r.api)
    expect(res.rejected).toEqual([{ table: 'trips', id: t.id, error: 'violates foreign key constraint', code: '23503' }])
    expect(await db.trips.get(t.id)).toMatchObject({ motif: 'Version locale à ne pas perdre', _dirty: 1 })
  })

  it('nouveau véhicule + clôture de l’ancien + trajets déplacés : l’ancien est clôturé avant l’insertion du nouveau', async () => {
    const r = fakeRemote({ constraints: true })
    // Ids choisis pour que l'ordre naturel (par id) pousse le nouveau véhicule en premier.
    const ancien = makeVehicle({ id: 'ffffffff-0000-4000-8000-000000000001', nom: 'Ancienne', cv: 5, date_debut: '2020-01-01' })
    r.put('vehicles', ancien)
    const trajet = makeTrip({ id: 'aaaaaaaa-0000-4000-8000-000000000001', date: '2026-09-20', vehicle_id: ancien.id })
    r.put('trips', trajet)
    const nouveau = makeVehicle({ id: '00000000-0000-4000-8000-000000000002', nom: 'Nouvelle', cv: 7, date_debut: '2026-09-15' })
    // Ce qu'écrit VehicleSheet : clôture de l'ancien, nouveau véhicule, trajets rattachés.
    await saveRow(db, 'vehicles', { ...ancien, date_fin: '2026-09-14' })
    await saveRow(db, 'vehicles', nouveau)
    await saveRow(db, 'trips', { ...trajet, vehicle_id: nouveau.id })
    const res = await pushDirty(db, r.api)
    expect(res.rejected).toEqual([])
    expect(r.get('vehicles', ancien.id)).toMatchObject({ date_fin: '2026-09-14' })
    expect(r.get('vehicles', nouveau.id)).toBeDefined()
    expect(r.get('trips', trajet.id)).toMatchObject({ vehicle_id: nouveau.id })
    expect(await db.trips.get(trajet.id)).toMatchObject({ vehicle_id: nouveau.id, _dirty: 0 })
    expect(await countDirty(db)).toBe(0)
  })

  it('isolement ligne à ligne : même ordre (véhicules clôturés d’abord)', async () => {
    const r = fakeRemote({ constraints: true })
    const ancien = makeVehicle({ id: 'ffffffff-0000-4000-8000-000000000001', date_debut: '2020-01-01' })
    r.put('vehicles', ancien)
    const nouveau = makeVehicle({ id: '00000000-0000-4000-8000-000000000002', date_debut: '2026-09-15' })
    const bloque = makeVehicle({ id: '11111111-0000-4000-8000-000000000003', date_debut: '2019-01-01', date_fin: '2019-06-30' })
    r.failIds.set(bloque.id, { code: '42501', error: 'permission denied' }) // force le passage ligne à ligne
    await saveRow(db, 'vehicles', { ...ancien, date_fin: '2026-09-14' })
    await saveRow(db, 'vehicles', nouveau)
    await saveRow(db, 'vehicles', bloque)
    const res = await pushDirty(db, r.api)
    expect(res.rejected.map((x) => x.id)).toEqual([bloque.id])
    expect(r.get('vehicles', nouveau.id)).toBeDefined()
    expect(r.get('vehicles', ancien.id)).toMatchObject({ date_fin: '2026-09-14' })
  })

  it('véhicule refusé (chevauchement) : les trajets déplacés restent en local sur le nouveau véhicule, à pousser', async () => {
    const r = fakeRemote({ constraints: true })
    const ancien = makeVehicle({ id: 'ffffffff-0000-4000-8000-000000000001', date_debut: '2020-01-01' })
    r.put('vehicles', ancien)
    const trajet = makeTrip({ id: 'aaaaaaaa-0000-4000-8000-000000000001', date: '2026-09-20', vehicle_id: ancien.id })
    r.put('trips', trajet)
    // Nouveau véhicule poussé sans clôture de l'ancien (ex. clôture pas encore écrite) : 23P01 puis 23503.
    const nouveau = makeVehicle({ id: '00000000-0000-4000-8000-000000000002', date_debut: '2026-09-15' })
    await saveRow(db, 'vehicles', nouveau)
    await saveRow(db, 'trips', { ...trajet, vehicle_id: nouveau.id })
    const res = await pushDirty(db, r.api)
    expect(res.rejected.map((x) => x.code).sort()).toEqual(['23503', '23P01'])
    expect(await db.trips.get(trajet.id)).toMatchObject({ vehicle_id: nouveau.id, _dirty: 1 })
    expect(r.get('trips', trajet.id)).toMatchObject({ vehicle_id: ancien.id })
  })
})

describe('isFatal', () => {
  it.each([
    [undefined, true], // pas de code : réseau
    ['', true],
    ['PGRST000', true], // base injoignable
    ['PGRST003', true], // délai d'obtention d'une connexion
    ['PGRST301', true], // session (JWT)
    ['PGRST303', true],
    ['57014', true], // statement timeout
    ['08006', true], // connexion perdue
    ['P0001', false], // verrou métier
    ['23P01', false],
    ['23503', false],
    ['42501', false],
    ['PGRST204', false], // colonne inconnue : refus de la ligne, pas une coupure
    ['PGRST116', false],
  ])('code %s → fatal = %s', (code, fatal) => {
    expect(isFatal(code)).toBe(fatal)
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

  it('modification gardée en attente après une erreur serveur : état en erreur, message explicite', async () => {
    const r = fakeRemote()
    const v = makeVehicle()
    r.failIds.set(v.id, { code: '23P01', error: 'conflicting key value violates exclusion constraint' })
    const engine = createSyncEngine({ db, remote: r.api, isOnline: () => true })
    await saveRow(db, 'vehicles', v)
    await engine.syncNow()
    expect(engine.getState()).toMatchObject({ status: 'error', pending: 1 })
    expect(engine.getState().message).toMatch(/non synchronisée/)
  })

  it('refus par verrou métier seul : état normal, message « trajet exporté ? »', async () => {
    const r = fakeRemote()
    const t = makeTrip({ statut: 'exporte' })
    r.put('trips', t)
    r.rejectIds.add(t.id)
    const engine = createSyncEngine({ db, remote: r.api, isOnline: () => true })
    await saveRow(db, 'trips', { ...t, statut: 'valide' })
    await engine.syncNow()
    expect(engine.getState()).toMatchObject({ status: 'idle', pending: 0 })
    expect(engine.getState().message).toMatch(/trajet exporté/)
  })

  it('refus au premier envoi mais réussite au second (après le pull) : état final sans erreur', async () => {
    const r = fakeRemote()
    const v = makeVehicle()
    r.failIds.set(v.id, { code: '40001', error: 'could not serialize access' })
    const afterPull = vi.fn(async () => {
      r.failIds.delete(v.id) // le conflit a disparu entre les deux envois
    })
    const engine = createSyncEngine({ db, remote: r.api, afterPull, isOnline: () => true })
    await saveRow(db, 'vehicles', v)
    await engine.syncNow()
    expect(engine.getState()).toMatchObject({ status: 'idle', pending: 0, message: null })
  })

  it('refus au second envoi seulement (ligne écrite par afterPull) : signalé', async () => {
    const r = fakeRemote()
    const v = makeVehicle()
    r.failIds.set(v.id, { code: '23P01', error: 'conflicting key value violates exclusion constraint' })
    const afterPull = vi.fn(async () => {
      if (!(await db.vehicles.get(v.id))) await saveRow(db, 'vehicles', v)
    })
    const engine = createSyncEngine({ db, remote: r.api, afterPull, isOnline: () => true })
    await engine.syncNow()
    expect(engine.getState()).toMatchObject({ status: 'error', pending: 1 })
    expect(engine.getState().message).toMatch(/non synchronisée/)
  })

  it('verrou au premier envoi et erreur au second : les deux sont signalés, une seule fois chacun', async () => {
    const r = fakeRemote()
    const t = makeTrip({ statut: 'exporte' })
    r.put('trips', t)
    r.rejectIds.add(t.id)
    const v = makeVehicle()
    r.failIds.set(v.id, { code: '23P01', error: 'conflicting key value violates exclusion constraint' })
    const afterPull = vi.fn(async () => {
      if (!(await db.vehicles.get(v.id))) await saveRow(db, 'vehicles', v)
    })
    const engine = createSyncEngine({ db, remote: r.api, afterPull, isOnline: () => true })
    await saveRow(db, 'trips', { ...t, statut: 'valide' })
    await engine.syncNow()
    const { status, message } = engine.getState()
    expect(status).toBe('error')
    expect(message).toMatch(/^1 modification\(s\) non synchronisée\(s\).* · 1 modification\(s\) refusée\(s\) par le serveur/)
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

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CarnetDB } from '../db/db'
import { countDirty, saveRow } from '../db/repo'
import { makeTrip, makeVehicle } from '../test/fixtures'
import { createSyncEngine } from './engine'
import { fakeRemote } from './fake-remote'
import { pullAll } from './pull'
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
})

describe('pullAll', () => {
  it('importe les lignes serveur, pagine et mémorise le curseur', async () => {
    const r = fakeRemote()
    for (let i = 0; i < 3; i++) r.put('trips', makeTrip())
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

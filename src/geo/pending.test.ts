import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CarnetDB } from '../db/db'
import { saveRow } from '../db/repo'
import { makePlace, makeTrip, makeVehicle } from '../test/fixtures'
import { resolvePendingKm } from './pending'

let db: CarnetDB
beforeEach(async () => {
  db = new CarnetDB(`test-${crypto.randomUUID()}`)
  await saveRow(db, 'vehicles', makeVehicle({ id: 'veh-A' }))
  await saveRow(db, 'places', makePlace({ id: 'p-dom', lat: 45.93, lng: 6.75 }))
  await saveRow(db, 'places', makePlace({ id: 'p-client', lat: 45.92, lng: 6.87 }))
})

const pending = (o = {}) =>
  makeTrip({ km_route: null, km_total: null, statut: 'brouillon', aller_retour: true, ...o })

describe('resolvePendingKm', () => {
  it('calcule les km en attente et revalide le trajet', async () => {
    const t = pending()
    await saveRow(db, 'trips', t)
    const compute = vi.fn(async () => 12.3)
    expect(await resolvePendingKm(db, compute)).toBe(1)
    expect(compute).toHaveBeenCalledWith({ lat: 45.93, lng: 6.75 }, { lat: 45.92, lng: 6.87 })
    expect(await db.trips.get(t.id)).toMatchObject({ km_route: 12.3, km_total: 24.6, statut: 'valide', _dirty: 1 })
  })

  it('ignore les trajets exportés, déjà calculés, corrigés à la main ou sans coordonnées', async () => {
    await saveRow(db, 'places', makePlace({ id: 'p-sans', lat: null, lng: null }))
    await saveRow(db, 'trips', pending({ statut: 'exporte' }))
    await saveRow(db, 'trips', pending({ km_route: 5, km_total: 10 }))
    await saveRow(db, 'trips', pending({ km_saisi: 8, km_total: 16 }))
    await saveRow(db, 'trips', pending({ arrivee_place_id: 'p-sans' }))
    const compute = vi.fn(async () => 1)
    expect(await resolvePendingKm(db, compute)).toBe(0)
    expect(compute).not.toHaveBeenCalled()
  })

  it('ignore un trajet mis à l’écart (refus définitif du serveur) : il ne repart pas à pousser', async () => {
    const t = pending()
    await saveRow(db, 'trips', t)
    await db.trips.update(t.id, { _dirty: 2 })
    const compute = vi.fn(async () => 1)
    expect(await resolvePendingKm(db, compute)).toBe(0)
    expect(await db.trips.get(t.id)).toMatchObject({ _dirty: 2 })
  })

  it('une erreur d’itinéraire laisse le trajet en brouillon', async () => {
    const t = pending()
    await saveRow(db, 'trips', t)
    expect(await resolvePendingKm(db, async () => { throw new Error('quota') })).toBe(0)
    expect((await db.trips.get(t.id))?.km_route).toBeNull()
  })
})

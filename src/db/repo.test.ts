import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTrip, makeVehicle } from '../test/fixtures'
import { CarnetDB } from './db'
import { countDirty, countQuarantined, getMeta, retryQuarantined, newRow, onLocalWrite, saveRow, setMeta, softDelete, stripLocal } from './repo'
import type { Vehicle } from '../domain/types'

let db: CarnetDB
beforeEach(() => {
  db = new CarnetDB(`test-${crypto.randomUUID()}`)
})

describe('repo', () => {
  it('newRow génère id et horodatages', () => {
    const v = newRow<Vehicle>({ nom: 'X', immatriculation: '', cv: 5, energie: 'thermique', date_debut: '2026-01-01', date_fin: null })
    expect(v.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(v.deleted_at).toBeNull()
    expect(v.created_at).toBe(v.updated_at)
  })

  it('saveRow marque la ligne à pousser et incrémente _rev', async () => {
    const v = makeVehicle()
    await saveRow(db, 'vehicles', v)
    expect(await db.vehicles.get(v.id)).toMatchObject({ _dirty: 1, _rev: 1 })
    await saveRow(db, 'vehicles', { ...v, nom: 'Renommée' })
    expect(await db.vehicles.get(v.id)).toMatchObject({ nom: 'Renommée', _dirty: 1, _rev: 2 })
  })

  it('softDelete pose deleted_at et reste à pousser', async () => {
    const t = makeTrip()
    await saveRow(db, 'trips', t)
    await db.trips.update(t.id, { _dirty: 0 })
    await softDelete(db, 'trips', t.id)
    const row = await db.trips.get(t.id)
    expect(row?.deleted_at).not.toBeNull()
    expect(row?._dirty).toBe(1)
  })

  it('countDirty compte les lignes en attente sur toutes les tables', async () => {
    await saveRow(db, 'vehicles', makeVehicle())
    await saveRow(db, 'trips', makeTrip())
    expect(await countDirty(db)).toBe(2)
  })

  it('stripLocal retire les champs locaux', () => {
    expect(stripLocal({ id: 'a', _dirty: 1, _rev: 3 })).toEqual({ id: 'a' })
  })

  it('prévient les abonnés à chaque écriture', async () => {
    const fn = vi.fn()
    const off = onLocalWrite(fn)
    await saveRow(db, 'vehicles', makeVehicle())
    off()
    await saveRow(db, 'vehicles', makeVehicle())
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('meta clé/valeur', async () => {
    expect(await getMeta(db, 'cursor:trips')).toBeNull()
    await setMeta(db, 'cursor:trips', '2026-09-15T10:00:00Z')
    expect(await getMeta(db, 'cursor:trips')).toBe('2026-09-15T10:00:00Z')
  })

  it('retryQuarantined : les lignes mises à l’écart repartent à pousser', async () => {
    const v = makeVehicle()
    await saveRow(db, 'vehicles', v)
    await db.vehicles.update(v.id, { _dirty: 2 })
    expect(await countQuarantined(db)).toBe(1)
    expect(await countDirty(db)).toBe(0)
    expect(await retryQuarantined(db)).toBe(1)
    expect(await countQuarantined(db)).toBe(0)
    expect(await db.vehicles.get(v.id)).toMatchObject({ _dirty: 1 })
  })
})

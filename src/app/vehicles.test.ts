import { describe, expect, it } from 'vitest'
import { makeTrip, makeVehicle } from '../test/fixtures'
import { dayBefore, overlaps, tripsToReassign } from './vehicles'

describe('véhicules', () => {
  it('dayBefore gère les changements de mois et d’année', () => {
    expect(dayBefore('2026-12-15')).toBe('2026-12-14')
    expect(dayBefore('2027-01-01')).toBe('2026-12-31')
    expect(dayBefore('2028-03-01')).toBe('2028-02-29')
  })
  it('overlaps : périodes bornes incluses, fin vide = en cours', () => {
    expect(overlaps({ date_debut: '2020-01-01', date_fin: null }, { date_debut: '2026-12-15', date_fin: null })).toBe(true)
    expect(overlaps({ date_debut: '2020-01-01', date_fin: '2026-12-14' }, { date_debut: '2026-12-15', date_fin: null })).toBe(false)
    expect(overlaps({ date_debut: '2020-01-01', date_fin: '2026-12-15' }, { date_debut: '2026-12-15', date_fin: null })).toBe(true)
  })
  it('réaffecte les trajets non exportés au véhicule actif à leur date', () => {
    const a = makeVehicle({ id: 'veh-A', date_fin: '2026-12-14' })
    const b = makeVehicle({ id: 'veh-B', date_debut: '2026-12-15' })
    const avant = makeTrip({ date: '2026-12-10', vehicle_id: 'veh-A' })
    const apres = makeTrip({ date: '2026-12-20', vehicle_id: 'veh-A' })
    const exporte = makeTrip({ date: '2026-12-21', vehicle_id: 'veh-A', statut: 'exporte' })
    const res = tripsToReassign([avant, apres, exporte], [a, b], [])
    expect(res.map((t) => [t.id, t.vehicle_id])).toEqual([[apres.id, 'veh-B']])
  })
})

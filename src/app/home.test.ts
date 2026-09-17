import { describe, expect, it } from 'vitest'
import type { AppData } from '../hooks/useData'
import { makePlace, makeTrip, makeVehicle } from '../test/fixtures'
import { homeSummary } from './home'

const base = (trips: AppData['trips'], extra: Partial<AppData> = {}): AppData => ({
  trips, expenses: [], vehicles: [makeVehicle()], fiscalYears: [], baremeYears: [], rates: [],
  places: [makePlace({ role: 'domicile' })], exports: [], ...extra,
})

describe('homeSummary', () => {
  it('km et nombre de trajets du mois par activité, jours du plus récent au plus ancien', () => {
    const s = homeSummary(
      base([
        makeTrip({ date: '2026-09-02', km_total: 20 }),
        makeTrip({ date: '2026-09-10', km_total: 12.5, activite: 'lmnp' }),
        makeTrip({ date: '2026-09-10', km_total: 30 }),
        makeTrip({ date: '2026-08-30', km_total: 99 }),
      ]),
      '2026-09-15',
    )
    expect(s.parActivite).toEqual({ swing_house: { nb: 2, km: 50 }, lmnp: { nb: 1, km: 12.5 } })
    expect(s.jours.map(([d]) => d)).toEqual(['2026-09-10', '2026-09-02'])
  })
  it('signale le mois précédent non exporté, les brouillons et la configuration manquante', () => {
    const s = homeSummary(
      base([makeTrip({ date: '2026-08-30' }), makeTrip({ date: '2026-09-01', statut: 'brouillon' })], { vehicles: [] }),
      '2026-09-15',
    )
    expect(s.nonExportes).toEqual(['swing_house'])
    expect(s.brouillons).toBe(1)
    expect(s.aConfigurer).toBe(true)
  })
})

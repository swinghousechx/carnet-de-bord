import { describe, expect, it } from 'vitest'
import type { AppData } from '../hooks/useData'
import { makeExport, makePlace, makeTrip, makeVehicle } from '../test/fixtures'
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

  it('ignore le mois précédent déjà exporté même avec un trajet oublié (pas de faux positif)', () => {
    const s = homeSummary(
      base([makeTrip({ date: '2026-08-20' })], {
        exports: [makeExport({ activite: 'swing_house', mois: '2026-08', statut: 'emis', version: 1 })],
      }),
      '2026-09-15',
    )
    expect(s.nonExportes).toEqual([])
  })

  it('signale un trajet rouvert dans un export à rectifier', () => {
    const exp = makeExport({ activite: 'swing_house', mois: '2026-08', statut: 'a_rectifier', version: 1 })
    const s = homeSummary(
      base([makeTrip({ date: '2026-08-20', statut: 'valide', export_id: null })], { exports: [exp] }),
      '2026-09-15',
    )
    expect(s.nonExportes).toEqual(['swing_house'])
  })

  it("ne signale pas un trajet dont le statut est 'exporte'", () => {
    const exp = makeExport({ activite: 'swing_house', mois: '2026-08', statut: 'emis', version: 1 })
    const s = homeSummary(
      base([makeTrip({ date: '2026-08-20', statut: 'exporte', export_id: exp.id })], { exports: [exp] }),
      '2026-09-15',
    )
    expect(s.nonExportes).toEqual([])
  })

  it('gère la frontière janvier → décembre de l’année précédente', () => {
    const s = homeSummary(base([makeTrip({ date: '2025-12-20', activite: 'lmnp' })]), '2026-01-15')
    expect(s.nonExportes).toEqual(['lmnp'])
  })

  it('aConfigurer : faux si véhicule et domicile présents, vrai si le domicile seul manque', () => {
    const complet = homeSummary(base([]), '2026-09-15')
    expect(complet.aConfigurer).toBe(false)
    const sansDomicile = homeSummary(base([], { places: [] }), '2026-09-15')
    expect(sansDomicile.aConfigurer).toBe(true)
  })

  it('expose les brouillons antérieurs au mois en cours pour un accès direct', () => {
    const vieux = makeTrip({ date: '2026-07-05', statut: 'brouillon', motif: 'Vieux brouillon oublié depuis juillet' })
    const s = homeSummary(base([vieux, makeTrip({ date: '2026-09-05', statut: 'brouillon' })]), '2026-09-15')
    expect(s.brouillonsAnciens.map((t) => t.id)).toEqual([vieux.id])
    expect(s.brouillons).toBe(2)
  })
})

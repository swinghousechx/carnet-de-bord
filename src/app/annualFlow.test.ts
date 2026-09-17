import { describe, expect, it } from 'vitest'
import { computeAll } from '../domain/chain'
import type { AppData } from '../hooks/useData'
import { defaultBareme, makeExport, makeTrip, makeVehicle } from '../test/fixtures'
import { annualButtonLabel, annualCardStatus, prepareAnnual } from './annualFlow'

const { year, rates } = defaultBareme()
const app = (o: Partial<AppData> = {}): AppData => ({
  trips: [], expenses: [], vehicles: [makeVehicle({ id: 'veh-A' })], fiscalYears: [], baremeYears: [year], rates, places: [], exports: [], ...o,
})

describe('vue annuelle du récap', () => {
  const e = makeExport({ id: 'e1', mois: '2026-03' })
  const a = app({
    trips: [
      makeTrip({ date: '2026-03-10', km_total: 100, statut: 'exporte', export_id: 'e1', montant_bareme: 63.6 }),
      makeTrip({ date: '2026-09-10', km_total: 100 }),
      makeTrip({ date: '2026-09-11', km_total: 50, statut: 'brouillon' }),
      makeTrip({ date: '2025-09-11', km_total: 50 }),
    ],
    exports: [e],
  })
  const d = prepareAnnual(a, computeAll(a), 'swing_house', 2026, 'x')

  it('carte : trajets comptés, distance, indemnités (figé + calculé), aucun réseau', () => {
    expect(d.totaux).toEqual({ nb_trajets: 2, km: 200, indemnite: 127.2 }) // 63,6 figé + (f(200) − 63,6) calculé
  })

  it('ligne d’état : mois exportés, trajets non exportés et brouillons (en alerte) seulement s’ils existent', () => {
    expect(annualCardStatus(d)).toEqual({ mois: '1 mois exporté(s) sur 2', alertes: ['1 trajet(s) non encore exporté(s)', '1 brouillon(s)'] })
    const tout = prepareAnnual(app({ trips: [a.trips[0]], exports: [e] }), computeAll(app({ trips: [a.trips[0]], exports: [e] })), 'swing_house', 2026, 'x')
    expect(annualCardStatus(tout)).toEqual({ mois: '1 mois exporté(s) sur 1', alertes: [] })
  })

  it('aucun trajet compté : pas de « 0 mois exporté(s) sur 0 »', () => {
    const vide = app()
    expect(annualCardStatus(prepareAnnual(vide, computeAll(vide), 'lmnp', 2026, 'x'))).toEqual({ mois: null, alertes: [] })
  })

  it('bouton court (tient sur une ligne à 375 px), l’activité est dans l’en-tête de la carte', () => {
    expect(annualButtonLabel(2026)).toBe('Exporter le récapitulatif 2026')
  })
})

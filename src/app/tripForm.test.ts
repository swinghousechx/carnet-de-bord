import { describe, expect, it } from 'vitest'
import type { AppData } from '../hooks/useData'
import { makePlace, makeTrip, makeVehicle } from '../test/fixtures'
import { makeExpense } from '../test/fixtures'
import { draftFooter, emptyTrip, expenseChanges, finalizeTrip, nextStepPrefill, recentMotifs } from './tripForm'

const dom = makePlace({ id: 'p-dom', role: 'domicile', adresse: '74310 Servoz' })
const sh = makePlace({ id: 'p-sh', role: 'swing_house', adresse: 'Chamonix' })
const data = (o: Partial<AppData> = {}): AppData => ({
  trips: [], expenses: [], vehicles: [makeVehicle({ id: 'veh-A' })], fiscalYears: [], baremeYears: [], rates: [],
  places: [dom, sh], exports: [], ...o,
})

describe('tripForm', () => {
  it('nouveau trajet : date du jour, départ Domicile, dernière activité utilisée', () => {
    const d = data({ trips: [makeTrip({ activite: 'lmnp', created_at: '2026-09-14T08:00:00.000Z' })] })
    const t = emptyTrip(d, '2026-09-15')
    expect(t).toMatchObject({ date: '2026-09-15', activite: 'lmnp', depart_place_id: 'p-dom', depart_label: 'Domicile', depart_adresse: '74310 Servoz', statut: 'brouillon' })
  })
  it('le pré-remplissage « étape suivante » part de l’arrivée précédente', () => {
    const prev = makeTrip({ arrivee_place_id: 'p-sh', arrivee_label: 'Swing House', arrivee_adresse: 'Chamonix', date: '2026-09-15', activite: 'swing_house' })
    const t = emptyTrip(data(), '2026-09-16', nextStepPrefill(prev))
    expect(t).toMatchObject({ date: '2026-09-15', activite: 'swing_house', depart_place_id: 'p-sh', depart_label: 'Swing House', arrivee_place_id: null })
  })
  it('finalizeTrip : véhicule, km total, nature et statut', () => {
    const f = makeTrip({ depart_place_id: 'p-dom', arrivee_place_id: 'p-sh', km_route: 14.2, aller_retour: true, vehicle_id: null, nature: null, statut: 'brouillon' })
    const t = finalizeTrip(f, data())
    expect(t).toMatchObject({ vehicle_id: 'veh-A', km_total: 28.4, nature: null, statut: 'brouillon' })
    expect(finalizeTrip({ ...f, nature: 'domicile_travail' }, data()).statut).toBe('valide')
    expect(finalizeTrip({ ...f, arrivee_place_id: 'p-client' }, data()).nature).toBe('pro')
  })
  it('motifs récents distincts, du plus récent au plus ancien', () => {
    const trips = [
      makeTrip({ motif: 'Réunion comptable annuelle', created_at: '2026-09-01T00:00:00.000Z' }),
      makeTrip({ motif: 'Livraison matériel TrackMan', created_at: '2026-09-10T00:00:00.000Z' }),
      makeTrip({ motif: 'Réunion comptable annuelle', created_at: '2026-09-12T00:00:00.000Z' }),
    ]
    expect(recentMotifs(trips, 'x')).toEqual(['Réunion comptable annuelle', 'Livraison matériel TrackMan'])
  })
})

describe('expenseChanges', () => {
  const existant = makeExpense({ id: 'e-old', trip_id: 't1', montant: 12 })
  const nouveau = makeExpense({ id: 'e-new', trip_id: 't1', montant: 0 })

  it('montant d’une dépense existante effacé → suppression (logique), pas de conservation de l’ancien montant', () => {
    const r = expenseChanges([existant], { 'e-old': '' }, [], new Set(['e-old']), 't1')
    expect(r).toEqual({ save: [], remove: ['e-old'] })
    expect(expenseChanges([existant], { 'e-old': '0' }, [], new Set(['e-old']), 't1')).toEqual({ save: [], remove: ['e-old'] })
  })
  it('montant valide → enregistré (virgule acceptée) ; nouvelle ligne vide → ignorée', () => {
    const r = expenseChanges([existant, nouveau], { 'e-old': '7,50', 'e-new': '' }, [], new Set(['e-old']), 't1')
    expect(r.remove).toEqual([])
    expect(r.save).toEqual([{ ...existant, montant: 7.5 }])
  })
  it('lignes retirées : supprimées une seule fois', () => {
    const r = expenseChanges([], {}, ['e-old', 'e-old'], new Set(['e-old']), 't1')
    expect(r).toEqual({ save: [], remove: ['e-old'] })
  })
})

describe('draftFooter', () => {
  it('pas de double point quand un motif se termine déjà par un point', () => {
    expect(draftFooter(['Motif trop court (12 caractères minimum) : qui, quoi, où.'])).toBe(
      'Brouillon : Motif trop court (12 caractères minimum) : qui, quoi, où.',
    )
    expect(draftFooter(['Départ manquant', 'Km non calculés'])).toBe('Brouillon : Départ manquant · Km non calculés.')
    expect(draftFooter([])).toBe('Brouillon : à finir plus tard.')
  })
})

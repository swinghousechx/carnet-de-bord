import { describe, expect, it } from 'vitest'
import { makeFiscalYear, makePlace, makeTrip, makeVehicle } from '../test/fixtures'
import {
  computeStatut, findDuplicate, fiscalSettings, isDomicileTravailCandidate, kmTotal,
  missingReasons, resolveVehicle, tripCounts, validateMotif,
} from './rules'

const ancienne = makeVehicle({ id: 'veh-A', date_debut: '2020-01-01', date_fin: '2026-12-14' })
const nouvelle = makeVehicle({ id: 'veh-B', date_debut: '2026-12-15', date_fin: null })
const dom = makePlace({ id: 'p-dom', role: 'domicile' })
const sh = makePlace({ id: 'p-sh', role: 'swing_house' })
const client = makePlace({ id: 'p-client' })
const ctx = { vehicles: [ancienne, nouvelle], places: [dom, sh, client] }

describe('resolveVehicle', () => {
  it('choisit le véhicule actif à la date, bornes incluses', () => {
    expect(resolveVehicle('2026-12-14', ctx.vehicles)?.id).toBe('veh-A')
    expect(resolveVehicle('2026-12-15', ctx.vehicles)?.id).toBe('veh-B')
    expect(resolveVehicle('2019-06-01', ctx.vehicles)).toBeNull()
  })
  it('ignore les véhicules supprimés', () => {
    expect(resolveVehicle('2027-01-01', [{ ...nouvelle, deleted_at: 'x' }])).toBeNull()
  })
})

describe('kmTotal', () => {
  it('prend le km saisi en priorité et double l\'aller-retour', () => {
    expect(kmTotal(12.3, null, false)).toBe(12.3)
    expect(kmTotal(12.3, null, true)).toBe(24.6)
    expect(kmTotal(12.3, 14, true)).toBe(28)
    expect(kmTotal(null, null, true)).toBeNull()
  })
})

describe('validateMotif', () => {
  it('refuse trop court', () => {
    expect(validateMotif('  Client X ')).not.toBeNull()
  })
  it('refuse les motifs génériques même longs', () => {
    expect(validateMotif('Déplacement professionnel')).not.toBeNull()
    expect(validateMotif('déplacement pro !!')).not.toBeNull()
  })
  it('accepte un motif précis', () => {
    expect(validateMotif('Réunion fournisseur TrackMan à Annecy')).toBeNull()
  })
})

describe('domicile–travail', () => {
  it('ne concerne que Swing House entre domicile et Swing House, dans les deux sens', () => {
    expect(isDomicileTravailCandidate('swing_house', 'domicile', 'swing_house')).toBe(true)
    expect(isDomicileTravailCandidate('swing_house', 'swing_house', 'domicile')).toBe(true)
    expect(isDomicileTravailCandidate('lmnp', 'domicile', 'swing_house')).toBe(false)
    expect(isDomicileTravailCandidate('swing_house', 'domicile', 'lmnp')).toBe(false)
  })
  it('exclu par défaut, compté si le réglage de l\'année l\'inclut', () => {
    const t = makeTrip({ nature: 'domicile_travail' })
    expect(tripCounts(t, fiscalSettings(2026, 'swing_house', []))).toBe(false)
    const fy = makeFiscalYear({ inclure_domicile_travail: true })
    expect(tripCounts(t, fiscalSettings(2026, 'swing_house', [fy]))).toBe(true)
  })
  it('mode frais réels : aucun trajet ne compte au barème', () => {
    const fy = makeFiscalYear({ mode: 'frais_reels' })
    expect(tripCounts(makeTrip(), fiscalSettings(2026, 'swing_house', [fy]))).toBe(false)
  })
})

describe('statut', () => {
  it('trajet complet → valide', () => {
    expect(computeStatut(makeTrip({ statut: 'brouillon' }), ctx)).toBe('valide')
  })
  it('km non calculés → brouillon', () => {
    const t = makeTrip({ km_route: null, km_total: null, statut: 'brouillon' })
    expect(missingReasons(t, ctx)).toContain('Km non calculés')
    expect(computeStatut(t, ctx)).toBe('brouillon')
  })
  it('km corrigé sans justification → brouillon', () => {
    const t = makeTrip({ km_saisi: 14, km_total: 14 })
    expect(missingReasons(t, ctx)).toContain('Justification des km corrigés manquante')
  })
  it('question domicile–travail sans réponse → brouillon', () => {
    const t = makeTrip({ depart_place_id: 'p-dom', arrivee_place_id: 'p-sh', nature: null })
    expect(missingReasons(t, ctx)).toContain('Préciser : trajet domicile–travail ou déplacement pro')
  })
  it('aucun véhicule à la date → brouillon', () => {
    expect(missingReasons(makeTrip({ date: '2019-01-01' }), ctx)).toContain('Aucun véhicule à cette date')
  })
  it('« Finir plus tard » force le brouillon ; exporté reste exporté', () => {
    expect(computeStatut(makeTrip({ brouillon_force: true }), ctx)).toBe('brouillon')
    expect(computeStatut(makeTrip({ statut: 'exporte', km_total: null }), ctx)).toBe('exporte')
  })
})

describe('findDuplicate', () => {
  it('même date, activité, départ et arrivée', () => {
    const a = makeTrip()
    const b = makeTrip()
    expect(findDuplicate(b, [a, b])?.id).toBe(a.id)
    expect(findDuplicate(makeTrip({ date: '2026-09-16' }), [a])).toBeNull()
    expect(findDuplicate(makeTrip({ activite: 'lmnp' }), [a])).toBeNull()
    expect(findDuplicate(b, [{ ...a, deleted_at: 'x' }, b])).toBeNull()
  })
})

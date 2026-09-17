import { describe, expect, it } from 'vitest'
import { computeAll, type CalcData } from '../domain/chain'
import { defaultBareme, makeExpense, makeTrip, makeVehicle } from '../test/fixtures'
import { buildExportData, rpcTripsPayload } from './build'

const { year, rates } = defaultBareme()
const v = makeVehicle({ id: 'veh-A', nom: 'Golf', immatriculation: 'AB-123-CD', cv: 5 })
const avant = makeTrip({ km_total: 200, date: '2026-07-01', statut: 'exporte', montant_bareme: 127.2, export_id: 'e7' })
const aout = makeTrip({ km_total: 100, date: '2026-08-30' })
const sept = makeTrip({ km_total: 50, date: '2026-09-10', motif: 'Visite fournisseur simulateurs à Annecy' })
const dt = makeTrip({ km_total: 30, date: '2026-09-11', nature: 'domicile_travail' })
const expenses = [makeExpense({ trip_id: sept.id, type: 'peage', montant: 4.6, note: 'A40' })]
const data: CalcData = { trips: [avant, aout, sept, dt], expenses, vehicles: [v], fiscalYears: [], baremeYears: [year], rates }
const calc = computeAll(data)
const d = buildExportData({
  activite: 'swing_house', mois: '2026-09', version: 1, selection: [aout, sept, dt], data, calc, genere_le: '2026-10-01',
})

describe('buildExportData', () => {
  it("sépare les lignes remboursables et le « pour mémoire » domicile–travail", () => {
    expect(d.lignes.map((l) => l.trip_id)).toEqual([aout.id, sept.id])
    expect(d.pourMemoire.map((l) => l.trip_id)).toEqual([dt.id])
    expect(d.pourMemoire[0].montant_bareme).toBe(0)
  })
  it('marque les rattrapages avec leur mois d’origine', () => {
    expect(d.lignes[0].rattrapage).toBe('août 2026')
    expect(d.lignes[1].rattrapage).toBeNull()
  })
  it('totaux : indemnités seules, frais à 0 (clé conservée pour le contrôle serveur)', () => {
    expect(d.lignes[1]).not.toHaveProperty('frais')
    expect(d.lignes[1]).not.toHaveProperty('frais_detail')
    expect(d.totaux).toEqual({
      km: 150, bareme: 95.4, frais: 0, total: 95.4, nb_trajets: 2,
      cumuls: [{ vehicle_id: 'veh-A', avant: 300, apres: 350 }],
    })
  })
  it('en-tête : titre, véhicule et cumul annuel avant/après le mois', () => {
    expect(d.titre).toBe('Swing House SAS — Note de frais kilométriques')
    expect(d.vehicules).toEqual([
      { nom: 'Golf', immatriculation: 'AB-123-CD', cv: 5, energie: 'thermique', cumulAvant: 300, cumulApres: 350 },
    ])
    expect(d.bareme_annee).toBe(2026)
    expect(d.bareme_provisoire).toBe(false)
  })
  it('un péage déjà enregistré (ligne trip_expenses existante) ne change aucune ligne ni aucun total', () => {
    const sansFrais: CalcData = { ...data, expenses: [] }
    const d2 = buildExportData({
      activite: 'swing_house', mois: '2026-09', version: 1, selection: [aout, sept, dt], data: sansFrais, calc: computeAll(sansFrais), genere_le: '2026-10-01',
    })
    expect(d).toEqual(d2)
    expect(rpcTripsPayload(d)).toEqual(rpcTripsPayload(d2))
  })
  it('payload RPC : toutes les lignes, pour mémoire compris', () => {
    expect(rpcTripsPayload(d)).toEqual([
      { id: aout.id, montant_bareme: 63.6 },
      { id: sept.id, montant_bareme: 31.8 },
      { id: dt.id, montant_bareme: 0 },
    ])
  })
  it('détecte quand un barème est indisponible', () => {
    // Jeu sain : pas de drapeau
    expect(d.bareme_indisponible).toBe(false)

    // Jeu avec barème indisponible
    const calcAvecProbleme = new Map(calc)
    const calc_aout = calcAvecProbleme.get(aout.id)
    if (calc_aout) {
      calcAvecProbleme.set(aout.id, { ...calc_aout, bareme_indisponible: true })
    }
    const d_broken = buildExportData({
      activite: 'swing_house', mois: '2026-09', version: 1, selection: [aout, sept, dt], data, calc: calcAvecProbleme, genere_le: '2026-10-01',
    })
    expect(d_broken.bareme_indisponible).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { prepareExport } from '../app/exportFlow'
import { baremeAmount, selectRateSet } from '../domain/bareme'
import { computeAll } from '../domain/chain'
import type { Activite, ExportRecord, Trip } from '../domain/types'
import type { AppData } from '../hooks/useData'
import { yearOf } from '../lib/dates'
import { round2 } from '../lib/format'
import { defaultBareme, makeExport, makeFiscalYear, makeTrip, makeVehicle } from '../test/fixtures'
import {
  ANNUAL_CSV_COLUMNS, annualEntete, annualPdfTables, buildAnnualData, DOC_SYNTHESE, provisoireMention, renderAnnualPdf,
  TITRES_ANNUELS, type AnnualData,
} from './annual'
import { toCsv } from './csv'
import { annualFileName } from './filenames'
import { latestExport } from './select'

const { year, rates } = defaultBareme()
const vA = makeVehicle({ id: 'veh-A', nom: 'Golf', immatriculation: 'AB-123-CD', cv: 5, date_debut: '2020-01-01', date_fin: '2026-06-30' })
const vB = makeVehicle({ id: 'veh-B', nom: 'Model 3', immatriculation: 'EF-456-GH', cv: 7, date_debut: '2026-07-01' })

const app = (o: Partial<AppData> = {}): AppData => ({
  trips: [], expenses: [], vehicles: [vA, vB], fiscalYears: [], baremeYears: [year], rates, places: [], exports: [], ...o,
})

let seq = 0
// Reproduit export_month côté client : fige les montants de l'aperçu, crée l'enregistrement,
// passe l'éventuelle version précédente à « remplace ».
function exporter(a: AppData, activite: Activite, mois: string): AppData {
  const p = prepareExport(a, computeAll(a), activite, mois, 'x')
  if (!p.prepared || p.blocked) throw new Error(p.blocked ?? 'rien à exporter')
  const id = `exp-${++seq}`
  const montants = new Map(p.prepared.payload.map((l) => [l.id, l.montant_bareme]))
  const last = latestExport(a.exports, activite, mois)
  const rec = makeExport({
    id, activite, mois, version: p.prepared.data.version, statut: 'emis', totaux: p.prepared.data.totaux,
    bareme_annee: p.prepared.data.bareme_annee, bareme_provisoire: p.prepared.data.bareme_provisoire, trip_ids: [...montants.keys()],
  })
  return {
    ...a,
    trips: a.trips.map((t) => (montants.has(t.id) ? { ...t, statut: 'exporte', export_id: id, montant_bareme: montants.get(t.id)! } : t)),
    exports: [...a.exports.map((e): ExportRecord => (e.id === last?.id ? { ...e, statut: 'remplace' } : e)), rec],
  }
}

// Reproduit reopen_trip, avec une modification éventuelle du trajet rouvert.
function rouvrir(a: AppData, tripId: string, patch: Partial<Trip> = {}): AppData {
  const t = a.trips.find((x) => x.id === tripId)!
  return {
    ...a,
    trips: a.trips.map((x) => (x.id === tripId ? { ...x, ...patch, statut: 'valide', export_id: null, montant_bareme: 0 } : x)),
    exports: a.exports.map((e): ExportRecord => (e.id === t.export_id ? { ...e, statut: 'a_rectifier' } : e)),
  }
}

// Somme des notes mensuelles en vigueur (émises) de l'année, « remplace » ignorées.
const emisTotal = (a: AppData, activite: Activite, annee: number) =>
  round2(a.exports.filter((e) => e.statut === 'emis' && e.activite === activite && yearOf(e.mois) === annee).reduce((s, e) => s + e.totaux.bareme, 0))

const annual = (a: AppData, activite: Activite = 'swing_house', annee = 2026) =>
  buildAnnualData({ activite, annee, data: a, calc: computeAll(a), genere_le: '2026-12-31T10:00:00.000Z' })

const t1 = makeTrip({ id: 't1', date: '2026-03-10', km_total: 3000, vehicle_id: 'veh-A' })
const t2 = makeTrip({ id: 't2', date: '2026-03-20', km_total: 500, vehicle_id: 'veh-A', nature: 'domicile_travail', motif: 'Trajet domicile vers la Swing House' })
const t3 = makeTrip({ id: 't3', date: '2026-05-05', km_total: 4000, vehicle_id: 'veh-A' })
const t4 = makeTrip({ id: 't4', date: '2026-08-01', km_total: 1000, vehicle_id: 'veh-B' })
const t5 = makeTrip({ id: 't5', date: '2026-09-10', km_total: 200, vehicle_id: 'veh-B' })
const lmnp = makeTrip({ id: 'l1', date: '2026-09-11', km_total: 50, vehicle_id: 'veh-B', activite: 'lmnp' })

// Mars v1, mai, réouverture de mars (km corrigés 3000 → 2500) et v2, août. Septembre non exporté.
function scenario(extra: Trip[] = []): AppData {
  let a = app({ trips: [t1, t2, t3, t4, t5, lmnp, ...extra] })
  a = exporter(a, 'swing_house', '2026-03')
  a = exporter(a, 'swing_house', '2026-05')
  a = rouvrir(a, 't1', { km_total: 2500, km_route: 2500 })
  a = exporter(a, 'swing_house', '2026-03')
  a = exporter(a, 'swing_house', '2026-08')
  return a
}

describe('buildAnnualData — invariant de cohérence avec les notes mensuelles', () => {
  it('année partiellement exportée (rectificatif v2, domicile–travail exclu, brouillon) : Σ notes émises + calculé non exporté', () => {
    const brouillon = makeTrip({ id: 'b1', date: '2026-09-12', km_total: 100, vehicle_id: 'veh-B', statut: 'brouillon' })
    const a = scenario([brouillon])
    expect(a.exports.map((e) => [e.mois, e.version, e.statut])).toEqual([
      ['2026-03', 1, 'remplace'], ['2026-05', 1, 'emis'], ['2026-03', 2, 'emis'], ['2026-08', 1, 'emis'],
    ])
    const calc = computeAll(a)
    const d = annual(a)
    expect(d.totaux.indemnite).toBe(round2(emisTotal(a, 'swing_house', 2026) + calc.get('t5')!.montant_bareme))
    expect(d.lignes.map((l) => l.trip_id)).toEqual(['t1', 't3', 't4', 't5']) // brouillon exclu, trié par date
    expect(d.pourMemoire.map((l) => l.trip_id)).toEqual(['t2'])
    expect(d.pourMemoire[0].montant_bareme).toBe(0)
    expect(d.totaux).toMatchObject({ nb_trajets: 4, km: 7700 })
    expect(d).toMatchObject({ nonExportes: 1, brouillons: 1, moisExportes: 3, moisTotal: 4 })
    expect(d.lignes.map((l) => l.statut)).toEqual(['Exporté v2', 'Exporté v1', 'Exporté v1', 'Non exporté'])
  })

  it('année entièrement exportée : Σ notes émises = Σ des groupes round2(f(D))', () => {
    const a = exporter(scenario(), 'swing_house', '2026-09')
    const d = annual(a)
    const set = selectRateSet(2026, [year], rates)!
    const f = (D: number, cv: number) => round2(baremeAmount(D, cv, 'thermique', set))
    const groupes = round2(f(2500 + 4000, 5) + f(1000 + 200, 7)) // veh-A (t2 exclu) + veh-B
    expect(groupes).toBe(4551.9) // 3715,5 + 836,4
    expect(d.totaux.indemnite).toBe(emisTotal(a, 'swing_house', 2026))
    expect(d.totaux.indemnite).toBe(groupes)
    expect(d).toMatchObject({ nonExportes: 0, brouillons: 0, moisExportes: 4, moisTotal: 4 })
    expect(provisoireMention(d)).toBeNull()
  })

  it('activités jamais mélangées', () => {
    const d = annual(scenario(), 'lmnp')
    expect(d.lignes.map((l) => l.trip_id)).toEqual(['l1'])
    expect(d.titre).toBe(TITRES_ANNUELS.lmnp(2026))
  })

  it('rattrapage d’une autre année : le trajet compte dans l’année de sa date, avec la note qui l’a verrouillé', () => {
    const y2025 = { ...year, id: 'by-2025', annee: 2025 }
    const r2025 = rates.map((r) => ({ ...r, id: `${r.id}-2025`, annee: 2025 }))
    const dec = makeTrip({ id: 'dec', date: '2025-12-20', km_total: 100, vehicle_id: 'veh-A' })
    let a = app({ trips: [dec], baremeYears: [y2025, year], rates: [...r2025, ...rates] })
    a = exporter(a, 'swing_house', '2026-01')
    expect(annual(a, 'swing_house', 2026).lignes).toEqual([])
    const d2025 = annual(a, 'swing_house', 2025)
    expect(d2025.lignes.map((l) => [l.trip_id, l.statut])).toEqual([['dec', 'Exporté v1 (note de janvier 2026)']])
    expect(d2025.totaux.indemnite).toBe(63.6)
  })
})

describe('récapitulatif annuel — contenu', () => {
  const brouillon = makeTrip({ id: 'b1', date: '2026-09-12', km_total: 100, vehicle_id: 'veh-B', statut: 'brouillon' })
  const d: AnnualData = annual(scenario([brouillon]))

  it('titres et mentions', () => {
    expect(TITRES_ANNUELS.swing_house(2026)).toBe('Swing House SAS — Récapitulatif annuel des indemnités kilométriques 2026')
    expect(TITRES_ANNUELS.lmnp(2026)).toBe('LMNP Nid de l’Aiguille (EI) — Récapitulatif annuel des frais de déplacement 2026')
    expect(DOC_SYNTHESE).toBe('Document de synthèse : ne remplace pas les notes mensuelles exportées.')
    expect(provisoireMention(d)).toBe('Provisoire : 1 trajet(s) non encore exporté(s), 1 brouillon(s) exclus.')
    const entete = annualEntete(d)
    expect(entete.slice(0, 2)).toEqual([DOC_SYNTHESE, 'Provisoire : 1 trajet(s) non encore exporté(s), 1 brouillon(s) exclus.'])
    expect(entete).toContain('Véhicule : Golf - AB-123-CD - 5 CV - thermique')
    expect(entete).toContain('Véhicule : Model 3 - EF-456-GH - 7 CV - thermique')
    expect(entete).toContain('Barème kilométrique 2026')
    expect(entete).toContain('Péages et parkings non inclus : réglés directement par l’entreprise.')
    expect(entete.join('\n')).not.toMatch(/\btu\b|\bte\b/)
  })

  it('mode frais réels mentionné', () => {
    const a = app({ trips: [t5], fiscalYears: [makeFiscalYear({ mode: 'frais_reels' })] })
    const reel = annual(a)
    expect(reel.mode).toBe('frais_reels')
    expect(annualEntete(reel).join('\n')).toMatch(/frais réels/)
    expect(reel.totaux.indemnite).toBe(0)
  })

  it('PDF : sous-totaux par mois, total annuel, sous-totaux par véhicule (plus d’un véhicule)', () => {
    const [principal, vehicules] = annualPdfTables(d)
    expect(principal.head).toEqual(['Date', 'Motif', 'Trajet', 'Km', 'Indemnité', 'Statut'])
    const sousTotaux = principal.body.filter((r) => typeof r[0] !== 'string').map((r) => r.map((c) => (typeof c === 'string' ? c : c.content)))
    expect(sousTotaux).toEqual([
      ['Sous-total mars 2026', '1 trajet(s)', '', '2500,0', '1 729,50 €', ''],
      ['Sous-total mai 2026', '1 trajet(s)', '', '4000,0', '1 986,00 €', ''],
      ['Sous-total août 2026', '1 trajet(s)', '', '1000,0', '697,00 €', ''],
      ['Sous-total septembre 2026', '1 trajet(s)', '', '200,0', '139,40 €', ''],
    ])
    expect(principal.foot).toEqual(['Total 2026', '4 trajet(s)', '', '7700,0', '4 551,90 €', ''])
    expect(vehicules.head).toEqual(['Véhicule', 'Trajets', 'Km', 'Indemnité'])
    expect(vehicules.body).toEqual([
      ['Golf (AB-123-CD, 5 CV)', '2', '6500,0', '3 715,50 €'],
      ['Model 3 (EF-456-GH, 7 CV)', '2', '1200,0', '836,40 €'],
    ])
    // Un seul véhicule : pas de tableau par véhicule.
    expect(annualPdfTables(annual(app({ trips: [t5] })))).toHaveLength(1)
  })

  it('PDF généré', async () => {
    const blob = renderAnnualPdf(d)
    expect(blob.type).toBe('application/pdf')
    expect(new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-')
  })

  it('CSV : colonnes mensuelles + Mois et Statut, une ligne par trajet', () => {
    expect(ANNUAL_CSV_COLUMNS.map((c) => c.header)).toEqual([
      'Mois', 'Date', 'Activité', 'Motif', 'Départ', 'Arrivée', 'Aller-retour', 'Km', 'Correction km', 'Véhicule', 'Indemnité (€)', 'Nature', 'Statut',
    ])
    const rows = toCsv(d, ANNUAL_CSV_COLUMNS).slice(1).trimEnd().split('\r\n')
    expect(rows).toHaveLength(1 + 4 + 1)
    expect(rows[1]).toMatch(/^mars 2026;10\/03\/2026;Swing House;.*;1729,50;Déplacement professionnel;Exporté v2$/)
    expect(rows[5]).toMatch(/^mars 2026;20\/03\/2026;.*;0,00;Domicile–travail \(non remboursé\);Exporté v2$/)
  })

  it('noms de fichiers', () => {
    expect(annualFileName({ activite: 'swing_house', annee: 2026 }, 'pdf')).toBe('carnet-swing-house-2026-recap-annuel.pdf')
    expect(annualFileName({ activite: 'lmnp', annee: 2026 }, 'csv')).toBe('carnet-lmnp-2026-recap-annuel.csv')
  })
})

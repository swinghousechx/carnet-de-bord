// Récapitulatif annuel par activité : document de synthèse, qui ne verrouille rien (aucun RPC,
// aucun réseau). Les notes mensuelles restent les seuls documents qui figent les montants.
//
// Invariant (testé) : indemnité annuelle = Σ des notes mensuelles émises de l'année (versions en
// vigueur) + montants calculés des trajets validés pas encore exportés. Les trajets sont rattachés à
// l'année de leur DATE (comme la chaîne du barème) : un trajet de décembre exporté en rattrapage
// dans la note de janvier figure dans le récapitulatif de son année, avec la note qui l'a figé.
import { BENEFICIAIRE } from '../config'
import { byChainOrder, type CalcData, type TripCalc } from '../domain/chain'
import { fiscalSettings } from '../domain/rules'
import { ACTIVITE_LABEL, type Activite, type Energie, type ExportRecord, type ModeFiscal } from '../domain/types'
import { monthOf, yearOf } from '../lib/dates'
import { decimalFr, formatEuro, formatMoisLong, round1, round2 } from '../lib/format'
import { FRAIS_NON_INCLUS, isPourMemoire, toLigneExport, type LigneExport } from './build'
import { CSV_COLUMNS, type CsvColumn } from './columns'
import {
  baremeTexte, FRAIS_REELS_PDF, renderDocument, trajetCells, vehiculeTexte, type PdfCell, type PdfTable,
} from './pdf'

export const TITRES_ANNUELS: Record<Activite, (annee: number) => string> = {
  swing_house: (annee) => `Swing House SAS — Récapitulatif annuel des indemnités kilométriques ${annee}`,
  lmnp: (annee) => `LMNP Nid de l’Aiguille (EI) — Récapitulatif annuel des frais de déplacement ${annee}`,
}

export const DOC_SYNTHESE = 'Document de synthèse : ne remplace pas les notes mensuelles exportées.'

export interface LigneAnnuelle extends LigneExport {
  mois: string // mois de la date du trajet (YYYY-MM)
  exporte: boolean
  statut: string // « Exporté v2 », « Exporté v1 (note de janvier 2027) », « Non exporté »
}

export interface SousTotal {
  nb: number
  km: number
  indemnite: number
}

export interface VehiculeAnnuel extends SousTotal {
  vehicle_id: string
  libelle: string // « Golf (AB-123-CD, 5 CV) »
  nom: string
  immatriculation: string
  cv: number
  energie: Energie
}

export interface AnnualData {
  activite: Activite
  annee: number
  titre: string
  beneficiaire: string
  mode: ModeFiscal
  lignes: LigneAnnuelle[] // trajets comptés (validés ou exportés), triés par date
  pourMemoire: LigneAnnuelle[] // domicile–travail exclus : listés, non comptés, 0 €
  totaux: { nb_trajets: number; km: number; indemnite: number }
  parMois: ({ mois: string } & SousTotal)[]
  vehicules: VehiculeAnnuel[]
  baremes: { annee: number | null; provisoire: boolean }[]
  nonExportes: number // trajets validés pas encore exportés (pour mémoire compris)
  brouillons: number // exclus des lignes et des totaux
  moisExportes: number // mois (ayant des trajets comptés) dont tous les trajets comptés sont exportés
  moisTotal: number
  bareme_indisponible: boolean
  montant_negatif: boolean
  genere_le: string
}

export interface AnnualArgs {
  activite: Activite
  annee: number
  data: CalcData & { exports: ExportRecord[] }
  calc: Map<string, TripCalc>
  genere_le: string
}

const sousTotal = (lignes: LigneExport[]): SousTotal => ({
  nb: lignes.length,
  km: round1(lignes.reduce((s, l) => s + l.km, 0)),
  indemnite: round2(lignes.reduce((s, l) => s + l.montant_bareme, 0)),
})

export function buildAnnualData(a: AnnualArgs): AnnualData {
  const trips = a.data.trips
    .filter((t) => !t.deleted_at && t.activite === a.activite && yearOf(t.date) === a.annee)
    .sort(byChainOrder)
  const vehicles = new Map(a.data.vehicles.map((v) => [v.id, v]))
  const exports = new Map(a.data.exports.map((e) => [e.id, e]))
  const ctx = { calc: a.calc, vehicles, fiscalYears: a.data.fiscalYears }

  const lignes: LigneAnnuelle[] = []
  const pourMemoire: LigneAnnuelle[] = []
  let brouillons = 0
  for (const t of trips) {
    if (t.statut === 'brouillon') {
      brouillons++
      continue
    }
    const exporte = t.statut === 'exporte'
    const rec = exporte && t.export_id ? exports.get(t.export_id) : undefined
    const note = rec && rec.mois !== monthOf(t.date) ? ` (note de ${formatMoisLong(rec.mois)})` : ''
    const ligne: LigneAnnuelle = {
      ...toLigneExport(t, ctx, null),
      mois: monthOf(t.date),
      exporte,
      statut: exporte ? `Exporté${rec ? ` v${rec.version}` : ''}${note}` : 'Non exporté',
    }
    ;(isPourMemoire(t, a.data.fiscalYears) ? pourMemoire : lignes).push(ligne)
  }

  const mois = [...new Set(lignes.map((l) => l.mois))].sort()
  const parMois = mois.map((m) => ({ mois: m, ...sousTotal(lignes.filter((l) => l.mois === m)) }))
  const moisExportes = mois.filter((m) => lignes.every((l) => l.mois !== m || l.exporte)).length

  const vehicleIds = [...new Set(lignes.map((l) => trips.find((t) => t.id === l.trip_id)!.vehicle_id))]
  const vehicules: VehiculeAnnuel[] = vehicleIds.flatMap((id) => {
    const v = id ? vehicles.get(id) : undefined
    if (!v) return []
    const siens = lignes.filter((l) => trips.find((t) => t.id === l.trip_id)!.vehicle_id === v.id)
    return [{
      vehicle_id: v.id, libelle: siens[0].vehicule, nom: v.nom, immatriculation: v.immatriculation, cv: v.cv, energie: v.energie,
      ...sousTotal(siens),
    }]
  })

  // Barème(s) appliqué(s) : celui figé par la note pour un trajet exporté, celui du calcul sinon.
  const baremes = new Map<string, { annee: number | null; provisoire: boolean }>()
  for (const l of lignes) {
    const c = a.calc.get(l.trip_id)
    if (!c?.compte) continue
    const t = trips.find((x) => x.id === l.trip_id)!
    const rec = l.exporte && t.export_id ? exports.get(t.export_id) : undefined
    const b = rec ? { annee: rec.bareme_annee, provisoire: rec.bareme_provisoire } : { annee: c.bareme_annee, provisoire: c.provisoire }
    baremes.set(`${b.annee}|${b.provisoire}`, b)
  }

  const nonExportees = [...lignes, ...pourMemoire].filter((l) => !l.exporte)
  const total = sousTotal(lignes)
  return {
    activite: a.activite,
    annee: a.annee,
    titre: TITRES_ANNUELS[a.activite](a.annee),
    beneficiaire: BENEFICIAIRE,
    mode: fiscalSettings(a.annee, a.activite, a.data.fiscalYears).mode,
    lignes,
    pourMemoire,
    totaux: { nb_trajets: total.nb, km: total.km, indemnite: total.indemnite },
    parMois,
    vehicules,
    baremes: [...baremes.values()].sort((x, y) => (x.annee ?? 0) - (y.annee ?? 0)),
    nonExportes: nonExportees.length,
    brouillons,
    moisExportes,
    moisTotal: mois.length,
    bareme_indisponible: nonExportees.some((l) => a.calc.get(l.trip_id)?.bareme_indisponible === true),
    montant_negatif: nonExportees.some((l) => a.calc.get(l.trip_id)?.montant_negatif === true),
    genere_le: a.genere_le,
  }
}

export function provisoireMention(d: AnnualData): string | null {
  if (d.nonExportes === 0 && d.brouillons === 0) return null
  return `Provisoire : ${d.nonExportes} trajet(s) non encore exporté(s), ${d.brouillons} brouillon(s) exclus.`
}

export function annualEntete(d: AnnualData): string[] {
  return [
    DOC_SYNTHESE,
    provisoireMention(d) ?? '',
    `Bénéficiaire : ${d.beneficiaire}`,
    `Période : année ${d.annee}`,
    ...d.vehicules.map(vehiculeTexte),
    d.mode === 'bareme' ? baremeTexte(d.baremes) : FRAIS_REELS_PDF,
    d.bareme_indisponible ? 'Barème indisponible pour certains trajets non exportés : montants à 0 €.' : '',
    FRAIS_NON_INCLUS,
  ].filter(Boolean)
}

// Ligne de sous-total : libellé sur Date + Motif + Trajet (une seule ligne, jamais replié dans la
// colonne Date), puis km, indemnité et statut vide dans leurs colonnes.
const sousTotalRow = (libelle: string, s: SousTotal): PdfCell[] => [
  { content: `${libelle} · ${s.nb} trajet(s)`, bold: true, colSpan: 3 },
  { content: decimalFr(s.km, 1), bold: true },
  { content: formatEuro(s.indemnite), bold: true },
  { content: '', bold: true },
]
const totalCells = (libelle: string, s: SousTotal) => [libelle, `${s.nb} trajet(s)`, '', decimalFr(s.km, 1), formatEuro(s.indemnite), '']

// Tableau principal (trajets groupés par mois avec sous-totaux, total annuel en pied), puis
// sous-totaux par véhicule quand l'année en compte plusieurs.
export function annualPdfTables(d: AnnualData): PdfTable[] {
  const body: PdfCell[][] = d.parMois.flatMap((m) => [
    ...d.lignes.filter((l) => l.mois === m.mois).map((l) => [...trajetCells(l, false), l.statut]),
    sousTotalRow(`Sous-total ${formatMoisLong(m.mois)}`, m),
  ])
  const principal: PdfTable = {
    head: ['Date', 'Motif', 'Trajet', 'Km', 'Indemnité', 'Statut'],
    body,
    foot: totalCells(`Total ${d.annee}`, { nb: d.totaux.nb_trajets, km: d.totaux.km, indemnite: d.totaux.indemnite }),
    widths: [22, 95, 80, 16, 26, 30],
    rightFrom: 3,
    rightTo: 4,
  }
  if (d.vehicules.length <= 1) return [principal]
  return [
    principal,
    {
      titre: 'Par véhicule',
      head: ['Véhicule', 'Trajets', 'Km', 'Indemnité'],
      body: d.vehicules.map((v) => [v.libelle, String(v.nb), decimalFr(v.km, 1), formatEuro(v.indemnite)]),
      widths: [110, 20, 20, 30],
      rightFrom: 1,
    },
  ]
}

export function renderAnnualPdf(d: AnnualData): Blob {
  return renderDocument({
    titre: d.titre,
    entete: annualEntete(d),
    tableaux: annualPdfTables(d),
    pourMemoire: d.pourMemoire,
    beneficiaire: d.beneficiaire,
    genere_le: d.genere_le,
    piedPage: d.titre,
  })
}

// Colonnes du CSV annuel : celles de la note mensuelle (sans « Rattrapage », propre à une note ;
// la note qui a figé le trajet figure dans « Statut »), précédées du mois et suivies du statut.
export const ANNUAL_CSV_COLUMNS: CsvColumn<LigneAnnuelle, AnnualData>[] = [
  { header: 'Mois', value: (l) => formatMoisLong(l.mois) },
  ...CSV_COLUMNS.filter((c) => c.header !== 'Rattrapage'),
  { header: 'Statut', value: (l) => l.statut },
]

export const annualShareTitle = (d: AnnualData) => `${ACTIVITE_LABEL[d.activite]} — récapitulatif annuel ${d.annee}`

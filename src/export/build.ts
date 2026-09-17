import { BENEFICIAIRE } from '../config'
import { cumulKm, type CalcData, type TripCalc } from '../domain/chain'
import { fiscalSettings, isExcludedDomicileTravail } from '../domain/rules'
import {
  type Activite, type Energie, type ExportCumul, type ExportRecord, type ExportTotaux, type ModeFiscal, type Nature, type Trip,
} from '../domain/types'
import { firstDayOfMonth, lastDayOfMonth, monthOf, yearOf } from '../lib/dates'
import { formatMoisLong, round1, round2 } from '../lib/format'

export const TITRES_EXPORT: Record<Activite, string> = {
  swing_house: 'Swing House SAS — Note de frais kilométriques',
  lmnp: 'LMNP Nid de l’Aiguille (EI) — Frais de déplacement',
}

// Péages et parkings : réglés directement par l'entreprise (badge, carte) et déjà en comptabilité ;
// les ajouter ici les compterait deux fois (spec §6.4).
export const FRAIS_NON_INCLUS = 'Péages et parkings non inclus : réglés directement par l’entreprise.'

export interface LigneExport {
  trip_id: string
  date: string
  motif: string
  depart: string
  arrivee: string
  km: number
  aller_retour: boolean
  km_route: number | null
  km_saisi: number | null
  justif_km: string | null
  montant_bareme: number // indemnité kilométrique, seul montant de la ligne
  rattrapage: string | null
  vehicule: string
  nature: Nature
}

export interface VehiculeExport {
  nom: string
  immatriculation: string
  cv: number
  energie: Energie
  cumulAvant: number
  cumulApres: number
}

export interface ExportData {
  activite: Activite
  mois: string
  version: number
  titre: string
  beneficiaire: string
  lignes: LigneExport[]
  pourMemoire: LigneExport[]
  totaux: ExportTotaux
  vehicules: VehiculeExport[]
  bareme_annee: number | null
  bareme_provisoire: boolean
  bareme_indisponible: boolean
  montant_negatif: boolean // au moins une ligne à montant négatif (avertissement, non bloquant)
  mode: ModeFiscal
  genere_le: string
}

export interface BuildArgs {
  activite: Activite
  mois: string
  version: number
  selection: Trip[] // résultat de tripsForExport ou tripsOfExport
  data: CalcData
  calc: Map<string, TripCalc>
  genere_le: string
  // Re-partage d'un export émis : l'en-tête reprend ce qui a été figé dans l'enregistrement.
  record?: ExportRecord
}

export function buildExportData(a: BuildArgs): ExportData {
  const annee = yearOf(a.mois)
  const settings = fiscalSettings(annee, a.activite, a.data.fiscalYears)
  const vehicles = new Map(a.data.vehicles.map((v) => [v.id, v]))

  const toLigne = (t: Trip): LigneExport => {
    const c = a.calc.get(t.id)
    const v = t.vehicle_id ? vehicles.get(t.vehicle_id) : undefined
    const excluded = isExcludedDomicileTravail(t, fiscalSettings(yearOf(t.date), t.activite, a.data.fiscalYears))
    const montant = excluded ? 0 : (c?.montant_bareme ?? 0)
    return {
      trip_id: t.id,
      date: t.date,
      motif: t.motif.trim(),
      depart: t.depart_label,
      arrivee: t.arrivee_label,
      km: t.km_total ?? 0,
      aller_retour: t.aller_retour,
      km_route: t.km_route,
      km_saisi: t.km_saisi,
      justif_km: t.justif_km,
      montant_bareme: montant,
      rattrapage: monthOf(t.date) !== a.mois ? formatMoisLong(monthOf(t.date)) : null,
      vehicule: v ? `${v.nom} (${v.immatriculation}, ${v.cv} CV)` : '',
      nature: t.nature ?? 'pro',
    }
  }

  const lignes: LigneExport[] = []
  const pourMemoire: LigneExport[] = []
  for (const t of a.selection) {
    const excluded = isExcludedDomicileTravail(t, fiscalSettings(yearOf(t.date), t.activite, a.data.fiscalYears))
    ;(excluded ? pourMemoire : lignes).push(toLigne(t))
  }

  const bareme = round2(lignes.reduce((s, l) => s + l.montant_bareme, 0))

  const vehicleIds = [...new Set(a.selection.filter((t) => !pourMemoire.some((p) => p.trip_id === t.id)).map((t) => t.vehicle_id))]
  const figes = a.record?.totaux.cumuls
  // Export ancien sans cumuls enregistrés : on reconstitue au mieux en ignorant les trajets créés
  // après l'export (ils ne pouvaient pas figurer dans le cumul d'origine).
  const cumulData = a.record && !figes
    ? { ...a.data, trips: a.data.trips.filter((t) => t.created_at <= a.record!.created_at) }
    : a.data
  const cumuls: ExportCumul[] = []
  const vehicules: VehiculeExport[] = vehicleIds.flatMap((id) => {
    const v = id ? vehicles.get(id) : undefined
    if (!v) return []
    const fige = figes?.find((c) => c.vehicle_id === v.id)
    const cumul: ExportCumul = fige ?? {
      vehicle_id: v.id,
      avant: cumulKm(cumulData, v.id, a.activite, annee, firstDayOfMonth(a.mois), false),
      apres: cumulKm(cumulData, v.id, a.activite, annee, lastDayOfMonth(a.mois), true),
    }
    cumuls.push(cumul)
    return [{ nom: v.nom, immatriculation: v.immatriculation, cv: v.cv, energie: v.energie, cumulAvant: cumul.avant, cumulApres: cumul.apres }]
  })

  const totaux: ExportTotaux = {
    km: round1(lignes.reduce((s, l) => s + l.km, 0)),
    bareme,
    // Péages et parkings non inclus (spec §6.4) : frais toujours à 0, clé conservée pour le contrôle
    // serveur (total = barème + frais) et les exports déjà émis.
    frais: 0,
    total: bareme,
    nb_trajets: lignes.length,
    // Transmis tel quel au serveur (p_totaux) : c'est ce qui rend un re-partage stable.
    cumuls: figes ?? cumuls,
  }

  const calcs = lignes.map((l) => a.calc.get(l.trip_id)).filter((c): c is TripCalc => c != null && c.compte)

  // Déterminer si un barème est indisponible (champ bareme_indisponible à true)
  const bareme_indisponible = [...lignes, ...pourMemoire].some((l) => {
    const calc = a.calc.get(l.trip_id)
    return calc?.bareme_indisponible === true
  })

  return {
    activite: a.activite,
    mois: a.mois,
    version: a.version,
    titre: TITRES_EXPORT[a.activite],
    beneficiaire: BENEFICIAIRE,
    lignes,
    pourMemoire,
    totaux,
    vehicules,
    // Re-partage : ce qui a été figé à l'export fait foi (le barème a pu être saisi ou modifié depuis).
    bareme_annee: a.record ? a.record.bareme_annee : (calcs.find((c) => c.bareme_annee != null)?.bareme_annee ?? null),
    bareme_provisoire: a.record ? a.record.bareme_provisoire : calcs.some((c) => c.provisoire),
    bareme_indisponible,
    montant_negatif: lignes.some((l) => a.calc.get(l.trip_id)?.montant_negatif === true),
    mode: settings.mode,
    genere_le: a.genere_le,
  }
}

// Montants à figer côté serveur (toutes les lignes, pour mémoire compris).
export function rpcTripsPayload(d: ExportData): { id: string; montant_bareme: number }[] {
  return [...d.lignes, ...d.pourMemoire].map((l) => ({ id: l.trip_id, montant_bareme: l.montant_bareme }))
}

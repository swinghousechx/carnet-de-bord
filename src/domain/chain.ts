import { yearOf } from '../lib/dates'
import { round1, round2 } from '../lib/format'
import { baremeAmount, selectRateSet } from './bareme'
import { fiscalSettings, tripCounts } from './rules'
import type { Activite, BaremeRate, BaremeYear, FiscalYear, Trip, TripExpense, Vehicle } from './types'

export interface CalcData {
  trips: Trip[]
  // Péages et parkings : réglés directement par l'entreprise et déjà en comptabilité, donc jamais
  // ajoutés aux indemnités (spec §6.4). Les lignes éventuelles sont chargées mais ignorées du calcul.
  expenses: TripExpense[]
  vehicles: Vehicle[]
  fiscalYears: FiscalYear[]
  baremeYears: BaremeYear[]
  rates: BaremeRate[]
}

// Montant d'un trajet = indemnité kilométrique (montant_bareme), seul montant de la note.
export interface TripCalc {
  montant_bareme: number
  compte: boolean // entre dans la chaîne du barème
  bareme_annee: number | null
  provisoire: boolean
  bareme_indisponible: boolean // montant non calculable faute de barème exploitable pour ce trajet
  // Trajet non exporté dont le montant calculé est négatif (barème ou CV revus à la baisse après un
  // export) : avertissement seulement, l'invariant garde le total annuel juste.
  montant_negatif: boolean
}

export function groupKey(vehicleId: string, activite: Activite, annee: number): string {
  return `${vehicleId}|${activite}|${annee}`
}

// Ordre de la chaîne : date, puis created_at, puis id (déterministe même à horodatage identique).
export const byChainOrder = (a: Trip, b: Trip) =>
  a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

// Le trajet entre-t-il dans la chaîne de son groupe ? Règle unique, partagée par computeAll et
// cumulKm pour que l'en-tête des exports (cumul avant/après) et les montants s'accordent toujours.
// Les brouillons comptent (vision « projetée », spec §6.2).
export function countsInChain(t: Trip, fiscalYears: FiscalYear[], liveVehicleIds: Set<string>): boolean {
  const settings = fiscalSettings(yearOf(t.date), t.activite, fiscalYears)
  return tripCounts(t, settings) && t.km_total != null && t.vehicle_id != null && liveVehicleIds.has(t.vehicle_id)
}

// Montant de chaque trajet. Chaîne par (véhicule, activité, année).
// Invariant : Σ montants figés (trajets exportés) + Σ montants calculés = round2(f(D)), D = km comptés
// du groupe. Les trajets exportés forment la base : C = leurs km, L = la somme de leurs montants figés.
// Ces montants figés ne valent pas forcément round2(f(C)) (ils ont pu être calculés avec d'autres
// trajets avant eux dans la chaîne : brouillon plus ancien, trajet rouvert, barème modifié depuis…),
// donc le premier trajet à calculer reçoit round2(f(C + km)) − L, et les suivants l'incrément usuel
// round2(f(C + km)) − round2(f(C)). Sans trajet exporté, L = 0 = f(0) : chaîne télescopique classique.
export function computeAll(data: CalcData): Map<string, TripCalc> {
  const out = new Map<string, TripCalc>()
  const vehicles = new Map(data.vehicles.filter((v) => !v.deleted_at).map((v) => [v.id, v]))

  const groups = new Map<string, Trip[]>()
  const liveVehicleIds = new Set(vehicles.keys())
  for (const t of data.trips) {
    if (t.deleted_at) continue
    const annee = yearOf(t.date)
    const set = selectRateSet(annee, data.baremeYears, data.rates)
    const compte = countsInChain(t, data.fiscalYears, liveVehicleIds)
    const montant = t.statut === 'exporte' ? t.montant_bareme : 0
    out.set(t.id, {
      montant_bareme: montant,
      compte,
      bareme_annee: set?.annee ?? null,
      provisoire: set?.provisoire ?? false,
      bareme_indisponible: false,
      montant_negatif: false,
    })
    if (compte) {
      const key = groupKey(t.vehicle_id!, t.activite, annee)
      groups.set(key, [...(groups.get(key) ?? []), t])
    }
  }

  for (const members of groups.values()) {
    const first = members[0]
    const set = selectRateSet(yearOf(first.date), data.baremeYears, data.rates)
    const vehicle = vehicles.get(first.vehicle_id!)!
    const aTraiter = members.filter((m) => m.statut !== 'exporte')
    // Barème indisponible pour ce groupe (aucune année de barème) : rien à calculer, signalé.
    if (!set) {
      for (const t of aTraiter) {
        const calc = out.get(t.id)!
        out.set(t.id, { ...calc, montant_bareme: 0, bareme_indisponible: true })
      }
      continue
    }
    try {
      const bareme = (D: number) => round2(baremeAmount(D, vehicle.cv, vehicle.energie, set))
      const figes = members.filter((t) => t.statut === 'exporte')
      let C = figes.reduce((s, t) => s + t.km_total!, 0)
      // Base déjà versée : ce que valent réellement les trajets figés (et non bareme(C)).
      let base = round2(figes.reduce((s, t) => s + t.montant_bareme, 0))
      const montants = new Map<string, number>()
      for (const t of aTraiter.sort(byChainOrder)) {
        const cumul = bareme(C + t.km_total!)
        // Pas de plancher à 0 : un montant négatif reste possible (barème ou CV revus à la baisse
        // après un export) et doit être conservé, sinon le groupe dépasserait round2(f(D)).
        const montant = round2(cumul - base)
        C += t.km_total!
        base = cumul
        montants.set(t.id, montant)
      }
      // Groupe calculé en entier avec succès : on applique tous les montants d'un coup.
      for (const t of aTraiter) {
        const montant = montants.get(t.id)!
        const calc = out.get(t.id)!
        out.set(t.id, { ...calc, montant_bareme: montant, bareme_indisponible: false, montant_negatif: montant < 0 })
      }
    } catch {
      // Barème incomplet pour ce CV (ex. ligne du barème supprimée depuis Réglages) : échec atomique,
      // aucun montant partiel — tous les trajets non exportés du groupe repassent à 0 et sont signalés.
      for (const t of aTraiter) {
        const calc = out.get(t.id)!
        out.set(t.id, { ...calc, montant_bareme: 0, bareme_indisponible: true })
      }
    }
  }
  return out
}

// Km comptés d'un groupe jusqu'à une date (pour l'en-tête des exports). Même règle d'inclusion que
// la chaîne (countsInChain) : l'en-tête et les montants portent sur les mêmes trajets.
export function cumulKm(
  data: CalcData,
  vehicleId: string,
  activite: Activite,
  annee: number,
  untilDate: string,
  inclusive: boolean,
): number {
  const liveVehicleIds = new Set(data.vehicles.filter((v) => !v.deleted_at).map((v) => v.id))
  const km = data.trips
    .filter(
      (t) =>
        t.vehicle_id === vehicleId &&
        t.activite === activite &&
        yearOf(t.date) === annee &&
        (inclusive ? t.date <= untilDate : t.date < untilDate) &&
        countsInChain(t, data.fiscalYears, liveVehicleIds),
    )
    .reduce((s, t) => s + t.km_total!, 0)
  return round1(km)
}

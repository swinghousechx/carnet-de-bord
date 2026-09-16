import { yearOf } from '../lib/dates'
import { round1, round2 } from '../lib/format'
import { baremeAmount, selectRateSet } from './bareme'
import { fiscalSettings, tripCounts } from './rules'
import type { Activite, BaremeRate, BaremeYear, FiscalYear, Trip, TripExpense, Vehicle } from './types'

export interface CalcData {
  trips: Trip[]
  expenses: TripExpense[]
  vehicles: Vehicle[]
  fiscalYears: FiscalYear[]
  baremeYears: BaremeYear[]
  rates: BaremeRate[]
}

export interface TripCalc {
  montant_bareme: number
  frais: number
  total: number
  compte: boolean // entre dans la chaîne du barème
  bareme_annee: number | null
  provisoire: boolean
}

export function groupKey(vehicleId: string, activite: Activite, annee: number): string {
  return `${vehicleId}|${activite}|${annee}`
}

const byDate = (a: Trip, b: Trip) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)

// Montant de chaque trajet. Chaîne par (véhicule, activité, année) :
// montant = round2(f(C + km)) − round2(f(C)), les trajets exportés (figés) formant la base C.
// La somme d'un groupe vaut donc toujours round2(f(total km)).
export function computeAll(data: CalcData): Map<string, TripCalc> {
  const out = new Map<string, TripCalc>()
  const vehicles = new Map(data.vehicles.filter((v) => !v.deleted_at).map((v) => [v.id, v]))
  const frais = new Map<string, number>()
  for (const e of data.expenses) {
    if (!e.deleted_at) frais.set(e.trip_id, (frais.get(e.trip_id) ?? 0) + e.montant)
  }

  const groups = new Map<string, Trip[]>()
  for (const t of data.trips) {
    if (t.deleted_at) continue
    const annee = yearOf(t.date)
    const set = selectRateSet(annee, data.baremeYears, data.rates)
    const settings = fiscalSettings(annee, t.activite, data.fiscalYears)
    const compte = tripCounts(t, settings) && t.km_total != null && t.vehicle_id != null && vehicles.has(t.vehicle_id)
    const f = round2(frais.get(t.id) ?? 0)
    const montant = t.statut === 'exporte' ? t.montant_bareme : 0
    out.set(t.id, {
      montant_bareme: montant,
      frais: f,
      total: round2(montant + f),
      compte,
      bareme_annee: set?.annee ?? null,
      provisoire: set?.provisoire ?? false,
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
    if (!set) continue
    try {
      const f = (D: number) => round2(baremeAmount(D, vehicle.cv, vehicle.energie, set))
      let C = members.filter((t) => t.statut === 'exporte').reduce((s, t) => s + t.km_total!, 0)
      for (const t of members.filter((m) => m.statut !== 'exporte').sort(byDate)) {
        const montant = round2(f(C + t.km_total!) - f(C))
        C += t.km_total!
        const calc = out.get(t.id)!
        out.set(t.id, { ...calc, montant_bareme: montant, total: round2(montant + calc.frais) })
      }
    } catch {
      // Barème incomplet pour ce CV : montants laissés à 0 (signalé dans Réglages).
    }
  }
  return out
}

// Km comptés d'un groupe jusqu'à une date (pour l'en-tête des exports).
export function cumulKm(
  data: CalcData,
  vehicleId: string,
  activite: Activite,
  annee: number,
  untilDate: string,
  inclusive: boolean,
): number {
  const settings = fiscalSettings(annee, activite, data.fiscalYears)
  const km = data.trips
    .filter(
      (t) =>
        t.vehicle_id === vehicleId &&
        t.activite === activite &&
        yearOf(t.date) === annee &&
        t.km_total != null &&
        (inclusive ? t.date <= untilDate : t.date < untilDate) &&
        tripCounts(t, settings),
    )
    .reduce((s, t) => s + t.km_total!, 0)
  return round1(km)
}

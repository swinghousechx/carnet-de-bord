import { computeStatut, resolveVehicle } from '../domain/rules'
import type { Place, Trip, Vehicle } from '../domain/types'
import { todayISO } from '../lib/dates'

export function dayBefore(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() - 1)
  return todayISO(d)
}

type Periode = { date_debut: string; date_fin: string | null }

export function overlaps(a: Periode, b: Periode): boolean {
  const finA = a.date_fin ?? '9999-12-31'
  const finB = b.date_fin ?? '9999-12-31'
  return a.date_debut <= finB && b.date_debut <= finA
}

// Le véhicule actuel (sans date de fin, plus ancien) doit-il être clôturé la veille du nouveau ?
// Seulement si le nouveau véhicule n'a lui-même pas de date de fin : c'est alors lui qui devient
// le véhicule actuel, et il ne peut y en avoir deux à la fois.
export function vehicleToClose(vehicles: Vehicle[], debut: string, fin: string | null): Vehicle | undefined {
  if (fin) return undefined
  return vehicles.find((v) => v.date_fin == null && v.date_debut < debut)
}

// Après une modification des véhicules : trajets non exportés à rattacher à un autre véhicule.
export function tripsToReassign(trips: Trip[], vehicles: Vehicle[], places: Place[]): Trip[] {
  return trips.flatMap((t) => {
    if (t.statut === 'exporte' || t.deleted_at) return []
    const id = resolveVehicle(t.date, vehicles)?.id ?? null
    if (id === t.vehicle_id) return []
    const next = { ...t, vehicle_id: id }
    return [{ ...next, statut: computeStatut(next, { vehicles, places }) }]
  })
}

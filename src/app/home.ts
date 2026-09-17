import { ACTIVITES, type Activite, type Trip } from '../domain/types'
import { draftsForExport, exportBlockReason, tripsForExport } from '../export/select'
import type { AppData } from '../hooks/useData'
import { firstDayOfMonth, monthOf, prevMonth } from '../lib/dates'
import { round1 } from '../lib/format'

export interface HomeSummary {
  mois: string
  parActivite: Record<Activite, { nb: number; km: number }>
  brouillons: number
  jours: [string, Trip[]][]
  brouillonsAnciens: Trip[]
  nonExportes: Activite[]
  aConfigurer: boolean
}

const byDateDesc = (a: Trip, b: Trip) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)

// Un mois reste « à exporter » pour une activité s'il n'est pas déjà émis et qu'il reste des
// trajets validés (rattrapages compris) ou des brouillons datés jusqu'à sa fin. Partagée entre
// le bandeau de l'accueil et le mois par défaut de Récap, pour que les deux s'accordent toujours.
export function monthNeedsExport(data: AppData, activite: Activite, mois: string): boolean {
  return (
    exportBlockReason(data.exports, activite, mois) == null &&
    (tripsForExport(data.trips, data.exports, activite, mois).length > 0 || draftsForExport(data.trips, activite, mois).length > 0)
  )
}

// Données de l'accueil : volontairement sans aucun montant en euros.
export function homeSummary(data: AppData, today: string): HomeSummary {
  const mois = monthOf(today)
  const debutMois = firstDayOfMonth(mois)
  const duMois = data.trips.filter((t) => monthOf(t.date) === mois).sort(byDateDesc)
  const parActivite = Object.fromEntries(
    ACTIVITES.map((a) => {
      const list = duMois.filter((t) => t.activite === a)
      return [a, { nb: list.length, km: round1(list.reduce((s, t) => s + (t.km_total ?? 0), 0)) }]
    }),
  ) as HomeSummary['parActivite']
  const jours = new Map<string, Trip[]>()
  for (const t of duMois) jours.set(t.date, [...(jours.get(t.date) ?? []), t])
  // Un mois « pas encore exporté » doit être exactement celui que Récap accepterait encore
  // d'exporter : même logique que src/export/select.ts, pour que le bandeau et l'export soient
  // toujours d'accord (sinon un mois déjà exporté ('emis') resterait signalé pour un simple trajet
  // oublié après coup, ou un vieux brouillon isolé garderait le bandeau allumé indéfiniment).
  const moisPrecedent = prevMonth(mois)
  const nonExportes = ACTIVITES.filter((a) => monthNeedsExport(data, a, moisPrecedent))
  // Brouillons datés avant le mois en cours : invisibles dans `jours` (limité au mois en cours),
  // donc listés à part pour rester accessibles depuis l'accueil.
  const brouillonsAnciens = data.trips.filter((t) => t.statut === 'brouillon' && t.date < debutMois).sort(byDateDesc)
  return {
    mois,
    parActivite,
    brouillons: data.trips.filter((t) => t.statut === 'brouillon').length,
    jours: [...jours.entries()],
    brouillonsAnciens,
    nonExportes,
    aConfigurer: data.vehicles.length === 0 || !data.places.some((p) => p.role === 'domicile'),
  }
}

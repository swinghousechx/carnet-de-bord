import { ACTIVITES, type Activite, type Trip } from '../domain/types'
import type { AppData } from '../hooks/useData'
import { firstDayOfMonth, monthOf } from '../lib/dates'
import { round1 } from '../lib/format'
import { monthsBehind, type Retard } from './retard'

export interface HomeSummary {
  mois: string
  parActivite: Record<Activite, { nb: number; km: number }>
  brouillons: number
  jours: [string, Trip[]][]
  brouillonsAnciens: Trip[]
  enRetard: Retard
  aConfigurer: boolean
}

const byDateDesc = (a: Trip, b: Trip) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)

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
  // Mois antérieurs encore à exporter : même règle que le Récap (voir retard.ts), pour que le
  // bandeau et l'export soient toujours d'accord.
  const enRetard = monthsBehind(data, mois)
  // Brouillons datés avant le mois en cours : invisibles dans `jours` (limité au mois en cours),
  // donc listés à part pour rester accessibles depuis l'accueil.
  const brouillonsAnciens = data.trips.filter((t) => t.statut === 'brouillon' && t.date < debutMois).sort(byDateDesc)
  return {
    mois,
    parActivite,
    brouillons: data.trips.filter((t) => t.statut === 'brouillon').length,
    jours: [...jours.entries()],
    brouillonsAnciens,
    enRetard,
    aConfigurer: data.vehicles.length === 0 || !data.places.some((p) => p.role === 'domicile'),
  }
}

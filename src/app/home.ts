import { ACTIVITES, type Activite, type Trip } from '../domain/types'
import type { AppData } from '../hooks/useData'
import { lastDayOfMonth, monthOf, prevMonth } from '../lib/dates'
import { round1 } from '../lib/format'

export interface HomeSummary {
  mois: string
  parActivite: Record<Activite, { nb: number; km: number }>
  brouillons: number
  jours: [string, Trip[]][]
  nonExportes: Activite[]
  aConfigurer: boolean
}

// Données de l'accueil : volontairement sans aucun montant en euros.
export function homeSummary(data: AppData, today: string): HomeSummary {
  const mois = monthOf(today)
  const duMois = data.trips
    .filter((t) => monthOf(t.date) === mois)
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
  const parActivite = Object.fromEntries(
    ACTIVITES.map((a) => {
      const list = duMois.filter((t) => t.activite === a)
      return [a, { nb: list.length, km: round1(list.reduce((s, t) => s + (t.km_total ?? 0), 0)) }]
    }),
  ) as HomeSummary['parActivite']
  const jours = new Map<string, Trip[]>()
  for (const t of duMois) jours.set(t.date, [...(jours.get(t.date) ?? []), t])
  const finPrecedent = lastDayOfMonth(prevMonth(mois))
  return {
    mois,
    parActivite,
    brouillons: data.trips.filter((t) => t.statut === 'brouillon').length,
    jours: [...jours.entries()],
    nonExportes: ACTIVITES.filter((a) => data.trips.some((t) => t.activite === a && t.statut !== 'exporte' && t.date <= finPrecedent)),
    aConfigurer: data.vehicles.length === 0 || !data.places.some((p) => p.role === 'domicile'),
  }
}

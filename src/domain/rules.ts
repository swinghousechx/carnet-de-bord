import { round1 } from '../lib/format'
import type { Activite, FiscalYear, ModeFiscal, Place, PlaceRole, Statut, Trip, Vehicle } from './types'

export interface FiscalSettings {
  mode: ModeFiscal
  inclure_domicile_travail: boolean
}

export interface RuleCtx {
  vehicles: Vehicle[]
  places: Place[]
}

export const MOTIF_MIN = 12

// Motifs refusés quand ils sont seuls (comparés après normalisation).
const GENERIQUES = new Set([
  'deplacement', 'deplacements', 'deplacement pro', 'deplacement professionnel',
  'trajet', 'trajet pro', 'trajet professionnel', 'rdv', 'rendez vous',
  'reunion', 'visite', 'course', 'courses', 'divers',
])

export function resolveVehicle(date: string, vehicles: Vehicle[]): Vehicle | null {
  return (
    vehicles.find((v) => !v.deleted_at && v.date_debut <= date && (v.date_fin == null || date <= v.date_fin)) ?? null
  )
}

export function kmTotal(km_route: number | null, km_saisi: number | null, aller_retour: boolean): number | null {
  const aller = km_saisi ?? km_route
  if (aller == null) return null
  return round1(aller * (aller_retour ? 2 : 1))
}

export function normalizeMotif(m: string): string {
  return m
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function validateMotif(motif: string): string | null {
  const t = motif.trim()
  if (t.length < MOTIF_MIN) return `Motif trop court (${MOTIF_MIN} caractères minimum) : qui, quoi, où.`
  if (GENERIQUES.has(normalizeMotif(t))) return "Motif trop générique : précise l'objet du déplacement."
  return null
}

export function roleOf(placeId: string | null, places: Place[]): PlaceRole | null {
  if (!placeId) return null
  return places.find((p) => p.id === placeId && !p.deleted_at)?.role ?? null
}

export function isDomicileTravailCandidate(
  activite: Activite,
  departRole: PlaceRole | null,
  arriveeRole: PlaceRole | null,
): boolean {
  if (activite !== 'swing_house') return false
  return (
    (departRole === 'domicile' && arriveeRole === 'swing_house') ||
    (departRole === 'swing_house' && arriveeRole === 'domicile')
  )
}

// Choix fiscal de l'année ; défauts : barème, domicile–travail exclu.
export function fiscalSettings(annee: number, activite: Activite, fiscalYears: FiscalYear[]): FiscalSettings {
  const fy = fiscalYears.find((f) => !f.deleted_at && f.annee === annee && f.activite === activite)
  return { mode: fy?.mode ?? 'bareme', inclure_domicile_travail: fy?.inclure_domicile_travail ?? false }
}

export function isExcludedDomicileTravail(trip: Trip, settings: FiscalSettings): boolean {
  return trip.nature === 'domicile_travail' && !settings.inclure_domicile_travail
}

// Le trajet entre-t-il dans la chaîne du barème ?
export function tripCounts(trip: Trip, settings: FiscalSettings): boolean {
  if (trip.deleted_at) return false
  if (settings.mode !== 'bareme') return false
  return !isExcludedDomicileTravail(trip, settings)
}

export function missingReasons(trip: Trip, ctx: RuleCtx): string[] {
  const reasons: string[] = []
  const motifError = validateMotif(trip.motif)
  if (motifError) reasons.push(motifError)
  if (!trip.depart_place_id) reasons.push('Départ manquant')
  if (!trip.arrivee_place_id) reasons.push('Arrivée manquante')
  if (trip.km_total == null) reasons.push('Km non calculés')
  const corrige = trip.km_saisi != null && (trip.km_route == null || trip.km_saisi !== trip.km_route)
  if (corrige && !trip.justif_km?.trim()) reasons.push('Justification des km corrigés manquante')
  if (!resolveVehicle(trip.date, ctx.vehicles)) reasons.push('Aucun véhicule à cette date')
  const candidat = isDomicileTravailCandidate(
    trip.activite,
    roleOf(trip.depart_place_id, ctx.places),
    roleOf(trip.arrivee_place_id, ctx.places),
  )
  if (candidat && trip.nature == null) reasons.push('Préciser : trajet domicile–travail ou déplacement pro')
  return reasons
}

export function computeStatut(trip: Trip, ctx: RuleCtx): Statut {
  if (trip.statut === 'exporte') return 'exporte'
  if (trip.brouillon_force) return 'brouillon'
  return missingReasons(trip, ctx).length === 0 ? 'valide' : 'brouillon'
}

export function findDuplicate(trip: Trip, trips: Trip[]): Trip | null {
  if (!trip.depart_place_id || !trip.arrivee_place_id) return null
  return (
    trips.find(
      (t) =>
        t.id !== trip.id &&
        !t.deleted_at &&
        t.date === trip.date &&
        t.activite === trip.activite &&
        t.depart_place_id === trip.depart_place_id &&
        t.arrivee_place_id === trip.arrivee_place_id,
    ) ?? null
  )
}

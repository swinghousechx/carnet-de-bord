import { newRow } from '../db/repo'
import { computeStatut, isDomicileTravailCandidate, kmTotal, resolveVehicle, roleOf } from '../domain/rules'
import { ROLE_LABEL, type Trip } from '../domain/types'
import type { AppData } from '../hooks/useData'

export function emptyTrip(data: AppData, today: string, prefill: Partial<Trip> = {}): Trip {
  const dom = data.places.find((p) => p.role === 'domicile')
  const last = [...data.trips].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const trip = newRow<Trip>({
    date: today,
    activite: last?.activite ?? 'swing_house',
    motif: '',
    depart_place_id: dom?.id ?? null,
    depart_label: dom ? ROLE_LABEL.domicile : '',
    depart_adresse: dom?.adresse ?? '',
    arrivee_place_id: null,
    arrivee_label: '',
    arrivee_adresse: '',
    km_route: null,
    km_saisi: null,
    justif_km: null,
    aller_retour: false,
    km_total: null,
    vehicle_id: null,
    nature: null,
    statut: 'brouillon',
    brouillon_force: false,
    doublon_confirme: false,
    montant_bareme: 0,
    export_id: null,
  })
  return { ...trip, ...prefill }
}

export function nextStepPrefill(t: Trip): Partial<Trip> {
  return {
    date: t.date,
    activite: t.activite,
    depart_place_id: t.arrivee_place_id,
    depart_label: t.arrivee_label,
    depart_adresse: t.arrivee_adresse,
  }
}

export function recentMotifs(trips: Trip[], excludeId: string, limit = 6): string[] {
  const sorted = trips.filter((t) => t.id !== excludeId && t.motif.trim()).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return [...new Set(sorted.map((t) => t.motif.trim()))].slice(0, limit)
}

// Champs dérivés recalculés à l'enregistrement.
export function finalizeTrip(f: Trip, data: AppData): Trip {
  const candidat = isDomicileTravailCandidate(f.activite, roleOf(f.depart_place_id, data.places), roleOf(f.arrivee_place_id, data.places))
  const next: Trip = {
    ...f,
    motif: f.motif.trim(),
    justif_km: f.km_saisi == null ? null : f.justif_km?.trim() || null,
    km_total: kmTotal(f.km_route, f.km_saisi, f.aller_retour),
    vehicle_id: resolveVehicle(f.date, data.vehicles)?.id ?? null,
    nature: candidat ? f.nature : 'pro',
  }
  return { ...next, statut: computeStatut(next, { vehicles: data.vehicles, places: data.places }) }
}

// Pied de l'écran « Trajet enregistré » pour un brouillon : un seul point final, même si le dernier
// motif en porte déjà un.
export function draftFooter(reasons: string[]): string {
  const texte = reasons.join(' · ') || 'à finir plus tard'
  return `Brouillon : ${texte.replace(/\.+$/, '')}.`
}

import { MISE_A_L_ECART, type CarnetDB } from '../db/db'
import { saveRow, stripLocal } from '../db/repo'
import { computeStatut, kmTotal } from '../domain/rules'
import type { Trip } from '../domain/types'
import type { LatLng } from './maps'

export type KmComputer = (from: LatLng, to: LatLng) => Promise<number>

// Trajets saisis hors ligne : calcule les km au retour du réseau, puis revalide.
export async function resolvePendingKm(db: CarnetDB, computeKm: KmComputer): Promise<number> {
  const [trips, places, vehicles] = await Promise.all([db.trips.toArray(), db.places.toArray(), db.vehicles.toArray()])
  const byId = new Map(places.map((p) => [p.id, p]))
  let done = 0
  for (const t of trips) {
    // Ligne mise à l'écart : ne pas la réécrire (saveRow la remettrait à pousser).
    if (t._dirty === MISE_A_L_ECART || t.deleted_at || t.statut === 'exporte' || t.km_route != null || t.km_saisi != null) continue
    const a = t.depart_place_id ? byId.get(t.depart_place_id) : undefined
    const b = t.arrivee_place_id ? byId.get(t.arrivee_place_id) : undefined
    if (a?.lat == null || a.lng == null || b?.lat == null || b.lng == null) continue
    try {
      const km = await computeKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng })
      const next: Trip = { ...stripLocal(t), km_route: km, km_total: kmTotal(km, null, t.aller_retour) }
      next.statut = computeStatut(next, { vehicles, places })
      await saveRow(db, 'trips', next)
      done++
    } catch {
      // Réseau ou quota : on réessaiera à la prochaine synchro.
    }
  }
  return done
}

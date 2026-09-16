import { lastDayOfMonth } from '../lib/dates'
import type { Activite, ExportRecord, Trip } from '../domain/types'

const byDate = (a: Trip, b: Trip) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)

export function latestExport(exports: ExportRecord[], activite: Activite, mois: string): ExportRecord | null {
  return (
    exports
      .filter((e) => !e.deleted_at && e.activite === activite && e.mois === mois)
      .sort((a, b) => b.version - a.version)[0] ?? null
  )
}

export function exportBlockReason(exports: ExportRecord[], activite: Activite, mois: string): string | null {
  const last = latestExport(exports, activite, mois)
  if (last?.statut === 'emis') {
    return `Déjà exporté (v${last.version}). Un trajet oublié partira au prochain export.`
  }
  return null
}

export function nextVersion(exports: ExportRecord[], activite: Activite, mois: string): number {
  return (latestExport(exports, activite, mois)?.version ?? 0) + 1
}

// Validés non exportés datés ≤ fin du mois (rattrapages compris) + trajets encore
// verrouillés de la version « à rectifier » le cas échéant.
export function tripsForExport(trips: Trip[], exports: ExportRecord[], activite: Activite, mois: string): Trip[] {
  const fin = lastDayOfMonth(mois)
  const last = latestExport(exports, activite, mois)
  const rectif = last?.statut === 'a_rectifier' ? last.id : null
  return trips
    .filter(
      (t) =>
        !t.deleted_at &&
        t.activite === activite &&
        ((t.statut === 'valide' && t.export_id == null && t.date <= fin) ||
          (rectif != null && t.statut === 'exporte' && t.export_id === rectif)),
    )
    .sort(byDate)
}

export function draftsForExport(trips: Trip[], activite: Activite, mois: string): Trip[] {
  const fin = lastDayOfMonth(mois)
  return trips.filter((t) => !t.deleted_at && t.activite === activite && t.statut === 'brouillon' && t.date <= fin).sort(byDate)
}

export function tripsOfExport(trips: Trip[], exportId: string): Trip[] {
  return trips.filter((t) => !t.deleted_at && t.export_id === exportId).sort(byDate)
}

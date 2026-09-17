import type { SupabaseClient } from '@supabase/supabase-js'
import type { TripCalc } from '../domain/chain'
import { ACTIVITES, type Activite, type ExportRecord, type Trip } from '../domain/types'
import { buildExportData, rpcTripsPayload, type ExportData } from '../export/build'
import { draftsForExport, exportBlockReason, nextVersion, tripsForExport, tripsOfExport } from '../export/select'
import type { AppData } from '../hooks/useData'
import { monthOf, prevMonth, yearOf } from '../lib/dates'
import { monthNeedsExport } from './home'

export interface PreparedExport {
  data: ExportData
  payload: { id: string; montant_bareme: number }[]
}

export interface ExportPreview {
  prepared: PreparedExport | null
  blocked: string | null
  drafts: Trip[]
}

export function prepareExport(app: AppData, calc: Map<string, TripCalc>, activite: Activite, mois: string, genereLe: string): ExportPreview {
  const drafts = draftsForExport(app.trips, activite, mois)
  const blocked = exportBlockReason(app.exports, activite, mois)
  if (blocked) return { prepared: null, blocked, drafts }
  const selection = tripsForExport(app.trips, app.exports, activite, mois)
  if (selection.length === 0) return { prepared: null, blocked: 'Aucun trajet validé à exporter.', drafts }
  const data = buildExportData({
    activite, mois, version: nextVersion(app.exports, activite, mois), selection, data: app, calc, genere_le: genereLe,
  })
  const prepared: PreparedExport = { data, payload: rpcTripsPayload(data) }
  // Décision produit : un barème manquant ou incomplet pour ce mois bloque l'export (les montants
  // à figer seraient faux ou à 0 pour les trajets concernés). L'aperçu des totaux reste disponible
  // pour que Récap puisse quand même afficher la carte et le bandeau d'alerte.
  if (data.bareme_indisponible) {
    return { prepared, blocked: `Barème ${yearOf(mois)} indisponible ou incomplet : à compléter dans Réglages.`, drafts }
  }
  return { prepared, blocked: null, drafts }
}

// Verrouillage côté serveur (transactionnel) : nécessite le réseau.
export async function runExport(client: SupabaseClient, p: PreparedExport): Promise<{ id: string; version: number }> {
  // Garde-fou : ne devrait jamais être atteint (le bouton d'export est désactivé dans ce cas),
  // mais on ne verrouille jamais des trajets dont le montant n'a pas pu être calculé.
  if (p.data.bareme_indisponible) throw new Error('Barème indisponible : export bloqué.')
  const { data, error } = await client.rpc('export_month', {
    p_activite: p.data.activite,
    p_mois: p.data.mois,
    p_version: p.data.version,
    p_trips: p.payload,
    p_totaux: p.data.totaux,
    p_bareme_annee: p.data.bareme_annee,
    p_bareme_provisoire: p.data.bareme_provisoire,
  })
  if (error) throw new Error(error.message)
  const rec = data as { id: string; version: number }
  return { id: rec.id, version: rec.version }
}

// Re-partage d'un export émis : mêmes trajets figés, même version, même date.
export function rebuildExport(app: AppData, calc: Map<string, TripCalc>, rec: ExportRecord): ExportData {
  return buildExportData({
    activite: rec.activite, mois: rec.mois, version: rec.version, selection: tripsOfExport(app.trips, rec.id),
    data: app, calc, genere_le: rec.created_at,
  })
}

// Mois par défaut ouvert par Récap : le mois précédent s'il reste, pour au moins une activité,
// des trajets à exporter (même règle que le bandeau de l'accueil — voir monthNeedsExport) ; le
// mois courant sinon.
export function defaultRecapMonth(app: AppData, today: string): string {
  const mois = monthOf(today)
  const prev = prevMonth(mois)
  const reste = ACTIVITES.some((a) => monthNeedsExport(app, a, prev))
  return reste ? prev : mois
}

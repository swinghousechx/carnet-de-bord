import type { SupabaseClient } from '@supabase/supabase-js'
import type { CarnetDB } from '../db/db'
import { countDirty } from '../db/repo'
import type { TripCalc } from '../domain/chain'
import { type Activite, type ExportRecord, type Trip } from '../domain/types'
import { buildExportData, rpcTripsPayload, type ExportData } from '../export/build'
import { draftsForExport, exportBlockReason, nextVersion, tripsForExport, tripsOfExport } from '../export/select'
import type { AppData } from '../hooks/useData'
import { monthOf, yearOf } from '../lib/dates'
import type { SyncState } from '../sync/engine'
import { monthsBehind } from './retard'

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

// Deux préparations verrouilleraient-elles le même export ? Comparé juste avant l'appel réseau
// (voir doExport dans Recap.tsx) entre l'aperçu confirmé par l'utilisateur et un aperçu recalculé
// sur les données les plus fraîches (après synchro) : une différence signifie qu'une donnée a
// changé entre-temps (édition distante, chaîne du barème modifiée…) et que les montants confirmés
// ne doivent pas être figés tels quels.
export function sameExport(a: PreparedExport, b: PreparedExport): boolean {
  if (a.data.version !== b.data.version) return false
  if (a.data.bareme_annee !== b.data.bareme_annee) return false
  if (a.data.bareme_provisoire !== b.data.bareme_provisoire) return false
  if (a.payload.length !== b.payload.length) return false
  const montants = new Map(b.payload.map((l) => [l.id, l.montant_bareme]))
  if (a.payload.some((l) => montants.get(l.id) !== l.montant_bareme)) return false
  const t1 = a.data.totaux
  const t2 = b.data.totaux
  return t1.km === t2.km && t1.bareme === t2.bareme && t1.frais === t2.frais && t1.total === t2.total && t1.nb_trajets === t2.nb_trajets
}

// Fichier à partager juste après un export réussi. Une synchro en tâche de fond peut avoir couru
// en même temps que le RPC (le pull récupère les trajets avant les exports, et un trajet encore
// « dirty » localement est ignoré) : l'enregistrement d'export peut donc être arrivé localement
// avant que ses trajets ne portent export_id / statut 'exporte'. Dans ce cas, `rebuilt` (reconstruit
// depuis les données locales à cet instant) serait vide, partiel ou à 0 € — on ne le retient que
// s'il correspond bien à ce qui a été effectivement verrouillé (`sent`) ; sinon on repart de `sent`
// (déjà correct puisqu'il vient de ce qui a été envoyé au serveur), avec la date de l'enregistrement
// serveur si on l'a.
export function fileToShare(sent: PreparedExport, rebuilt: ExportData | null, record: ExportRecord | null): ExportData {
  if (rebuilt && sameExport(sent, { data: rebuilt, payload: rpcTripsPayload(rebuilt) })) return rebuilt
  return record ? { ...sent.data, genere_le: record.created_at } : sent.data
}

// Montant de chaque carte Récap : indemnités kilométriques, avec leur nature en seconde ligne
// (remboursement de frais professionnels pour la SAS, charge déductible pour l'EI LMNP).
export const TOTAL_TITRE = 'Indemnités kilométriques'
export const TOTAL_NATURE: Record<Activite, string> = {
  swing_house: 'À rembourser',
  lmnp: 'Charge déductible',
}

// Montant négatif dans l'aperçu : on prévient sans bloquer (l'invariant de la chaîne garde le total
// annuel juste ; c'est le signe qu'un barème ou une puissance fiscale a changé après un export).
export const NEGATIF_AVERTISSEMENT =
  'Un montant est négatif : le barème ou la puissance du véhicule a changé après un export. Vérifie avant d’exporter.'

export const SYNC_INCOMPLETE = 'Synchronisation incomplète : vérifie le réseau puis relance l’export.'

// Garde juste avant le RPC (après la synchro) : le serveur fige ce qu'IL a. Si une ligne locale
// n'est pas encore arrivée (trajet, frais, véhicule, lieu, choix fiscal, barème) ou si la synchro
// a échoué, les montants confirmés pourraient ne pas correspondre aux données serveur : on
// n'exporte pas. countDirty couvre exactement les tables synchronisées (SYNC_TABLES).
export async function syncIncompleteReason(database: CarnetDB, state: Pick<SyncState, 'status'> | null): Promise<string | null> {
  if (state && state.status !== 'idle') return SYNC_INCOMPLETE
  return (await countDirty(database)) > 0 ? SYNC_INCOMPLETE : null
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
    data: app, calc, genere_le: rec.created_at, record: rec,
  })
}

// Mention du mode fiscal sur la carte Récap : en frais réels, le barème à 0 € est voulu (spec §6.4).
export function modeNote(d: Pick<ExportData, 'mode'> | null): string | null {
  return d?.mode === 'frais_reels' ? 'Frais réels : barème non appliqué.' : null
}

// Récap s'ouvre sur le plus ancien mois en retard (même règle que les bandeaux), sinon le mois en cours.
export function defaultRecapMonth(app: AppData, today: string): string {
  const mois = monthOf(today)
  return monthsBehind(app, mois)[0]?.[0] ?? mois
}


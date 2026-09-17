import type { Cursor, RemoteApi, ServerRow } from './remote'

// Forme d'un uuid Postgres (les 4 groupes hexadécimaux séparés par des tirets) : validation de
// forme seulement, pas une implémentation complète du typage Postgres — inutile ici.
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Failure = { code: string; error: string }

const FIN_INFINIE = '9999-12-31'

// Contraintes réelles reproduites (option `constraints`), vérifiées ligne par ligne dans l'ordre
// du lot comme le fait un INSERT … ON CONFLICT multi-lignes (contraintes non différées) :
// - vehicles_sans_chevauchement : deux véhicules non supprimés ne partagent aucun jour ([] inclusif) ;
// - trips.vehicle_id → vehicles.id (clé étrangère, indépendante de deleted_at).
function violation(name: string, row: ServerRow, state: (t: string) => Map<string, ServerRow>): Failure | null {
  if (name === 'vehicles' && row.deleted_at == null) {
    const debut = row.date_debut as string
    const fin = (row.date_fin as string | null) ?? FIN_INFINIE
    for (const other of state('vehicles').values()) {
      if (other.id === row.id || other.deleted_at != null) continue
      const oFin = (other.date_fin as string | null) ?? FIN_INFINIE
      if (debut <= oFin && (other.date_debut as string) <= fin) {
        return { code: '23P01', error: 'conflicting key value violates exclusion constraint "vehicles_sans_chevauchement"' }
      }
    }
  }
  if (name === 'trips' && row.vehicle_id != null && !state('vehicles').has(row.vehicle_id as string)) {
    return { code: '23503', error: 'insert or update on table "trips" violates foreign key constraint "trips_vehicle_id_fkey"' }
  }
  return null
}

// Faux Supabase en mémoire : horodate chaque écriture, peut refuser des ids ou simuler une coupure.
// Un lot est atomique (une seule instruction SQL) : tout passe, ou rien n'est écrit.
export function fakeRemote(opts: { constraints?: boolean } = {}) {
  const tables = new Map<string, Map<string, ServerRow>>()
  const rejectIds = new Set<string>() // refus métier P0001 (trajet exporté)
  const failIds = new Map<string, Failure>() // refus SQL quelconque, code au choix
  let offline = false
  let clock = 0
  const tick = () => new Date(Date.UTC(2026, 8, 15, 10, 0, 0, clock++)).toISOString()
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map())
    return tables.get(name)!
  }
  const api: RemoteApi = {
    async upsert(name, rows) {
      if (offline) return { error: 'Failed to fetch', code: null, fatal: true }
      if (rows.some((r) => rejectIds.has(r.id as string))) {
        return { error: 'Trajet exporté : verrouillé (le rouvrir d’abord)', code: 'P0001', fatal: false }
      }
      const failed = rows.map((r) => failIds.get(r.id as string)).find((f) => f != null)
      if (failed) return { ...failed, fatal: false }
      // Écriture sur une copie : validée seulement si toutes les lignes passent.
      const draft = new Map([...tables].map(([k, v]) => [k, new Map(v)]))
      const state = (t: string) => {
        if (!draft.has(t)) draft.set(t, new Map())
        return draft.get(t)!
      }
      for (const r of rows) {
        const row = { ...(r as ServerRow), updated_at: tick() }
        const v = opts.constraints ? violation(name, row, state) : null
        if (v) return { ...v, fatal: false }
        state(name).set(row.id, row)
      }
      tables.clear()
      for (const [k, v] of draft) tables.set(k, v)
      return { error: null, code: null, fatal: false }
    },
    async fetchSince(name, cursor: Cursor | null, limit) {
      if (offline) return { rows: [], error: 'Failed to fetch' }
      // Garde-fou ajouté après un bug réel passé inaperçu : la colonne `id` est un uuid en base,
      // et ce double comparait auparavant les identifiants avec `>` sur des chaînes quelconques —
      // il acceptait donc un curseur à id vide que le vrai Postgres rejette (22P02). On reproduit
      // ce refus pour que le double reste fidèle sur ce point.
      if (cursor && !UUID_SHAPE.test(cursor.id)) {
        return { rows: [], error: `invalid input syntax for type uuid: "${cursor.id}"` }
      }
      const apresCurseur = (r: ServerRow) =>
        !cursor ||
        r.updated_at > cursor.updatedAt ||
        (r.updated_at === cursor.updatedAt && (r.id as string) > cursor.id)
      const rows = [...table(name).values()]
        .filter(apresCurseur)
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || (a.id as string).localeCompare(b.id as string))
        .slice(0, limit)
      return { rows, error: null }
    },
    async fetchById(name, id) {
      return table(name).get(id) ?? null
    },
  }
  return {
    api,
    rejectIds,
    failIds,
    setOffline: (v: boolean) => {
      offline = v
    },
    put: <T extends { id: string }>(name: string, row: T) => table(name).set(row.id, { ...(row as ServerRow), updated_at: tick() }),
    // N'existe que pour reproduire en test le cas où plusieurs lignes partagent exactement le même
    // horodatage serveur (pagination bloquée) : `put` incrémente toujours l'horloge, donc ne peut pas créer ce cas.
    putAt: <T extends { id: string }>(name: string, row: T, updatedAt: string) =>
      table(name).set(row.id, { ...(row as ServerRow), updated_at: updatedAt }),
    get: (name: string, id: string) => table(name).get(id),
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'

export type ServerRow = Record<string, unknown> & { id: string; updated_at: string }

export interface UpsertResult {
  error: string | null
  code: string | null // SQLSTATE Postgres (ex. P0001) ou code PostgREST (PGRST…) ; null si absent
  fatal: boolean // réseau ou session : inutile d'insister ligne par ligne
}

// Refus métier explicite (verrou d'un trajet exporté, levé par nos triggers et RPC) : seul cas où
// la version serveur doit remplacer la version locale.
export const CODE_VERROU = 'P0001'
// Violation d'unicité (ex. fiscal_years_unique sur (annee, activite)).
export const CODE_DOUBLON = '23505'

// Curseur de pagination du pull : clé composite (updated_at, id), strictement croissante.
// Un simple updated_at ne suffit pas : si plus d'une page de lignes partage le même horodatage,
// il faut départager avec l'id pour que le curseur avance toujours (voir fetchSince).
export interface Cursor {
  updatedAt: string
  id: string
}

export interface RemoteApi {
  upsert(table: string, rows: Record<string, unknown>[]): Promise<UpsertResult>
  fetchSince(table: string, cursor: Cursor | null, limit: number): Promise<{ rows: ServerRow[]; error: string | null }>
  // null = ligne absente du serveur. Toute erreur de lecture lève une SyncError (jamais null) :
  // confondre « absente » et « illisible » ferait mettre à l'écart une ligne que le serveur a.
  fetchById(table: string, id: string): Promise<ServerRow | null>
  // Ligne non supprimée correspondant exactement à `match` (ex. choix fiscal d'une année), mêmes règles.
  fetchActiveBy(table: string, match: Record<string, string | number>): Promise<ServerRow | null>
}

export class SyncError extends Error {
  fatal: boolean
  constructor(message: string, fatal: boolean) {
    super(message)
    this.fatal = fatal
  }
}

// Erreur « fatale » = transitoire ou globale (réseau, session, base indisponible) : on arrête le
// cycle et on réessaiera plus tard, sans isoler les lignes une à une.
// - pas de code : réseau (fetch échoué) ;
// - PGRST0xx : PostgREST ne joint pas la base (connexion, cache de schéma, délai de pool) ;
// - PGRST3xx : session / JWT ;
// - 08xxx : connexion Postgres perdue ; 57014 : délai d'exécution dépassé (statement timeout).
// Tout le reste (SQLSTATE métier ou contrainte, PGRST1xx/2xx) est un refus propre à la ligne.
export function isFatal(code: string | null | undefined): boolean {
  if (!code) return true
  return code.startsWith('PGRST0') || code.startsWith('PGRST3') || code.startsWith('08') || code === '57014'
}

export function supabaseRemote(client: SupabaseClient): RemoteApi {
  return {
    async upsert(table, rows) {
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' })
      return error
        ? { error: error.message, code: error.code || null, fatal: isFatal(error.code) }
        : { error: null, code: null, fatal: false }
    },
    async fetchSince(table, cursor, limit) {
      let q = client
        .from(table)
        .select('*')
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit)
      if (cursor) {
        // Strictement après la clé composite : updated_at postérieur, ou updated_at égal et id supérieur.
        // Les valeurs sont entre guillemets doubles car un horodatage contient des caractères (+, :)
        // qui ont un sens dans la syntaxe de filtre PostgREST.
        q = q.or(
          `updated_at.gt."${cursor.updatedAt}",and(updated_at.eq."${cursor.updatedAt}",id.gt."${cursor.id}")`,
        )
      }
      const { data, error } = await q
      return { rows: (data ?? []) as ServerRow[], error: error?.message ?? null }
    },
    async fetchById(table, id) {
      const { data, error } = await client.from(table).select('*').eq('id', id).maybeSingle()
      if (error) throw new SyncError(error.message, isFatal(error.code))
      return (data as ServerRow | null) ?? null
    },
    async fetchActiveBy(table, match) {
      const { data, error } = await client.from(table).select('*').match(match).is('deleted_at', null).maybeSingle()
      if (error) throw new SyncError(error.message, isFatal(error.code))
      return (data as ServerRow | null) ?? null
    },
  }
}

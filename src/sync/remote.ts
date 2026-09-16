import type { SupabaseClient } from '@supabase/supabase-js'

export type ServerRow = Record<string, unknown> & { id: string; updated_at: string }

export interface UpsertResult {
  error: string | null
  fatal: boolean // réseau ou session : inutile d'insister ligne par ligne
}

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
  fetchById(table: string, id: string): Promise<ServerRow | null>
}

export class SyncError extends Error {
  fatal: boolean
  constructor(message: string, fatal: boolean) {
    super(message)
    this.fatal = fatal
  }
}

// Erreurs métier Postgres = code SQLSTATE (ex. P0001). Pas de code = réseau ; PGRST3xx = session.
const isFatal = (code: string | undefined) => !code || code.startsWith('PGRST3')

export function supabaseRemote(client: SupabaseClient): RemoteApi {
  return {
    async upsert(table, rows) {
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' })
      return error ? { error: error.message, fatal: isFatal(error.code) } : { error: null, fatal: false }
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
      const { data } = await client.from(table).select('*').eq('id', id).maybeSingle()
      return (data as ServerRow | null) ?? null
    },
  }
}

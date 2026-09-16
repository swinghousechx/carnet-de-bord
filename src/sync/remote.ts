import type { SupabaseClient } from '@supabase/supabase-js'

export type ServerRow = Record<string, unknown> & { id: string; updated_at: string }

export interface UpsertResult {
  error: string | null
  fatal: boolean // réseau ou session : inutile d'insister ligne par ligne
}

export interface RemoteApi {
  upsert(table: string, rows: Record<string, unknown>[]): Promise<UpsertResult>
  fetchSince(table: string, cursor: string | null, limit: number): Promise<{ rows: ServerRow[]; error: string | null }>
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
      let q = client.from(table).select('*').order('updated_at', { ascending: true }).limit(limit)
      if (cursor) q = q.gte('updated_at', cursor)
      const { data, error } = await q
      return { rows: (data ?? []) as ServerRow[], error: error?.message ?? null }
    },
    async fetchById(table, id) {
      const { data } = await client.from(table).select('*').eq('id', id).maybeSingle()
      return (data as ServerRow | null) ?? null
    },
  }
}

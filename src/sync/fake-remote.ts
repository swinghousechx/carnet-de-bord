import type { RemoteApi, ServerRow } from './remote'

// Faux Supabase en mémoire : horodate chaque écriture, peut refuser des ids ou simuler une coupure.
export function fakeRemote() {
  const tables = new Map<string, Map<string, ServerRow>>()
  const rejectIds = new Set<string>()
  let offline = false
  let clock = 0
  const tick = () => new Date(Date.UTC(2026, 8, 15, 10, 0, 0, clock++)).toISOString()
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map())
    return tables.get(name)!
  }
  const api: RemoteApi = {
    async upsert(name, rows) {
      if (offline) return { error: 'Failed to fetch', fatal: true }
      if (rows.some((r) => rejectIds.has(r.id as string))) return { error: 'Trajet exporté : verrouillé', fatal: false }
      for (const r of rows) table(name).set(r.id as string, { ...(r as ServerRow), updated_at: tick() })
      return { error: null, fatal: false }
    },
    async fetchSince(name, cursor, limit) {
      if (offline) return { rows: [], error: 'Failed to fetch' }
      const rows = [...table(name).values()]
        .filter((r) => !cursor || r.updated_at >= cursor)
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
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
    setOffline: (v: boolean) => {
      offline = v
    },
    put: <T extends { id: string }>(name: string, row: T) => table(name).set(row.id, { ...(row as ServerRow), updated_at: tick() }),
    get: (name: string, id: string) => table(name).get(id),
  }
}

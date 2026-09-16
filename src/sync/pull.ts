import { PULL_TABLES, type CarnetDB, type Local } from '../db/db'
import { getMeta, setMeta } from '../db/repo'
import { SyncError, type RemoteApi } from './remote'

type AnyLocal = Local<{ id: string }>

// Tire les lignes modifiées depuis le dernier curseur (updated_at serveur), table par table.
export async function pullAll(db: CarnetDB, remote: RemoteApi, pageSize = 1000): Promise<number> {
  let count = 0
  for (const table of PULL_TABLES) {
    const key = `cursor:${table}`
    let cursor = await getMeta(db, key)
    for (;;) {
      const { rows, error } = await remote.fetchSince(table, cursor, pageSize)
      if (error) throw new SyncError(error, true)
      const tbl = db.table<AnyLocal, string>(table)
      await db.transaction('rw', tbl, async () => {
        for (const row of rows) {
          const local = await tbl.get(row.id)
          if (local?._dirty === 1) continue // la version locale partira au prochain push
          await tbl.put({ ...row, _dirty: 0, _rev: local?._rev ?? 0 } as AnyLocal)
        }
      })
      count += rows.length
      const last = rows.at(-1)?.updated_at
      const avance = last != null && last !== cursor
      if (last != null) {
        cursor = last
        await setMeta(db, key, cursor)
      }
      if (rows.length < pageSize || !avance) break
    }
  }
  return count
}

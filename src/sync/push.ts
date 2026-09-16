import { SYNC_TABLES, type CarnetDB, type Local } from '../db/db'
import { SyncError, type RemoteApi, type ServerRow } from './remote'

export interface Rejection {
  table: string
  id: string
  error: string
}

export interface PushResult {
  pushed: number
  rejected: Rejection[]
}

type AnyLocal = Local<{ id: string }>

// Ce qui part au serveur : ni champs locaux, ni owner_id (posé par défaut = auth.uid()).
export function toServer(row: object): Record<string, unknown> {
  const copy = { ...row } as Record<string, unknown>
  delete copy._dirty
  delete copy._rev
  delete copy.owner_id
  return copy
}

// Ne marque propre que si la ligne n'a pas été réécrite localement pendant l'envoi.
async function markClean(db: CarnetDB, table: string, rows: AnyLocal[]) {
  const tbl = db.table<AnyLocal, string>(table)
  await db.transaction('rw', tbl, async () => {
    for (const row of rows) {
      const cur = await tbl.get(row.id)
      if (cur && cur._rev === row._rev) await tbl.update(row.id, { _dirty: 0 })
    }
  })
}

// Refus durable du serveur : on ne remplace la ligne locale par la version serveur que si elle n'a
// pas été réécrite localement depuis la capture du lot (même logique que markClean, en écriture).
// Si _rev a bougé, on ne touche à rien : la ligne reste « à pousser » et repartira au prochain cycle.
async function replaceWithServerIfUnchanged(db: CarnetDB, table: string, row: AnyLocal, server: ServerRow) {
  const tbl = db.table<AnyLocal, string>(table)
  await db.transaction('rw', tbl, async () => {
    const cur = await tbl.get(row.id)
    if (cur && cur._rev === row._rev) await tbl.put({ ...server, _dirty: 0, _rev: row._rev } as AnyLocal)
  })
}

export async function pushDirty(db: CarnetDB, remote: RemoteApi): Promise<PushResult> {
  const result: PushResult = { pushed: 0, rejected: [] }
  for (const table of SYNC_TABLES) {
    const tbl = db.table<AnyLocal, string>(table)
    const dirty = await tbl.where('_dirty').equals(1).toArray()
    if (dirty.length === 0) continue

    const batch = await remote.upsert(table, dirty.map(toServer))
    if (!batch.error) {
      await markClean(db, table, dirty)
      result.pushed += dirty.length
      continue
    }
    if (batch.fatal) throw new SyncError(batch.error, true)

    // Lot refusé : on isole la ou les lignes fautives.
    for (const row of dirty) {
      const one = await remote.upsert(table, [toServer(row)])
      if (!one.error) {
        await markClean(db, table, [row])
        result.pushed++
        continue
      }
      if (one.fatal) throw new SyncError(one.error, true)
      const server: ServerRow | null = await remote.fetchById(table, row.id)
      if (server) await replaceWithServerIfUnchanged(db, table, row, server)
      result.rejected.push({ table, id: row.id, error: one.error })
    }
  }
  return result
}

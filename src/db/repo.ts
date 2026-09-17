import type { BaseRow } from '../domain/types'
import { nowISO } from '../lib/dates'
import { MISE_A_L_ECART, SYNC_TABLES, type CarnetDB, type Local, type RowOf, type SyncTableName } from './db'

const listeners = new Set<() => void>()

// Le moteur de synchro s'abonne ici pour pousser peu après chaque écriture.
export function onLocalWrite(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function newId(): string {
  return crypto.randomUUID()
}

export function newRow<T extends BaseRow>(fields: Omit<T, keyof BaseRow>): T {
  const now = nowISO()
  return { ...fields, id: newId(), created_at: now, updated_at: now, deleted_at: null } as T
}

export function stripLocal<T extends object>(row: T): Omit<T, '_dirty' | '_rev'> {
  const copy = { ...row } as Record<string, unknown>
  delete copy._dirty
  delete copy._rev
  return copy as Omit<T, '_dirty' | '_rev'>
}

export async function saveRows<K extends SyncTableName>(db: CarnetDB, table: K, rows: RowOf[K][]): Promise<void> {
  const tbl = db.table<Local<RowOf[K]>, string>(table)
  await db.transaction('rw', tbl, async () => {
    for (const row of rows) {
      const existing = await tbl.get(row.id)
      await tbl.put({ ...row, updated_at: nowISO(), _dirty: 1, _rev: (existing?._rev ?? 0) + 1 } as unknown as Local<RowOf[K]>)
    }
  })
  listeners.forEach((fn) => fn())
}

export function saveRow<K extends SyncTableName>(db: CarnetDB, table: K, row: RowOf[K]): Promise<void> {
  return saveRows(db, table, [row])
}

export async function softDelete<K extends SyncTableName>(db: CarnetDB, table: K, id: string): Promise<void> {
  const row = await db.table<Local<RowOf[K]>, string>(table).get(id)
  if (!row) return
  await saveRow(db, table, { ...stripLocal(row), deleted_at: nowISO() } as unknown as RowOf[K])
}

export async function countDirty(db: CarnetDB): Promise<number> {
  const counts = await Promise.all(SYNC_TABLES.map((t) => db.table(t).where('_dirty').equals(1).count()))
  return counts.reduce((a, b) => a + b, 0)
}

export async function countQuarantined(db: CarnetDB): Promise<number> {
  const counts = await Promise.all(SYNC_TABLES.map((t) => db.table(t).where('_dirty').equals(MISE_A_L_ECART).count()))
  return counts.reduce((a, b) => a + b, 0)
}

// Remet à pousser les lignes mises à l'écart (ex. après réouverture du trajet concerné).
export async function retryQuarantined(db: CarnetDB): Promise<number> {
  let n = 0
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const t of SYNC_TABLES) n += await db.table(t).where('_dirty').equals(MISE_A_L_ECART).modify({ _dirty: 1 })
  })
  if (n > 0) listeners.forEach((fn) => fn())
  return n
}

export async function getMeta(db: CarnetDB, key: string): Promise<string | null> {
  return (await db.meta.get(key))?.value ?? null
}

export async function setMeta(db: CarnetDB, key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

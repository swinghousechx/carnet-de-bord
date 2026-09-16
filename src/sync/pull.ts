import { PULL_TABLES, type CarnetDB, type Local } from '../db/db'
import { getMeta, setMeta } from '../db/repo'
import { SyncError, type Cursor, type RemoteApi } from './remote'

type AnyLocal = Local<{ id: string }>

// Le curseur mémorisé dans `meta` était autrefois un simple horodatage (chaîne). On l'accepte
// encore sous cette ancienne forme, en le traitant comme (horodatage, identifiant vide) : cela
// évite de planter ou de tout re-télécharger pour les curseurs déjà enregistrés avant ce format.
function parseCursor(raw: string | null): Cursor | null {
  if (raw == null) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && typeof (parsed as Cursor).updatedAt === 'string') {
      const c = parsed as Cursor
      return { updatedAt: c.updatedAt, id: typeof c.id === 'string' ? c.id : '' }
    }
  } catch {
    // Pas du JSON : c'est l'ancien format, une chaîne d'horodatage brute.
  }
  return { updatedAt: raw, id: '' }
}

// Tire les lignes modifiées depuis le dernier curseur, table par table.
//
// Le curseur est une clé composite (updated_at, id) : le tri et le filtre côté serveur portent sur
// cette paire, strictement croissante, ce qui garantit que le curseur avance toujours d'une page à
// l'autre — même quand plus d'une page de lignes partage exactement le même updated_at. La boucle
// s'arrête simplement quand une page n'est pas pleine.
export async function pullAll(db: CarnetDB, remote: RemoteApi, pageSize = 1000): Promise<number> {
  let count = 0
  for (const table of PULL_TABLES) {
    const key = `cursor:${table}`
    let cursor = parseCursor(await getMeta(db, key))
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
      const last = rows.at(-1)
      if (last != null) {
        cursor = { updatedAt: last.updated_at, id: last.id }
        await setMeta(db, key, JSON.stringify(cursor))
      }
      if (rows.length < pageSize) break
    }
  }
  return count
}

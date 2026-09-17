import { MISE_A_L_ECART, SYNC_TABLES, type CarnetDB, type Local } from '../db/db'
import { CODE_VERROU, SyncError, type RemoteApi, type ServerRow } from './remote'

export interface Rejection {
  table: string
  id: string
  error: string
  code: string | null // P0001 = verrou métier (version serveur rétablie) ; sinon la ligne reste à pousser
  quarantaine?: true // P0001 sur une ligne inconnue du serveur : mise à l'écart (voir db.ts)
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

// Ordre d'envoi au sein d'une table. Pour `vehicles`, la contrainte d'exclusion
// vehicles_sans_chevauchement est vérifiée ligne par ligne : il faut d'abord libérer les périodes
// (suppressions logiques, puis véhicules clôturés, qui ont une date de fin) avant d'insérer ou
// d'étendre un véhicule sans date de fin. Sinon, un changement de voiture poussé dans le désordre
// échoue (23P01), puis les trajets déplacés échouent à leur tour (clé étrangère, 23503).
export function pushOrder<T extends AnyLocal>(table: string, rows: T[]): T[] {
  if (table !== 'vehicles') return rows
  const rank = (r: T) => {
    const v = r as unknown as { deleted_at: string | null; date_fin: string | null }
    return v.deleted_at != null ? 0 : v.date_fin != null ? 1 : 2
  }
  return [...rows].sort((a, b) => rank(a) - rank(b))
}

// Verrou métier sur une ligne que le serveur n'a jamais reçue : pas de version serveur à rétablir.
// La renvoyer bloquerait la synchro et l'export indéfiniment ; la supprimer ferait perdre la saisie.
// On la met à l'écart (même garde _rev que markClean).
async function quarantineIfUnchanged(db: CarnetDB, table: string, row: AnyLocal): Promise<boolean> {
  const tbl = db.table<AnyLocal, string>(table)
  return db.transaction('rw', tbl, async () => {
    const cur = await tbl.get(row.id)
    if (!cur || cur._rev !== row._rev) return false
    await tbl.update(row.id, { _dirty: MISE_A_L_ECART })
    return true
  })
}

export async function pushDirty(db: CarnetDB, remote: RemoteApi): Promise<PushResult> {
  const result: PushResult = { pushed: 0, rejected: [] }
  for (const table of SYNC_TABLES) {
    const tbl = db.table<AnyLocal, string>(table)
    const dirty = pushOrder(table, await tbl.where('_dirty').equals(1).toArray())
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
      // Seul le verrou métier (ligne exportée) justifie de rétablir la version serveur. Toute autre
      // erreur (contrainte, clé étrangère, droits…) peut venir d'un ordre d'envoi ou d'un état
      // transitoire : écraser la saisie locale ferait perdre une modification (ex. trajets remis
      // sur l'ancien véhicule). La ligne reste donc à pousser et le refus est signalé.
      let quarantaine = false
      if (one.code === CODE_VERROU) {
        const server: ServerRow | null = await remote.fetchById(table, row.id)
        if (server) await replaceWithServerIfUnchanged(db, table, row, server)
        else quarantaine = await quarantineIfUnchanged(db, table, row)
      }
      result.rejected.push({ table, id: row.id, error: one.error, code: one.code, ...(quarantaine ? { quarantaine: true as const } : {}) })
    }
  }
  return result
}

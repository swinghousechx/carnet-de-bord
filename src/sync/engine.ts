import type { CarnetDB } from '../db/db'
import { countDirty, countQuarantined, onLocalWrite } from '../db/repo'
import { nowISO } from '../lib/dates'
import { pullAll } from './pull'
import { pushDirty } from './push'
import { CODE_VERROU, SyncError, type RemoteApi } from './remote'

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error'
  pending: number
  quarantined: number // lignes mises à l'écart (refus définitif du serveur), conservées sur l'appareil
  lastSync: string | null
  message: string | null
}

export interface SyncEngine {
  syncNow(): Promise<void>
  schedule(): void
  start(): () => void
  getState(): SyncState
  subscribe(fn: (s: SyncState) => void): () => void
}

export interface EngineOptions {
  db: CarnetDB
  remote: RemoteApi
  afterPull?: () => Promise<void> // amorçage du barème, calcul des km en attente…
  isOnline?: () => boolean
  intervalMs?: number
}

export function createSyncEngine(opts: EngineOptions): SyncEngine {
  const isOnline = opts.isOnline ?? (() => navigator.onLine)
  let state: SyncState = { status: 'idle', pending: 0, quarantined: 0, lastSync: null, message: null }
  const subs = new Set<(s: SyncState) => void>()
  let running: Promise<void> | null = null
  let rerun = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const set = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch }
    subs.forEach((fn) => fn(state))
  }

  async function run() {
    if (!isOnline()) {
      set({ status: 'offline', pending: await countDirty(opts.db) })
      return
    }
    set({ status: 'syncing' })
    try {
      const premier = await pushDirty(opts.db, opts.remote)
      await pullAll(opts.db, opts.remote)
      await opts.afterPull?.()
      const second = (await countDirty(opts.db)) > 0 ? await pushDirty(opts.db, opts.remote) : null
      // Refus « verrou » : définitifs (version serveur rétablie), on cumule les deux envois sans
      // doublon. Autres refus : la ligne reste à pousser et le dernier envoi fait foi (un refus levé
      // au second envoi n'est plus une erreur, un refus apparu au second envoi en est une).
      const verrous = new Set(
        [...premier.rejected, ...(second?.rejected ?? [])]
          .filter((r) => r.code === CODE_VERROU && !r.quarantaine)
          .map((r) => `${r.table}|${r.id}`),
      ).size
      // Mises à l'écart : état persistant, compté en base à chaque cycle pour rester visible.
      const ecartees = await countQuarantined(opts.db)
      const enAttente = (second ?? premier).rejected.filter((r) => r.code !== CODE_VERROU)
      const messages = [
        enAttente.length > 0 ? `${enAttente.length} modification(s) non synchronisée(s) : ${enAttente[0].error}` : '',
        verrous > 0 ? `${verrous} modification(s) refusée(s) par le serveur (trajet exporté ?)` : '',
        ecartees > 0
          ? `${ecartees} modification(s) refusée(s) par le serveur (donnée verrouillée) et mise(s) à l’écart : conservée(s) sur l’appareil mais ignorée(s)`
          : '',
      ].filter(Boolean)
      set({
        // Des lignes restent à pousser à cause d'un refus serveur : c'est une erreur visible.
        status: enAttente.length > 0 ? 'error' : 'idle',
        lastSync: nowISO(),
        message: messages.length > 0 ? messages.join(' · ') : null,
      })
    } catch (e) {
      const fatal = e instanceof SyncError && e.fatal
      set({ status: fatal ? 'offline' : 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ pending: await countDirty(opts.db), quarantined: await countQuarantined(opts.db) })
    }
  }

  function syncNow(): Promise<void> {
    if (running) {
      rerun = true
      return running
    }
    running = (async () => {
      do {
        rerun = false
        await run()
      } while (rerun)
      running = null
    })()
    return running
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(() => void syncNow(), 2000)
  }

  function start() {
    const onOnline = () => void syncNow()
    const onOffline = () => set({ status: 'offline' })
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const interval = setInterval(() => void syncNow(), opts.intervalMs ?? 60_000)
    const off = onLocalWrite(schedule)
    void syncNow()
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(interval)
      clearTimeout(timer)
      off()
    }
  }

  return { syncNow, schedule, start, getState: () => state, subscribe: (fn) => (subs.add(fn), () => void subs.delete(fn)) }
}

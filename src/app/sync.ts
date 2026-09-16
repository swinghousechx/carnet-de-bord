import { SYNC_INTERVAL_MS } from '../config'
import { db } from '../db/db'
import { computeRouteKm, mapsConfigured } from '../geo/maps'
import { resolvePendingKm } from '../geo/pending'
import { createSyncEngine, type SyncEngine } from '../sync/engine'
import { supabaseRemote } from '../sync/remote'
import { ensureBaremeSeed } from './seed'
import { supabase } from './supabase'

export const syncEngine: SyncEngine | null = supabase
  ? createSyncEngine({
      db,
      remote: supabaseRemote(supabase),
      intervalMs: SYNC_INTERVAL_MS,
      afterPull: async () => {
        await ensureBaremeSeed(db)
        if (mapsConfigured()) await resolvePendingKm(db, computeRouteKm)
      },
    })
  : null

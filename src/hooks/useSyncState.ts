import { useEffect, useState } from 'react'
import { syncEngine } from '../app/sync'
import type { SyncState } from '../sync/engine'

const NON_CONFIGURE: SyncState = { status: 'offline', pending: 0, lastSync: null, message: 'Synchro non configurée' }

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(() => syncEngine?.getState() ?? NON_CONFIGURE)
  useEffect(() => syncEngine?.subscribe(setState), [])
  return state
}

import { useSyncState } from '../hooks/useSyncState'
import { nb } from '../lib/format'

export function SyncBadge() {
  const s = useSyncState()
  const text =
    s.status === 'syncing' ? 'Synchro…'
    : s.status === 'offline' ? 'Hors ligne'
    : s.status === 'error' ? 'Erreur de synchro'
    : s.pending > 0 ? `${s.pending} en attente`
    : s.quarantined > 0 ? nb(s.quarantined, 'refusée', 'refusées')
    : null
  if (!text) return null
  return <span className={`text-[13px] ${s.status === 'error' || (s.status === 'idle' && s.pending === 0 && s.quarantined > 0) ? 'text-red' : 'text-label2'}`}>{text}</span>
}

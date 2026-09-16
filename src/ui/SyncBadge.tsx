import { useSyncState } from '../hooks/useSyncState'

export function SyncBadge() {
  const s = useSyncState()
  const text =
    s.status === 'syncing' ? 'Synchro…'
    : s.status === 'offline' ? 'Hors ligne'
    : s.status === 'error' ? 'Erreur de synchro'
    : s.pending > 0 ? `${s.pending} en attente`
    : null
  if (!text) return null
  return <span className={`text-[13px] ${s.status === 'error' ? 'text-red' : 'text-label2'}`}>{text}</span>
}

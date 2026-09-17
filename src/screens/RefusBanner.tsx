import { useSyncState } from '../hooks/useSyncState'
import { Banner } from '../ui/Banner'
import type { Tab } from '../ui/TabBar'

// Lignes mises à l'écart par la synchro (refus définitif du serveur) : bandeau commun aux vues
// Mois et Année du Récap. Non bloquant : ces lignes sont ignorées des calculs, les montants portent
// sur les données du serveur.
export function RefusBanner({ onGoto }: { onGoto: (t: Tab) => void }) {
  const sync = useSyncState()
  if (sync.quarantined === 0) return null
  return (
    <Banner onClick={() => onGoto('settings')}>
      {sync.quarantined} modification(s) refusée(s) par le serveur et ignorée(s) dans ce récap : voir Réglages.
    </Banner>
  )
}

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
      {sync.quarantined > 1
        ? `${sync.quarantined} modifications refusées par le serveur et ignorées dans ce récap : voir Réglages.`
        : '1 modification refusée par le serveur et ignorée dans ce récap : voir Réglages.'}
    </Banner>
  )
}

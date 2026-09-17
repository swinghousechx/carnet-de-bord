import type { ReactNode } from 'react'
import { IconChevron } from './icons'

// Sans `onClick`, le bandeau est une simple information (pas de chevron ni d'état actif) : il ne
// doit jamais avoir l'air tapable s'il ne fait rien. Avec `onClick`, il garde le rendu « bouton »
// existant (Accueil, Réglages).
export function Banner({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const dot = <span className="size-2 shrink-0 rounded-full bg-orange" />
  if (!onClick) {
    return (
      <div className="mx-4 mb-6 flex items-center gap-3 rounded-[10px] bg-cell px-4 py-3 text-left text-[15px]">
        {dot}
        <span className="flex-1">{children}</span>
      </div>
    )
  }
  return (
    <div className="mx-4 mb-6">
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-[10px] bg-cell px-4 py-3 text-left text-[15px] transition-colors duration-300 active:bg-fill active:duration-0">
        {dot}
        <span className="flex-1">{children}</span>
        <IconChevron className="size-4 text-label3" />
      </button>
    </div>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { NavButton } from './NavBar'

export interface SheetProps {
  open: boolean
  title: string
  onCancel: () => void
  cancelLabel?: string | null // null : pas de bouton à gauche (l’écran a sa propre sortie)
  onConfirm?: () => void
  confirmLabel?: string
  confirmDisabled?: boolean
  children: ReactNode
}

// Feuille modale iOS : monte du bas, « Annuler » à gauche, action principale à droite.
export function Sheet({ open, title, onCancel, cancelLabel = 'Annuler', onConfirm, confirmLabel = 'OK', confirmDisabled, children }: SheetProps) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!open) return setShown(false)
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40">
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`} onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] bottom-0 flex flex-col rounded-t-[12px] bg-bg transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${shown ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <header className="flex h-14 shrink-0 items-center justify-between px-4">
          {cancelLabel != null ? <NavButton onClick={onCancel}>{cancelLabel}</NavButton> : <span className="min-w-11" />}
          <h2 className="truncate px-2 text-[17px] font-semibold">{title}</h2>
          {onConfirm ? (
            <NavButton onClick={onConfirm} disabled={confirmDisabled} bold>
              {confirmLabel}
            </NavButton>
          ) : (
            <span className="min-w-11" />
          )}
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+24px)]">{children}</div>
      </div>
    </div>
  )
}

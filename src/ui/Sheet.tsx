import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

// Durée de la descente à la fermeture (la montée dure 400 ms, la sortie est plus vive).
const CLOSE_MS = 280

// Feuilles ouvertes, de la plus ancienne à la plus récente : Échap ne ferme que celle du dessus.
const stack: symbol[] = []

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Feuille modale iOS : monte du bas, « Annuler » à gauche, action principale à droite.
// Annuler, le voile et Échap font redescendre la feuille avant de la retirer.
// Rendue dans <body> : une feuille ouverte depuis une autre (recherche d'adresse depuis un trajet)
// ne doit pas hériter du défilement ni de la transformation de sa parente, sinon elle apparaît décalée.
export function Sheet({ open, title, onCancel, cancelLabel = 'Annuler', onConfirm, confirmLabel = 'OK', confirmDisabled, children }: SheetProps) {
  const [shown, setShown] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const closing = useRef<number | null>(null)
  const cancelRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!open) return setShown(false)
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => () => {
    if (closing.current != null) window.clearTimeout(closing.current)
  }, [])

  function requestCancel() {
    if (closing.current != null) return
    if (reducedMotion()) return onCancel()
    setShown(false)
    setLeaving(true)
    closing.current = window.setTimeout(() => {
      closing.current = null
      onCancel()
    }, CLOSE_MS)
  }

  useEffect(() => {
    cancelRef.current = requestCancel
  })

  useEffect(() => {
    if (!open) return
    const me = Symbol('sheet')
    stack.push(me)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) cancelRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(me), 1)
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="surface-elevated fixed inset-0 z-40">
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`} onClick={requestCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] bottom-0 flex flex-col rounded-t-[12px] bg-bg transition-transform ${
          leaving ? 'duration-[280ms] ease-[cubic-bezier(0.4,0,1,1)]' : 'duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]'
        } ${shown ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <header className="flex h-14 shrink-0 items-center justify-between px-4">
          {cancelLabel != null ? <NavButton onClick={requestCancel}>{cancelLabel}</NavButton> : <span className="min-w-11" />}
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
    </div>,
    document.body,
  )
}

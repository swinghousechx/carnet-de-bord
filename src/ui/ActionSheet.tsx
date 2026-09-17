import type { ReactNode } from 'react'

export interface SheetAction {
  label: string
  onClick: () => void
  tone?: 'default' | 'destructive'
  bold?: boolean
}

// Feuille d'action iOS pour les confirmations (export, réouverture, suppression).
export function ActionSheet(props: {
  open: boolean
  title?: string
  message?: string
  actions: SheetAction[]
  onCancel: () => void
  children?: ReactNode
}) {
  if (!props.open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 px-2 pb-[calc(env(safe-area-inset-bottom)+8px)]" onClick={props.onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.title ?? props.message ?? 'Confirmation'}
        className="w-full space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ios-list overflow-hidden rounded-[14px] bg-cell text-center">
          {(props.title || props.message || props.children) && (
            <div className="space-y-1 px-4 py-3">
              {props.title && <p className="text-[13px] font-semibold text-label2">{props.title}</p>}
              {props.message && <p className="text-[13px] text-label2">{props.message}</p>}
              {props.children}
            </div>
          )}
          {props.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className={`block h-14 w-full text-[20px] active:bg-fill ${a.tone === 'destructive' ? 'text-red' : 'text-accent'} ${a.bold ? 'font-semibold' : ''}`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={props.onCancel} className="h-14 w-full rounded-[14px] bg-cell text-[20px] font-semibold text-accent active:bg-fill">
          Annuler
        </button>
      </div>
    </div>
  )
}

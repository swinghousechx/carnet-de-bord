import type { ReactNode } from 'react'
import { IconChevron } from './icons'

export function Section({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-4 mb-8">
      {header && <h2 className="px-4 pb-1.5 text-[13px] text-label2 uppercase">{header}</h2>}
      <div className="ios-list overflow-hidden rounded-[10px] bg-cell">{children}</div>
      {footer && <div className="px-4 pt-1.5 text-[13px] text-label2">{footer}</div>}
    </section>
  )
}

// Note discrète sous le dernier bloc d'un écran (même style qu'un pied de section).
export function FootNote({ children }: { children: ReactNode }) {
  return <p className="mx-8 -mt-4 mb-8 text-[13px] text-label2">{children}</p>
}

export interface RowProps {
  label: ReactNode
  value?: ReactNode
  detail?: ReactNode
  onClick?: () => void
  chevron?: boolean
  tone?: 'default' | 'accent' | 'destructive'
  accessory?: ReactNode
  leading?: ReactNode
}

export function Row({ label, value, detail, onClick, chevron, tone = 'default', accessory, leading }: RowProps) {
  const color = tone === 'accent' ? 'text-accent' : tone === 'destructive' ? 'text-red' : ''
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1 py-2.5">
        <div className={`truncate ${color}`}>{label}</div>
        {detail && <div className="truncate text-[15px] text-label2">{detail}</div>}
      </div>
      {value != null && <div className="shrink-0 text-label2 tabular">{value}</div>}
      {accessory}
      {chevron && <IconChevron className="size-4 shrink-0 text-label3" />}
    </>
  )
  const cls = 'flex min-h-11 w-full items-center gap-3 px-4 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} active:bg-fill`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

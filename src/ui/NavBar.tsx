import type { ReactNode } from 'react'

export function LargeTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="px-4 pt-[calc(env(safe-area-inset-top)+4px)] pb-3">
      <div className="flex h-11 items-center justify-end gap-3">{right}</div>
      <h1 className="text-[34px] leading-[41px] font-bold">{title}</h1>
      {subtitle && <p className="text-[15px] text-label2 first-letter:uppercase">{subtitle}</p>}
    </header>
  )
}

export function NavButton(props: { children: ReactNode; onClick: () => void; disabled?: boolean; bold?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      className={`flex min-h-11 min-w-11 items-center justify-center text-[17px] text-accent transition-opacity duration-150 active:opacity-40 disabled:text-label3 ${props.bold ? 'font-semibold' : ''}`}
    >
      {props.children}
    </button>
  )
}

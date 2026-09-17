import type { ReactNode } from 'react'

export function Chip({ label, selected, onClick, leading }: { label: string; selected?: boolean; onClick: () => void; leading?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected ?? false}
      onClick={onClick}
      className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] before:absolute before:inset-x-0 before:-top-1 before:-bottom-1 before:content-[''] ${selected ? 'bg-accent text-white' : 'bg-cell transition-colors duration-300 active:bg-fill active:duration-0'}`}
    >
      {leading}
      {label}
    </button>
  )
}

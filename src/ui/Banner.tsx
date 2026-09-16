import type { ReactNode } from 'react'
import { IconChevron } from './icons'

export function Banner({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <div className="mx-4 mb-6">
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-[10px] bg-cell px-4 py-3 text-left text-[15px] active:bg-fill">
        <span className="size-2 shrink-0 rounded-full bg-orange" />
        <span className="flex-1">{children}</span>
        <IconChevron className="size-4 text-label3" />
      </button>
    </div>
  )
}

import type { ReactNode } from 'react'
import { IconChart, IconGear, IconHome } from './icons'

export type Tab = 'home' | 'recap' | 'settings'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Trajets', icon: <IconHome /> },
  { id: 'recap', label: 'Récap', icon: <IconChart /> },
  { id: 'settings', label: 'Réglages', icon: <IconGear /> },
]

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t-[0.5px] border-sep bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="flex h-[49px]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${tab === t.id ? 'text-accent' : 'text-label2'}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

// Icônes à trait fin (esprit SF Symbols), sans dépendance.
type P = { className?: string }
const svg = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const IconHome = ({ className = 'size-6' }: P) => (
  <svg {...svg} className={className}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
)
export const IconChart = ({ className = 'size-6' }: P) => (
  <svg {...svg} className={className}><path d="M4 20V11M10 20V4M16 20v-8M21 20H3" /></svg>
)
export const IconGear = ({ className = 'size-6' }: P) => (
  <svg {...svg} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
  </svg>
)
export const IconPlus = ({ className = 'size-6' }: P) => (
  <svg {...svg} className={className}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconChevron = ({ className = 'size-4' }: P) => (
  <svg {...svg} className={className}><path d="m9 6 6 6-6 6" /></svg>
)
export const IconLock = ({ className = 'size-4' }: P) => (
  <svg {...svg} className={className}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
)
export const IconPin = ({ className = 'size-5' }: P) => (
  <svg {...svg} className={className}><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
)
export const IconSearch = ({ className = 'size-5' }: P) => (
  <svg {...svg} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)

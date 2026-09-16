const pad = (n: number) => String(n).padStart(2, '0')

// Date locale au format YYYY-MM-DD (pas toISOString, qui passe en UTC).
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function yearOf(dateOrMonth: string): number {
  return Number(dateOrMonth.slice(0, 4))
}

export function firstDayOfMonth(mois: string): string {
  return `${mois}-01`
}

export function lastDayOfMonth(mois: string): string {
  const [y, m] = mois.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  return `${mois}-${pad(days)}`
}

export function prevMonth(mois: string): string {
  const [y, m] = mois.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`
}

export function nextMonth(mois: string): string {
  const [y, m] = mois.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}

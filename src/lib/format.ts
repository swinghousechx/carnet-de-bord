// Arrondi « commercial » robuste aux erreurs flottantes (1.005 → 1.01).
export function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals
  const r = Math.round(Math.abs(x) * f + 1e-6) / f
  return x < 0 ? -r : r
}

export const round1 = (x: number): number => roundTo(x, 1)
export const round2 = (x: number): number => roundTo(x, 2)

// Intl fr-FR produit des espaces insécables (U+202F, U+00A0) : on les normalise.
export function cleanSpaces(s: string): string {
  return s.replace(/[  ]/g, ' ')
}

export function decimalFr(x: number, digits: number): string {
  return roundTo(x, digits).toFixed(digits).replace('.', ',')
}

const kmFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const euroFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const moisFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const jourFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

// Nombre de km sans unité, même format que formatKm (tableaux PDF).
export function formatKmNombre(km: number): string {
  return cleanSpaces(kmFmt.format(km))
}

export function formatKm(km: number | null): string {
  return km == null ? '—' : `${cleanSpaces(kmFmt.format(km))} km`
}

export function formatEuro(x: number): string {
  return cleanSpaces(euroFmt.format(x))
}

// Midi local pour éviter tout décalage de fuseau.
const atNoon = (date: string) => new Date(`${date}T12:00:00`)

export function formatMoisLong(mois: string): string {
  return moisFmt.format(atNoon(`${mois}-01`))
}

export function formatJour(date: string): string {
  return jourFmt.format(atNoon(date))
}

export function formatDateCourte(date: string): string {
  return date.split('-').reverse().join('/')
}

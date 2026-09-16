import { nowISO } from '../lib/dates'
import type { BaremeRate, BaremeYear } from './types'

// Barème 2026 voitures thermiques/hybrides (identique à 2025). Modifiable dans Réglages.
export const DEFAULT_BAREME_ANNEE = 2026
export const DEFAULT_MAJORATION_ELECTRIQUE = 0.2
export const DEFAULT_BAREME_SOURCE = 'Barème kilométrique 2026 (reconduit de 2025)'

export interface RateSeed {
  cv_min: number | null
  cv_max: number | null
  km_min: number
  km_max: number | null
  coef: number
  constante: number
}

// [cv_min, cv_max, coef ≤5000, coef 5001–20000, constante, coef >20000]
const TABLE: [number | null, number | null, number, number, number, number][] = [
  [null, 3, 0.529, 0.316, 1065, 0.37],
  [4, 4, 0.606, 0.34, 1330, 0.407],
  [5, 5, 0.636, 0.357, 1395, 0.427],
  [6, 6, 0.665, 0.374, 1457, 0.447],
  [7, null, 0.697, 0.394, 1515, 0.47],
]

export const DEFAULT_RATES: RateSeed[] = TABLE.flatMap(([cv_min, cv_max, c1, c2, k2, c3]) => [
  { cv_min, cv_max, km_min: 0, km_max: 5000, coef: c1, constante: 0 },
  { cv_min, cv_max, km_min: 5000, km_max: 20000, coef: c2, constante: k2 },
  { cv_min, cv_max, km_min: 20000, km_max: null, coef: c3, constante: 0 },
])

// Construit les lignes d'une année de barème (ids générés côté client).
export function buildBaremeRows(
  annee: number,
  majoration: number,
  source: string,
  seeds: RateSeed[],
): { year: BaremeYear; rates: BaremeRate[] } {
  const now = nowISO()
  const base = () => ({ id: crypto.randomUUID(), created_at: now, updated_at: now, deleted_at: null })
  return {
    year: { ...base(), annee, majoration_electrique: majoration, source },
    rates: seeds.map((s) => ({ ...base(), annee, ...s })),
  }
}

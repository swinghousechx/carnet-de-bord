import type { BaremeRate, BaremeYear, Energie } from './types'

export interface RateSet {
  annee: number
  provisoire: boolean // barème d'une année antérieure appliqué faute de mieux
  majoration_electrique: number
  rates: BaremeRate[]
}

// Barème de l'année demandée, sinon le plus récent antérieur (provisoire).
export function selectRateSet(annee: number, years: BaremeYear[], rates: BaremeRate[]): RateSet | null {
  const candidates = years.filter((y) => !y.deleted_at && y.annee <= annee).sort((a, b) => b.annee - a.annee)
  const chosen = candidates[0]
  if (!chosen) return null
  return {
    annee: chosen.annee,
    provisoire: chosen.annee !== annee,
    majoration_electrique: chosen.majoration_electrique,
    rates: rates.filter((r) => !r.deleted_at && r.annee === chosen.annee),
  }
}

// f(D) : montant annuel pour D km avec ce véhicule. Non arrondi.
export function baremeAmount(D: number, cv: number, energie: Energie, set: RateSet): number {
  if (D <= 0) return 0
  const rows = set.rates
    .filter((r) => (r.cv_min ?? -Infinity) <= cv && cv <= (r.cv_max ?? Infinity))
    .sort((a, b) => a.km_min - b.km_min)
  const row = rows.find((r) => r.km_max == null || D <= r.km_max)
  if (!row) throw new Error(`Barème ${set.annee} incomplet pour ${cv} CV`)
  const base = D * row.coef + row.constante
  return energie === 'electrique' ? base * (1 + set.majoration_electrique) : base
}

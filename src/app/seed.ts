import type { CarnetDB } from '../db/db'
import { saveRow, saveRows } from '../db/repo'
import {
  buildBaremeRows, DEFAULT_BAREME_ANNEE, DEFAULT_BAREME_SOURCE, DEFAULT_MAJORATION_ELECTRIQUE, DEFAULT_RATES,
} from '../domain/default-bareme'

// Appelé après un pull réussi : n'amorce que si ni le serveur ni le local n'ont de barème.
export async function ensureBaremeSeed(db: CarnetDB): Promise<boolean> {
  const years = (await db.bareme_years.toArray()).filter((y) => !y.deleted_at)
  if (years.length > 0) return false
  const { year, rates } = buildBaremeRows(DEFAULT_BAREME_ANNEE, DEFAULT_MAJORATION_ELECTRIQUE, DEFAULT_BAREME_SOURCE, DEFAULT_RATES)
  await saveRow(db, 'bareme_years', year)
  await saveRows(db, 'bareme_rates', rates)
  return true
}

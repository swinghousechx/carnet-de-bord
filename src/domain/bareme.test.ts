import { describe, expect, it } from 'vitest'
import { baremeAmount, selectRateSet } from './bareme'
import { buildBaremeRows, DEFAULT_RATES } from './default-bareme'

const { year, rates } = buildBaremeRows(2026, 0.2, 'test', DEFAULT_RATES)
const set = selectRateSet(2026, [year], rates)!

describe('selectRateSet', () => {
  it(`prend l'année demandée`, () => {
    expect(set.annee).toBe(2026)
    expect(set.provisoire).toBe(false)
    expect(set.rates).toHaveLength(15)
  })
  it(`se replie sur la dernière année connue, marquée provisoire`, () => {
    const s = selectRateSet(2027, [year], rates)!
    expect(s.annee).toBe(2026)
    expect(s.provisoire).toBe(true)
  })
  it('renvoie null sans barème antérieur', () => {
    expect(selectRateSet(2025, [year], rates)).toBeNull()
  })
  it('ignore les lignes supprimées', () => {
    const deleted = { ...year, deleted_at: '2026-01-02T00:00:00.000Z' }
    expect(selectRateSet(2026, [deleted], rates)).toBeNull()
  })
})

describe('baremeAmount — 5 CV thermique', () => {
  it('0 km → 0 €', () => {
    expect(baremeAmount(0, 5, 'thermique', set)).toBe(0)
  })
  it('bornes de la 1re tranche', () => {
    expect(baremeAmount(4999, 5, 'thermique', set)).toBeCloseTo(3179.364, 6)
    expect(baremeAmount(5000, 5, 'thermique', set)).toBeCloseTo(3180, 6)
  })
  it('2e tranche : d × 0,357 + 1 395', () => {
    expect(baremeAmount(5001, 5, 'thermique', set)).toBeCloseTo(3180.357, 6)
    expect(baremeAmount(20000, 5, 'thermique', set)).toBeCloseTo(8535, 6)
  })
  it('3e tranche : d × 0,427', () => {
    expect(baremeAmount(20001, 5, 'thermique', set)).toBeCloseTo(8540.427, 6)
  })
})

describe('baremeAmount — catégories de CV et électrique', () => {
  it('« 3 CV et moins » couvre 2 CV', () => {
    expect(baremeAmount(1000, 2, 'thermique', set)).toBeCloseTo(529, 6)
  })
  it('« 7 CV et plus » couvre 9 CV', () => {
    expect(baremeAmount(1000, 9, 'thermique', set)).toBeCloseTo(697, 6)
  })
  it('électrique : majoration de 20 %', () => {
    expect(baremeAmount(1000, 5, 'electrique', set)).toBeCloseTo(763.2, 6)
  })
})

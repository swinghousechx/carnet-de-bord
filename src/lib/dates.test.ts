import { describe, expect, it } from 'vitest'
import { firstDayOfMonth, lastDayOfMonth, monthOf, nextMonth, prevMonth, todayISO, yearOf } from './dates'

describe('dates', () => {
  it('todayISO utilise la date locale', () => {
    expect(todayISO(new Date(2026, 8, 5, 23, 30))).toBe('2026-09-05')
  })
  it('monthOf / yearOf', () => {
    expect(monthOf('2026-09-15')).toBe('2026-09')
    expect(yearOf('2026-09-15')).toBe(2026)
    expect(yearOf('2026-09')).toBe(2026)
  })
  it('premier et dernier jour du mois, années bissextiles', () => {
    expect(firstDayOfMonth('2026-09')).toBe('2026-09-01')
    expect(lastDayOfMonth('2026-09')).toBe('2026-09-30')
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28')
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29')
  })
  it('mois précédent / suivant avec changement d’année', () => {
    expect(prevMonth('2026-01')).toBe('2025-12')
    expect(prevMonth('2026-09')).toBe('2026-08')
    expect(nextMonth('2026-12')).toBe('2027-01')
  })
})

import { describe, expect, it } from 'vitest'
import { decimalFr, formatDateCourte, formatEuro, formatJour, formatKm, formatKmNombre, formatMoisLong, nb, round1, round2 } from './format'

describe('arrondis', () => {
  it('round2 arrondit au centime sans erreur flottante', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
    expect(round2(0)).toBe(0)
    expect(round2(-1.005)).toBe(-1.01)
  })
  it('round1 arrondit au dixième', () => {
    expect(round1(15.25)).toBe(15.3)
    expect(round1(15.24)).toBe(15.2)
  })
})

describe('format', () => {
  it('decimalFr : virgule, sans séparateur de milliers', () => {
    expect(decimalFr(1234.5, 2)).toBe('1234,50')
    expect(decimalFr(1.005, 2)).toBe('1,01')
  })
  it('formatEuro remplace les espaces insécables par des espaces simples', () => {
    expect(formatEuro(1234.5)).toBe('1 234,50 €')
  })
  it('formatKmNombre : comme formatKm, sans unité (tableaux PDF)', () => {
    expect(formatKmNombre(1218.6)).toBe('1 218,6')
    expect(formatKmNombre(2500)).toBe('2 500')
  })
  it('formatKm', () => {
    expect(formatKm(1234.5)).toBe('1 234,5 km')
    expect(formatKm(15)).toBe('15 km')
    expect(formatKm(null)).toBe('—')
  })
  it('dates lisibles', () => {
    expect(formatMoisLong('2026-09')).toBe('septembre 2026')
    expect(formatJour('2026-09-15')).toMatch(/15 sept/)
    expect(formatDateCourte('2026-09-15')).toBe('15/09/2026')
  })
})

describe('nb', () => {
  it('accorde au pluriel à partir de 2', () => {
    expect(nb(0, 'trajet')).toBe('0 trajet')
    expect(nb(1, 'trajet')).toBe('1 trajet')
    expect(nb(2, 'trajet')).toBe('2 trajets')
    expect(nb(3, 'modification refusée', 'modifications refusées')).toBe('3 modifications refusées')
  })
})

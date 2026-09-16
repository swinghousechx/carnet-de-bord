import { describe, expect, it } from 'vitest'
import { parseDecimal } from './parse'

describe('parseDecimal', () => {
  it('accepte virgule ou point, refuse le vide et le texte', () => {
    expect(parseDecimal('12,5')).toBe(12.5)
    expect(parseDecimal(' 7.25 ')).toBe(7.25)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
  })
})

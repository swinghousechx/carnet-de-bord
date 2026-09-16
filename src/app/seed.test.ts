import { describe, expect, it } from 'vitest'
import { CarnetDB } from '../db/db'
import { ensureBaremeSeed } from './seed'

describe('ensureBaremeSeed', () => {
  it('pré-remplit le barème 2026 une seule fois', async () => {
    const db = new CarnetDB(`test-${crypto.randomUUID()}`)
    expect(await ensureBaremeSeed(db)).toBe(true)
    expect(await ensureBaremeSeed(db)).toBe(false)
    expect(await db.bareme_years.count()).toBe(1)
    expect(await db.bareme_rates.count()).toBe(15)
    expect((await db.bareme_rates.toArray()).every((r) => r._dirty === 1)).toBe(true)
  })
})

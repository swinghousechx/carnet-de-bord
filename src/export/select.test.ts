import { describe, expect, it } from 'vitest'
import { makeExport, makeTrip } from '../test/fixtures'
import { draftsForExport, exportBlockReason, nextVersion, tripsForExport } from './select'

describe('tripsForExport', () => {
  const sept = makeTrip({ date: '2026-09-10' })
  const aout = makeTrip({ date: '2026-08-28' }) // rattrapage
  const oct = makeTrip({ date: '2026-10-01' })
  const brouillon = makeTrip({ date: '2026-09-12', statut: 'brouillon' })
  const lmnp = makeTrip({ date: '2026-09-11', activite: 'lmnp' })
  const deja = makeTrip({ date: '2026-09-02', statut: 'exporte', export_id: 'e-old' })
  const all = [sept, aout, oct, brouillon, lmnp, deja]

  it("validés non exportés de l'activité, datés jusqu'à la fin du mois, triés par date", () => {
    expect(tripsForExport(all, [], 'swing_house', '2026-09').map((t) => t.id)).toEqual([aout.id, sept.id])
  })
  it('rectificatif : reprend les trajets encore verrouillés de la version à rectifier', () => {
    const e = makeExport({ id: 'e-old', statut: 'a_rectifier' })
    expect(tripsForExport(all, [e], 'swing_house', '2026-09').map((t) => t.id)).toEqual([aout.id, deja.id, sept.id])
  })
  it('brouillons signalés à part', () => {
    expect(draftsForExport(all, 'swing_house', '2026-09').map((t) => t.id)).toEqual([brouillon.id])
  })
})

describe('versions', () => {
  it('bloque un mois déjà émis, autorise après réouverture', () => {
    const v1 = makeExport({ version: 1, statut: 'emis' })
    expect(exportBlockReason([v1], 'swing_house', '2026-09')).toMatch(/Déjà exporté/)
    expect(exportBlockReason([{ ...v1, statut: 'a_rectifier' }], 'swing_house', '2026-09')).toBeNull()
    expect(nextVersion([v1], 'swing_house', '2026-09')).toBe(2)
    expect(nextVersion([], 'lmnp', '2026-09')).toBe(1)
  })
})

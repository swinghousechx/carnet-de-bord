import { describe, expect, it } from 'vitest'
import type { AppData } from '../hooks/useData'
import { defaultBareme, makeExport, makeTrip, makeVehicle } from '../test/fixtures'
import { earlierMonthsToExport, monthsBehind, retardMessage } from './retard'

const { year, rates } = defaultBareme()
const app = (o: Partial<AppData> = {}): AppData => ({
  trips: [], expenses: [], vehicles: [makeVehicle({ id: 'veh-A' })], fiscalYears: [], baremeYears: [year], rates,
  places: [], exports: [], ...o,
})

describe('earlierMonthsToExport', () => {
  const t = (id: string, date: string, o = {}) => makeTrip({ id, date, statut: 'valide', vehicle_id: 'veh-A', km_total: 10, ...o })
  it('liste les mois antérieurs encore exportables, du plus ancien au plus récent', () => {
    const a = app({
      trips: [
        t('t1', '2026-07-23'),
        t('t2', '2026-06-02'),
        t('t3', '2026-07-09'),
        t('t4', '2026-08-06'), // le mois affiché lui-même : pas un rattrapage
        t('t5', '2026-05-10', { activite: 'lmnp' }), // autre activité
        t('t6', '2026-04-10', { statut: 'brouillon' }), // brouillon : reste dans son mois
        t('t7', '2026-03-10', { deleted_at: '2026-09-01T00:00:00.000Z' }),
      ],
    })
    expect(earlierMonthsToExport(a, 'swing_house', '2026-08')).toEqual(['2026-06', '2026-07'])
    expect(earlierMonthsToExport(a, 'lmnp', '2026-08')).toEqual(['2026-05'])
  })
  it('ignore un mois déjà exporté : son trajet oublié ne peut plus partir qu’en rattrapage', () => {
    const a = app({ trips: [t('t1', '2026-07-23')], exports: [makeExport({ mois: '2026-07', statut: 'emis' })] })
    expect(earlierMonthsToExport(a, 'swing_house', '2026-08')).toEqual([])
  })
  it('garde un mois dont l’export est à rectifier', () => {
    const a = app({ exports: [makeExport({ mois: '2026-07', statut: 'a_rectifier' })] })
    expect(earlierMonthsToExport(a, 'swing_house', '2026-08')).toEqual(['2026-07'])
  })
})

describe('monthsBehind / retardMessage', () => {
  const t = (id: string, date: string, activite: 'swing_house' | 'lmnp' = 'swing_house') =>
    makeTrip({ id, date, activite, statut: 'valide', vehicle_id: 'veh-A', km_total: 10 })
  it('regroupe par mois et rédige le bandeau', () => {
    const a = app({ trips: [t('a', '2026-07-09'), t('b', '2026-06-15'), t('c', '2026-06-20', 'lmnp')] })
    const r = monthsBehind(a, '2026-09')
    expect(r).toEqual([['2026-06', ['swing_house', 'lmnp']], ['2026-07', ['swing_house']]])
    expect(retardMessage(r, '2026-09')).toBe('juin, juillet 2026 pas encore exportés (Swing House, LMNP) : commencer par juin 2026.')
    expect(retardMessage([['2026-08', ['swing_house']]], '2026-09')).toBe('août 2026 pas encore exporté (Swing House) : à exporter avant septembre 2026.')
    const cinq: [string, ('swing_house' | 'lmnp')[]][] = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].map((m) => [m, ['swing_house']])
    expect(retardMessage(cinq, '2026-09')).toBe('5 mois pas encore exportés, d’avril à août 2026 (Swing House) : commencer par avril 2026.')
    expect(retardMessage([['2025-11', ['lmnp']], ['2025-12', ['lmnp']], ['2026-01', ['lmnp']], ['2026-02', ['lmnp']]], '2026-03')).toBe(
      '4 mois pas encore exportés, de novembre 2025 à février 2026 (LMNP) : commencer par novembre 2025.',
    )
    expect(retardMessage([['2025-12', ['lmnp']], ['2026-01', ['lmnp']]], '2026-02')).toBe(
      'décembre 2025, janvier 2026 pas encore exportés (LMNP) : commencer par décembre 2025.',
    )
  })
})



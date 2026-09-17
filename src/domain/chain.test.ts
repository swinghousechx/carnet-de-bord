import { describe, expect, it } from 'vitest'
import { defaultBareme, makeExpense, makeFiscalYear, makeTrip, makeVehicle } from '../test/fixtures'
import { round2 } from '../lib/format'
import { computeAll, cumulKm, type CalcData } from './chain'
import type { Trip } from './types'

const { year, rates } = defaultBareme()
const vA = makeVehicle({ id: 'veh-A', cv: 5 })
const vB = makeVehicle({ id: 'veh-B', cv: 4, date_debut: '2026-12-15' })

function data(trips: Trip[], extra: Partial<CalcData> = {}): CalcData {
  return { trips, expenses: [], vehicles: [vA, vB], fiscalYears: [], baremeYears: [year], rates, ...extra }
}
const sum = (m: Map<string, { montant_bareme: number }>) => round2([...m.values()].reduce((s, c) => s + c.montant_bareme, 0))

describe('computeAll', () => {
  it('un trajet de 100 km en 5 CV → 63,60 €', () => {
    const t = makeTrip({ km_total: 100 })
    expect(computeAll(data([t])).get(t.id)?.montant_bareme).toBe(63.6)
  })

  it('l’ordre d’entrée ne change rien : les trajets sont chaînés par date', () => {
    const tot = makeTrip({ km_total: 5000, date: '2026-03-01' })
    const tard = makeTrip({ km_total: 100, date: '2026-09-01' })
    const m = computeAll(data([tard, tot]))
    expect(m.get(tot.id)?.montant_bareme).toBe(3180)
    expect(m.get(tard.id)?.montant_bareme).toBe(35.7) // f(5100) − f(5000)
  })

  it('somme télescopique : 6 000 km au total = barème annuel exact', () => {
    const trips = Array.from({ length: 60 }, (_, i) =>
      makeTrip({ km_total: 100, date: `2026-${String(1 + Math.floor(i / 6)).padStart(2, '0')}-10` }),
    )
    expect(sum(computeAll(data(trips)))).toBe(3537) // 6000 × 0,357 + 1395
  })

  it('les trajets exportés restent figés et servent de base au cumul', () => {
    const exporte = makeTrip({ km_total: 5000, date: '2026-10-01', statut: 'exporte', montant_bareme: 3180, export_id: 'e1' })
    const rouvert = makeTrip({ km_total: 100, date: '2026-09-01', statut: 'valide' })
    const m = computeAll(data([exporte, rouvert]))
    expect(m.get(exporte.id)?.montant_bareme).toBe(3180)
    expect(m.get(rouvert.id)?.montant_bareme).toBe(35.7)
  })

  it('changement de véhicule : une chaîne par véhicule', () => {
    const a = makeTrip({ km_total: 3000, vehicle_id: 'veh-A', date: '2026-06-01' })
    const b = makeTrip({ km_total: 3000, vehicle_id: 'veh-B', date: '2026-12-20' })
    const m = computeAll(data([a, b]))
    expect(m.get(a.id)?.montant_bareme).toBe(1908) // 3000 × 0,636
    expect(m.get(b.id)?.montant_bareme).toBe(1818) // 3000 × 0,606
  })

  it('cumul séparé par activité', () => {
    const sh = makeTrip({ km_total: 3000, activite: 'swing_house' })
    const lmnp = makeTrip({ km_total: 3000, activite: 'lmnp' })
    const m = computeAll(data([sh, lmnp]))
    expect(m.get(sh.id)?.montant_bareme).toBe(1908)
    expect(m.get(lmnp.id)?.montant_bareme).toBe(1908)
  })

  it('le cumul repart à zéro au 1er janvier ; barème de l’année suivante provisoire', () => {
    const y1 = makeTrip({ km_total: 6000, date: '2026-12-01' })
    const y2 = makeTrip({ km_total: 100, date: '2027-01-05' })
    const c = computeAll(data([y1, y2])).get(y2.id)!
    expect(c.montant_bareme).toBe(63.6)
    expect(c.provisoire).toBe(true)
    expect(c.bareme_annee).toBe(2026)
  })

  it('domicile–travail exclu : 0 € et hors cumul', () => {
    const dt = makeTrip({ km_total: 5000, nature: 'domicile_travail', date: '2026-02-01' })
    const pro = makeTrip({ km_total: 100, date: '2026-03-01' })
    const m = computeAll(data([dt, pro]))
    expect(m.get(dt.id)).toMatchObject({ montant_bareme: 0, compte: false })
    expect(m.get(pro.id)?.montant_bareme).toBe(63.6)
  })

  it('domicile–travail inclus par réglage : compté', () => {
    const dt = makeTrip({ km_total: 100, nature: 'domicile_travail' })
    const fy = makeFiscalYear({ inclure_domicile_travail: true })
    expect(computeAll(data([dt], { fiscalYears: [fy] })).get(dt.id)?.montant_bareme).toBe(63.6)
  })

  it('frais annexes toujours ajoutés, même en mode frais réels', () => {
    const t = makeTrip({ km_total: 100 })
    const expenses = [makeExpense({ trip_id: t.id, montant: 5.2 }), makeExpense({ trip_id: t.id, type: 'parking', montant: 3 })]
    expect(computeAll(data([t], { expenses })).get(t.id)).toMatchObject({ montant_bareme: 63.6, frais: 8.2, total: 71.8 })
    const fy = makeFiscalYear({ mode: 'frais_reels' })
    expect(computeAll(data([t], { expenses, fiscalYears: [fy] })).get(t.id)).toMatchObject({ montant_bareme: 0, total: 8.2 })
  })

  it('km inconnus → 0 € et non compté ; trajets supprimés absents', () => {
    const t = makeTrip({ km_total: null, statut: 'brouillon' })
    const del = makeTrip({ deleted_at: '2026-09-16T00:00:00.000Z' })
    const m = computeAll(data([t, del]))
    expect(m.get(t.id)).toMatchObject({ montant_bareme: 0, compte: false })
    expect(m.has(del.id)).toBe(false)
  })

  it('barème incomplet pour la puissance fiscale du véhicule : groupe entier à 0 €, bareme_indisponible, aucun montant partiel', () => {
    // Barème amputé de la tranche 5 CV (cas réel : ligne supprimée depuis Réglages).
    const ratesSans5cv = rates.filter((r) => !(r.cv_min === 5 && r.cv_max === 5))
    const a1 = makeTrip({ km_total: 100, vehicle_id: 'veh-A', date: '2026-03-01' })
    const a2 = makeTrip({ km_total: 200, vehicle_id: 'veh-A', date: '2026-04-01' })
    // Second groupe sain, même jeu de données, autre véhicule (4 CV, non affecté).
    const b1 = makeTrip({ km_total: 100, vehicle_id: 'veh-B', date: '2026-12-20' })
    const m = computeAll(data([a1, a2, b1], { rates: ratesSans5cv }))
    expect(m.get(a1.id)).toMatchObject({ montant_bareme: 0, bareme_indisponible: true })
    expect(m.get(a2.id)).toMatchObject({ montant_bareme: 0, bareme_indisponible: true })
    expect(m.get(b1.id)).toMatchObject({ montant_bareme: 60.6, bareme_indisponible: false }) // 100 × 0,606
  })

  it('aucun barème disponible pour l’année : montants à 0 et bareme_indisponible', () => {
    const t = makeTrip({ km_total: 100 })
    const m = computeAll(data([t], { baremeYears: [] }))
    expect(m.get(t.id)).toMatchObject({ montant_bareme: 0, bareme_indisponible: true })
  })

  it('trajet qui ne compte pas (domicile–travail exclu ou frais réels) : 0 € mais bareme_indisponible reste faux', () => {
    const dt = makeTrip({ km_total: 100, nature: 'domicile_travail' })
    const mDt = computeAll(data([dt]))
    expect(mDt.get(dt.id)).toMatchObject({ montant_bareme: 0, bareme_indisponible: false })

    const t = makeTrip({ km_total: 100 })
    const fy = makeFiscalYear({ mode: 'frais_reels' })
    const mReel = computeAll(data([t], { fiscalYears: [fy] }))
    expect(mReel.get(t.id)).toMatchObject({ montant_bareme: 0, bareme_indisponible: false })
  })
})

describe('computeAll — invariant de la chaîne : Σ figés + Σ calculés = round2(f(D))', () => {
  const groupSum = (m: Map<string, { montant_bareme: number }>, trips: Trip[]) =>
    round2(trips.reduce((s, t) => s + m.get(t.id)!.montant_bareme, 0))

  it('brouillon antérieur validé après l’export d’un trajet plus tardif : total = f(6000)', () => {
    // Export « quand même » du 5 sept. alors qu'un brouillon du 2 sept. comptait déjà dans la chaîne :
    // le trajet exporté a été figé à f(6000) − f(3000) = 1 629 €.
    const exporte = makeTrip({ km_total: 3000, date: '2026-09-05', statut: 'exporte', montant_bareme: 1629, export_id: 'e1' })
    const brouillonValide = makeTrip({ km_total: 3000, date: '2026-09-02', statut: 'valide' })
    const m = computeAll(data([exporte, brouillonValide]))
    expect(m.get(exporte.id)?.montant_bareme).toBe(1629)
    expect(m.get(brouillonValide.id)?.montant_bareme).toBe(1908) // 3537 − 1629
    expect(groupSum(m, [exporte, brouillonValide])).toBe(3537)
  })

  it('réouverture du premier de deux trajets exportés : total v2 = f(8000)', () => {
    // v1 : 4000 km → 2 544 € puis 4000 km → f(8000) − f(4000) = 1 707 €. Le premier est rouvert tel quel.
    const rouvert = makeTrip({ km_total: 4000, date: '2026-09-01', statut: 'valide' })
    const reste = makeTrip({ km_total: 4000, date: '2026-09-03', statut: 'exporte', montant_bareme: 1707, export_id: 'e1' })
    const m = computeAll(data([rouvert, reste]))
    expect(m.get(rouvert.id)?.montant_bareme).toBe(2544) // 4251 − 1707
    expect(groupSum(m, [rouvert, reste])).toBe(4251) // 8000 × 0,357 + 1395
  })

  it('plusieurs trajets à calculer après des figés : le premier absorbe l’écart, les suivants sont des incréments', () => {
    const exporte = makeTrip({ km_total: 3000, date: '2026-09-05', statut: 'exporte', montant_bareme: 1629, export_id: 'e1' })
    const a = makeTrip({ km_total: 1000, date: '2026-09-02' })
    const b = makeTrip({ km_total: 2000, date: '2026-09-20' })
    const m = computeAll(data([b, exporte, a]))
    // C = 3000 figés (L = 1629) ; a : round2(f(4000)) − 1629 = 915 ; b : f(6000) − f(4000) = 993.
    expect(m.get(a.id)?.montant_bareme).toBe(915)
    expect(m.get(b.id)?.montant_bareme).toBe(993)
    expect(groupSum(m, [exporte, a, b])).toBe(3537)
  })

  it('même date : départage par created_at, puis par id (ordre d’entrée indifférent)', () => {
    const tot = makeTrip({ id: 'trip-z', km_total: 5000, date: '2026-09-10', created_at: '2026-09-10T08:00:00.000Z' })
    const tard = makeTrip({ id: 'trip-a', km_total: 100, date: '2026-09-10', created_at: '2026-09-10T09:00:00.000Z' })
    for (const ordre of [[tot, tard], [tard, tot]]) {
      const m = computeAll(data(ordre))
      expect(m.get(tot.id)?.montant_bareme).toBe(3180)
      expect(m.get(tard.id)?.montant_bareme).toBe(35.7)
    }
    // created_at identiques : l'id tranche, de façon déterministe.
    const x = makeTrip({ id: 'trip-1', km_total: 5000, date: '2026-09-10' })
    const y = makeTrip({ id: 'trip-2', km_total: 100, date: '2026-09-10' })
    for (const ordre of [[x, y], [y, x]]) {
      const m = computeAll(data(ordre))
      expect(m.get(x.id)?.montant_bareme).toBe(3180)
      expect(m.get(y.id)?.montant_bareme).toBe(35.7)
    }
  })

  it('barème (ou CV) modifié après un export : figés intacts, total du groupe = round2(f_nouveau(D))', () => {
    // Montant figé sous l'ancien barème (5000 km → 3 180 €). Nouveau barème 5 CV : 0,70 €/km jusqu'à 5000 km,
    // puis 0,40 × D + 1500. Le trajet restant absorbe l'écart pour que le groupe vaille f_nouveau(5100).
    const hausse = rates.map((r) =>
      r.cv_min === 5 && r.cv_max === 5
        ? r.km_min === 0 ? { ...r, coef: 0.7 } : r.km_min === 5000 ? { ...r, coef: 0.4, constante: 1500 } : r
        : r,
    )
    const exporte = makeTrip({ km_total: 5000, date: '2026-03-01', statut: 'exporte', montant_bareme: 3180, export_id: 'e1' })
    const reste = makeTrip({ km_total: 100, date: '2026-09-01' })
    const m = computeAll(data([exporte, reste], { rates: hausse }))
    expect(m.get(exporte.id)?.montant_bareme).toBe(3180)
    expect(m.get(reste.id)?.montant_bareme).toBe(360) // 5100 × 0,40 + 1500 = 3540 ; 3540 − 3180
    expect(groupSum(m, [exporte, reste])).toBe(3540)
  })

  it('montant négatif possible si le nouveau barème est plus bas que les figés : conservé, non plafonné à 0', () => {
    // Décision documentée : plafonner à 0 casserait l'invariant (le groupe dépasserait f(D)).
    const baisse = rates.map((r) => (r.cv_min === 5 && r.cv_max === 5 ? { ...r, coef: 0.3, constante: 0 } : r))
    const exporte = makeTrip({ km_total: 5000, date: '2026-03-01', statut: 'exporte', montant_bareme: 3180, export_id: 'e1' })
    const reste = makeTrip({ km_total: 100, date: '2026-09-01' })
    const m = computeAll(data([exporte, reste], { rates: baisse }))
    expect(m.get(reste.id)?.montant_bareme).toBe(-1650) // 5100 × 0,3 = 1530 ; 1530 − 3180
    expect(groupSum(m, [exporte, reste])).toBe(1530)
  })

  it('aucun trajet exporté : comportement inchangé (L = 0 = f(0))', () => {
    const a = makeTrip({ km_total: 3000, date: '2026-09-02' })
    const b = makeTrip({ km_total: 3000, date: '2026-09-05' })
    const m = computeAll(data([a, b]))
    expect(m.get(a.id)?.montant_bareme).toBe(1908)
    expect(m.get(b.id)?.montant_bareme).toBe(1629)
  })
})

describe('cumulKm', () => {
  it('cumul du groupe jusqu’à une date, incluse ou non', () => {
    const d = data([
      makeTrip({ km_total: 100, date: '2026-09-01' }),
      makeTrip({ km_total: 50, date: '2026-09-20' }),
      makeTrip({ km_total: 30, date: '2026-10-02' }),
      makeTrip({ km_total: 999, date: '2026-09-05', nature: 'domicile_travail' }),
    ])
    expect(cumulKm(d, 'veh-A', 'swing_house', 2026, '2026-09-20', true)).toBe(150)
    expect(cumulKm(d, 'veh-A', 'swing_house', 2026, '2026-09-20', false)).toBe(100)
  })

  it('même règle que la chaîne : brouillons comptés, trajets hors chaîne (véhicule supprimé, km inconnus) exclus', () => {
    const brouillon = makeTrip({ km_total: 40, date: '2026-09-03', statut: 'brouillon' })
    const sansKm = makeTrip({ km_total: null, date: '2026-09-04', statut: 'brouillon' })
    const valide = makeTrip({ km_total: 60, date: '2026-09-05' })
    const d = data([brouillon, sansKm, valide])
    const calc = computeAll(d)
    const comptes = [brouillon, sansKm, valide].filter((t) => calc.get(t.id)!.compte)
    expect(cumulKm(d, 'veh-A', 'swing_house', 2026, '2026-09-30', true)).toBe(comptes.reduce((s, t) => s + t.km_total!, 0))
    expect(cumulKm(d, 'veh-A', 'swing_house', 2026, '2026-09-30', true)).toBe(100)
    // Véhicule supprimé : ses trajets ne sont plus dans la chaîne, donc plus dans le cumul non plus.
    const vSupprime = { ...vA, deleted_at: '2026-09-16T00:00:00.000Z' }
    const d2 = data([valide], { vehicles: [vSupprime, vB] })
    expect(computeAll(d2).get(valide.id)?.compte).toBe(false)
    expect(cumulKm(d2, 'veh-A', 'swing_house', 2026, '2026-09-30', true)).toBe(0)
  })
})

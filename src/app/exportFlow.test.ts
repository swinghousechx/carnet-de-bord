import { describe, expect, it } from 'vitest'
import { computeAll } from '../domain/chain'
import type { AppData } from '../hooks/useData'
import { defaultBareme, makeExport, makeTrip, makeVehicle } from '../test/fixtures'
import { defaultRecapMonth, prepareExport, rebuildExport, runExport, sameExport } from './exportFlow'

const { year, rates } = defaultBareme()
const app = (o: Partial<AppData> = {}): AppData => ({
  trips: [], expenses: [], vehicles: [makeVehicle({ id: 'veh-A' })], fiscalYears: [], baremeYears: [year], rates,
  places: [], exports: [], ...o,
})

describe('prepareExport', () => {
  it('prépare la version 1 avec les montants à figer', () => {
    const t = makeTrip({ date: '2026-09-10', km_total: 100 })
    const a = app({ trips: [t, makeTrip({ date: '2026-09-11', statut: 'brouillon' })] })
    const p = prepareExport(a, computeAll(a), 'swing_house', '2026-09', '2026-10-01T08:00:00.000Z')
    expect(p.blocked).toBeNull()
    expect(p.drafts).toHaveLength(1)
    expect(p.prepared?.data.version).toBe(1)
    expect(p.prepared?.payload).toEqual([{ id: t.id, montant_bareme: 63.6 }])
  })

  it('bloque un mois déjà émis ; rien à exporter → message', () => {
    const a = app({ exports: [makeExport({ statut: 'emis' })] })
    expect(prepareExport(a, computeAll(a), 'swing_house', '2026-09', 'x').blocked).toMatch(/Déjà exporté/)
    const vide = app()
    expect(prepareExport(vide, computeAll(vide), 'lmnp', '2026-09', 'x')).toMatchObject({ prepared: null, blocked: 'Aucun trajet validé à exporter.' })
  })

  it('bloque l’export si le barème est indisponible pour le mois, en gardant l’aperçu des totaux', () => {
    const t = makeTrip({ date: '2026-09-10', km_total: 100 })
    // Aucune année de barème disponible : chain.computeAll signale bareme_indisponible pour ce trajet.
    const a = app({ trips: [t], baremeYears: [] })
    const p = prepareExport(a, computeAll(a), 'swing_house', '2026-09', 'x')
    expect(p.blocked).toMatch(/[Bb]arème/)
    expect(p.prepared).not.toBeNull()
    expect(p.prepared?.data.bareme_indisponible).toBe(true)
    expect(p.prepared?.data.totaux.km).toBe(100)
    expect(p.prepared?.data.totaux.bareme).toBe(0)
  })

  it('bloque aussi quand le barème est incomplet pour la puissance fiscale du véhicule (branche catch de chain.ts)', () => {
    // Barème présent pour l'année mais amputé de la tranche 5 CV (véhicule par défaut des fixtures) :
    // chain.computeAll échoue au calcul (catch) et signale bareme_indisponible, pas d'année absente.
    const ratesSans5cv = rates.filter((r) => !(r.cv_min === 5 && r.cv_max === 5))
    const t = makeTrip({ date: '2026-09-10', km_total: 100 })
    const a = app({ trips: [t], rates: ratesSans5cv })
    const p = prepareExport(a, computeAll(a), 'swing_house', '2026-09', 'x')
    expect(p.blocked).toMatch(/[Bb]arème/)
    expect(p.prepared?.data.bareme_indisponible).toBe(true)
    expect(p.prepared?.data.totaux.bareme).toBe(0)
  })
})

describe('sameExport', () => {
  const t = makeTrip({ date: '2026-09-10', km_total: 100 })
  const a = app({ trips: [t] })
  const p1 = prepareExport(a, computeAll(a), 'swing_house', '2026-09', 'x').prepared!

  it('deux préparations identiques (même si générées à un instant différent) → true', () => {
    const p2 = prepareExport(a, computeAll(a), 'swing_house', '2026-09', 'y').prepared!
    expect(sameExport(p1, p2)).toBe(true)
  })

  it('un montant différent pour le même trajet → false', () => {
    const p2: typeof p1 = { ...p1, payload: [{ id: p1.payload[0].id, montant_bareme: p1.payload[0].montant_bareme + 1 }] }
    expect(sameExport(p1, p2)).toBe(false)
  })

  it('un trajet supplémentaire arrivé entre-temps (ex. synchronisé depuis un autre appareil) → false', () => {
    const t2 = makeTrip({ date: '2026-09-11', km_total: 20 })
    const a2 = app({ trips: [t, t2] })
    const p2 = prepareExport(a2, computeAll(a2), 'swing_house', '2026-09', 'x').prepared!
    expect(sameExport(p1, p2)).toBe(false)
  })

  it('une version différente (ex. un export concurrent est passé entre-temps) → false', () => {
    const p2: typeof p1 = { ...p1, data: { ...p1.data, version: p1.data.version + 1 } }
    expect(sameExport(p1, p2)).toBe(false)
  })
})

describe('runExport', () => {
  it('refuse côté client si le barème est indisponible (garde-fou, sans appel réseau)', async () => {
    const t = makeTrip({ date: '2026-09-10', km_total: 100 })
    const a = app({ trips: [t], baremeYears: [] })
    const p = prepareExport(a, computeAll(a), 'swing_house', '2026-09', 'x')
    await expect(runExport({} as never, p.prepared!)).rejects.toThrow(/[Bb]arème/)
  })
})

describe('rebuildExport', () => {
  it('reconstruit un export émis à partir des trajets figés', () => {
    const e = makeExport({ id: 'e1', version: 1, created_at: '2026-10-01T08:00:00.000Z' })
    const t = makeTrip({ date: '2026-09-10', km_total: 100, statut: 'exporte', export_id: 'e1', montant_bareme: 63.6 })
    const a = app({ trips: [t], exports: [e] })
    const d = rebuildExport(a, computeAll(a), e)
    expect(d.version).toBe(1)
    expect(d.totaux.total).toBe(63.6)
    expect(d.genere_le).toBe('2026-10-01T08:00:00.000Z')
  })
})

describe('defaultRecapMonth', () => {
  it('mois précédent s’il reste des trajets non exportés, sinon mois courant', () => {
    expect(defaultRecapMonth(app({ trips: [makeTrip({ date: '2026-08-20' })] }), '2026-09-15')).toBe('2026-08')
    expect(defaultRecapMonth(app(), '2026-09-15')).toBe('2026-09')
  })

  it('ignore un mois précédent déjà exporté même avec un trajet tardif (pas de faux positif) → mois courant', () => {
    // Reproduit le défaut corrigé sur l'accueil (Task 14) : un export 'emis' du mois précédent ne
    // doit pas rouvrir Récap sur ce mois pour un simple trajet oublié après coup.
    const a = app({
      trips: [makeTrip({ date: '2026-08-20' })],
      exports: [makeExport({ activite: 'swing_house', mois: '2026-08', statut: 'emis', version: 1 })],
    })
    expect(defaultRecapMonth(a, '2026-09-15')).toBe('2026-09')
  })
})

import { describe, expect, it } from 'vitest'
import { computeAll } from '../domain/chain'
import type { AppData } from '../hooks/useData'
import { defaultBareme, makeExport, makeTrip, makeVehicle } from '../test/fixtures'
import { CarnetDB, SYNC_TABLES } from '../db/db'
import { saveRow } from '../db/repo'
import { makeExpense, makeFiscalYear, makePlace } from '../test/fixtures'
import {
  defaultRecapMonth, FRAIS_NON_INCLUS, fileToShare, modeNote, TOTAL_LABEL, NEGATIF_AVERTISSEMENT, prepareExport, rebuildExport, runExport, sameExport, SYNC_INCOMPLETE, syncIncompleteReason,
} from './exportFlow'

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

  it('une année de barème différente → false', () => {
    const p2: typeof p1 = { ...p1, data: { ...p1.data, bareme_annee: (p1.data.bareme_annee ?? 0) + 1 } }
    expect(sameExport(p1, p2)).toBe(false)
  })

  it('un barème provisoire différent → false', () => {
    const p2: typeof p1 = { ...p1, data: { ...p1.data, bareme_provisoire: !p1.data.bareme_provisoire } }
    expect(sameExport(p1, p2)).toBe(false)
  })
})

describe('fileToShare', () => {
  const t = makeTrip({ date: '2026-09-10', km_total: 100 })
  const before = app({ trips: [t] })
  const sent = prepareExport(before, computeAll(before), 'swing_house', '2026-09', 'x').prepared!
  const record = makeExport({ id: 'e9', activite: 'swing_house', mois: '2026-09', version: 1, created_at: '2026-10-01T09:00:00.000Z' })

  it('les trajets sont déjà marqués exportés (cas normal) → fichier reconstruit depuis le serveur', () => {
    const after = app({
      trips: [{ ...t, statut: 'exporte', export_id: record.id, montant_bareme: sent.payload[0].montant_bareme }],
      exports: [record],
    })
    const rebuilt = rebuildExport(after, computeAll(after), record)
    const result = fileToShare(sent, rebuilt, record)
    expect(result.lignes).toHaveLength(1)
    expect(result.totaux).toEqual(sent.data.totaux)
    expect(result.genere_le).toBe(record.created_at)
  })

  it('le pull a récupéré l’export mais pas encore les trajets (course avec la synchro) → repli sur l’aperçu envoyé, avec la date serveur', () => {
    // Trajet encore 'valide' (pas d'export_id) : rebuildExport ne retrouve aucun trajet figé pour
    // cet export et reconstruit un fichier vide/à 0 €, qui ne doit jamais être retenu.
    const after = app({ trips: [t], exports: [record] })
    const rebuilt = rebuildExport(after, computeAll(after), record)
    expect(rebuilt.lignes).toHaveLength(0) // le fichier vide qu'il ne faut pas partager
    const result = fileToShare(sent, rebuilt, record)
    expect(result.lignes).toHaveLength(1) // vient de `sent`, pas de `rebuilt`
    expect(result.totaux).toEqual(sent.data.totaux)
    expect(result.genere_le).toBe(record.created_at)
  })

  it('aucun enregistrement d’export retrouvé localement → l’aperçu envoyé tel quel', () => {
    expect(fileToShare(sent, null, null)).toBe(sent.data)
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

  it('re-partage stable : le cumul avant/après figé à l’export ne bouge pas quand un trajet du mois arrive après', () => {
    const avant = makeTrip({ date: '2026-08-10', km_total: 200 })
    const t = makeTrip({ date: '2026-09-10', km_total: 100 })
    const a = app({ trips: [avant, t] })
    const sent = prepareExport(a, computeAll(a), 'swing_house', '2026-09', 'x').prepared!
    expect(sent.data.totaux.cumuls).toEqual([{ vehicle_id: 'veh-A', avant: 200, apres: 300 }])
    // Enregistrement serveur : totaux tels qu'envoyés (p_totaux), trajets figés.
    const e = makeExport({ id: 'e2', totaux: sent.data.totaux, created_at: '2026-10-01T08:00:00.000Z' })
    const lock = (x: typeof t) => ({ ...x, statut: 'exporte' as const, export_id: 'e2', montant_bareme: sent.payload.find((l) => l.id === x.id)!.montant_bareme })
    // Plus tard : un trajet oublié daté du 20 septembre (partira en rattrapage le mois suivant).
    const oublie = makeTrip({ date: '2026-09-20', km_total: 50, created_at: '2026-10-05T08:00:00.000Z' })
    const later = app({ trips: [lock(avant), lock(t), oublie], exports: [e] })
    const d = rebuildExport(later, computeAll(later), e)
    expect(d.vehicules.map((v) => [v.cumulAvant, v.cumulApres])).toEqual([[200, 300]])
    expect(d.totaux).toEqual(sent.data.totaux)
  })

  it('re-partage : année et caractère provisoire du barème repris de l’enregistrement, pas du calcul du jour', () => {
    // Export émis en 2027 avec le barème 2026 provisoire ; le barème 2027 a été saisi depuis.
    const e = makeExport({ id: 'e4', mois: '2027-01', bareme_annee: 2026, bareme_provisoire: true, created_at: '2027-02-01T08:00:00.000Z' })
    const t = makeTrip({ date: '2027-01-10', km_total: 100, statut: 'exporte', export_id: 'e4', montant_bareme: 63.6 })
    const y2027 = { ...year, id: 'by-2027', annee: 2027 }
    const r2027 = rates.map((r) => ({ ...r, id: `${r.id}-2027`, annee: 2027 }))
    const a = app({ trips: [t], exports: [e], baremeYears: [year, y2027], rates: [...rates, ...r2027] })
    const d = rebuildExport(a, computeAll(a), e)
    expect(d.bareme_annee).toBe(2026)
    expect(d.bareme_provisoire).toBe(true)
  })

  it('re-partage d’un export ancien (sans cumuls enregistrés) : ignore les trajets créés après l’export', () => {
    const e = makeExport({ id: 'e3', created_at: '2026-10-01T08:00:00.000Z' })
    const t = makeTrip({ date: '2026-09-10', km_total: 100, statut: 'exporte', export_id: 'e3', montant_bareme: 63.6 })
    const oublie = makeTrip({ date: '2026-09-20', km_total: 50, created_at: '2026-10-05T08:00:00.000Z' })
    const a = app({ trips: [t, oublie], exports: [e] })
    const d = rebuildExport(a, computeAll(a), e)
    expect(d.vehicules.map((v) => [v.cumulAvant, v.cumulApres])).toEqual([[0, 100]])
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

describe('syncIncompleteReason (garde avant le verrouillage)', () => {
  const { year: by, rates: br } = defaultBareme()
  const rows = {
    trips: makeTrip(),
    trip_expenses: makeExpense(),
    vehicles: makeVehicle(),
    places: makePlace(),
    fiscal_years: makeFiscalYear(),
    bareme_years: by,
    bareme_rates: br[0],
  } as const

  it('couvre exactement les tables synchronisées', () => {
    expect(Object.keys(rows).sort()).toEqual([...SYNC_TABLES].sort())
  })

  it('rien en attente et synchro terminée sans erreur → null', async () => {
    const db = new CarnetDB(`test-${crypto.randomUUID()}`)
    expect(await syncIncompleteReason(db, { status: 'idle' })).toBeNull()
  })

  it.each(Object.keys(rows) as (keyof typeof rows)[])('une ligne encore à pousser dans %s → export bloqué', async (table) => {
    const db = new CarnetDB(`test-${crypto.randomUUID()}`)
    await saveRow(db, table, rows[table] as never)
    expect(await syncIncompleteReason(db, { status: 'idle' })).toBe(SYNC_INCOMPLETE)
    await db.table(table).toCollection().modify({ _dirty: 0 })
    expect(await syncIncompleteReason(db, { status: 'idle' })).toBeNull()
  })

  it.each(['error', 'offline', 'syncing'] as const)('état de synchro « %s » → export bloqué même sans ligne en attente', async (status) => {
    const db = new CarnetDB(`test-${crypto.randomUUID()}`)
    expect(await syncIncompleteReason(db, { status })).toBe(SYNC_INCOMPLETE)
  })

  it('message affiché', () => {
    expect(SYNC_INCOMPLETE).toBe('Synchronisation incomplète : vérifie le réseau puis relance l’export.')
  })
})

describe('modeNote (carte Récap)', () => {
  it('signale le mode frais réels, rien en mode barème', () => {
    const t = makeTrip({ date: '2026-09-10', km_total: 100 })
    const reel = app({ trips: [t], fiscalYears: [makeFiscalYear({ mode: 'frais_reels' })] })
    const d = prepareExport(reel, computeAll(reel), 'swing_house', '2026-09', 'x').prepared!.data
    expect(modeNote(d)).toBe('Frais réels : barème non appliqué.')
    const bar = app({ trips: [t] })
    expect(modeNote(prepareExport(bar, computeAll(bar), 'swing_house', '2026-09', 'x').prepared!.data)).toBeNull()
    expect(modeNote(null)).toBeNull()
  })
})

describe('montant négatif (avertissement, pas de blocage)', () => {
  it('export figé à 5 CV puis CV corrigé : aperçu signalé, export non bloqué, total annuel juste', () => {
    const e = makeExport({ id: 'e5', mois: '2026-03', statut: 'emis' })
    const exporte = makeTrip({ km_total: 5000, date: '2026-03-01', statut: 'exporte', montant_bareme: 3180, export_id: 'e5' })
    const reste = makeTrip({ km_total: 100, date: '2026-09-01' })
    const a = app({ trips: [exporte, reste], exports: [e], vehicles: [makeVehicle({ id: 'veh-A', cv: 3 })] })
    const p = prepareExport(a, computeAll(a), 'swing_house', '2026-09', 'x')
    expect(p.blocked).toBeNull()
    expect(p.prepared?.data.montant_negatif).toBe(true)
    expect(p.prepared?.payload).toEqual([{ id: reste.id, montant_bareme: -503.4 }])
    expect(NEGATIF_AVERTISSEMENT).toMatch(/Un montant est négatif/)
    const normal = app({ trips: [exporte, reste], exports: [e] })
    expect(prepareExport(normal, computeAll(normal), 'swing_house', '2026-09', 'x').prepared?.data.montant_negatif).toBe(false)
  })
})

describe('libellés du récap', () => {
  it('indemnités kilométriques, sans tutoiement ; mention des péages et parkings', () => {
    expect(TOTAL_LABEL).toEqual({
      swing_house: 'Indemnités kilométriques à rembourser',
      lmnp: 'Indemnités kilométriques (charge déductible)',
    })
    expect(FRAIS_NON_INCLUS).toBe('Péages et parkings non inclus : réglés directement par l’entreprise.')
  })
})

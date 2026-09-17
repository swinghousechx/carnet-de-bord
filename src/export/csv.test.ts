import { describe, expect, it } from 'vitest'
import type { ExportData, LigneExport } from './build'
import { csvEscape, toCsv } from './csv'
import { exportFileName } from './filenames'

const ligne = (o: Partial<LigneExport> = {}): LigneExport => ({
  trip_id: 't1', date: '2026-09-10', motif: 'Réunion ; fournisseur "TrackMan"', depart: 'Domicile', arrivee: 'Annecy',
  km: 84.5, aller_retour: true, km_route: 42.3, km_saisi: null, justif_km: null, montant_bareme: 53.74,
  rattrapage: null, vehicule: 'Golf (AB-123-CD, 5 CV)', nature: 'pro', ...o,
})

const data = {
  activite: 'swing_house', mois: '2026-09', version: 1, lignes: [ligne()],
  pourMemoire: [ligne({ trip_id: 't2', motif: 'Trajet habituel du matin', nature: 'domicile_travail', montant_bareme: 0 })],
} as unknown as ExportData

describe('csv', () => {
  it('échappe guillemets et points-virgules', () => {
    expect(csvEscape('a;b')).toBe('"a;b"')
    expect(csvEscape('dit "x"')).toBe('"dit ""x"""')
    expect(csvEscape('simple')).toBe('simple')
  })
  it('BOM UTF-8, séparateur ;, décimales à virgule, fins de ligne CRLF', () => {
    const csv = toCsv(data)
    expect(csv.startsWith('﻿Date;Activité;Motif;')).toBe(true)
    const rows = csv.slice(1).trimEnd().split('\r\n')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toContain('10/09/2026;Swing House;"Réunion ; fournisseur ""TrackMan""";Domicile;Annecy;Oui;84,5;')
    expect(rows[0]).toBe('Date;Activité;Motif;Départ;Arrivée;Aller-retour;Km;Correction km;Véhicule;Indemnité (€);Nature;Rattrapage')
    expect(rows[1]).toContain(';Golf (AB-123-CD, 5 CV);53,74;Déplacement professionnel;')
    expect(rows[2]).toContain(';0,00;Domicile–travail (non remboursé);')
  })
  it('ligne pour mémoire : indemnité à 0, même si la ligne source porte un montant', () => {
    const d2 = { ...data, pourMemoire: [ligne({ trip_id: 't2', nature: 'domicile_travail', montant_bareme: 12.5 })] } as unknown as ExportData
    const rows = toCsv(d2).slice(1).trimEnd().split('\r\n')
    expect(rows[2]).toContain(';0,00;Domicile–travail (non remboursé);')
  })
  it('mode frais réels : la colonne Nature précise que le barème n’est pas appliqué (montant 0 voulu)', () => {
    const reel = { ...data, mode: 'frais_reels', lignes: [ligne({ montant_bareme: 0 })] } as unknown as ExportData
    const rows = toCsv(reel).slice(1).trimEnd().split('\r\n')
    expect(rows[0].split(';')).toHaveLength(12) // une ligne d'en-tête, puis une ligne par trajet
    expect(rows[1]).toContain(';0,00;Déplacement professionnel (frais réels : barème non appliqué);')
    expect(rows[2]).toContain(';Domicile–travail (non remboursé);')
  })
  it('nom de fichier stable', () => {
    expect(exportFileName({ activite: 'swing_house', mois: '2026-09', version: 2 }, 'pdf')).toBe('carnet-swing-house-2026-09-v2.pdf')
    expect(exportFileName({ activite: 'lmnp', mois: '2026-09', version: 1 }, 'csv')).toBe('carnet-lmnp-2026-09-v1.csv')
  })
})

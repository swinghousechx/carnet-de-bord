import { describe, expect, it } from 'vitest'
import type { ExportData, LigneExport } from './build'
import { csvEscape, toCsv } from './csv'
import { exportFileName } from './filenames'

const ligne = (o: Partial<LigneExport> = {}): LigneExport => ({
  trip_id: 't1', date: '2026-09-10', motif: 'Réunion ; fournisseur "TrackMan"', depart: 'Domicile', arrivee: 'Annecy',
  km: 84.5, aller_retour: true, km_route: 42.3, km_saisi: null, justif_km: null, montant_bareme: 53.74, frais: 4.6,
  frais_detail: 'Péage 4,60 € (A40)', total: 58.34, rattrapage: null, vehicule: 'Golf (AB-123-CD, 5 CV)', nature: 'pro', ...o,
})

const data = {
  activite: 'swing_house', mois: '2026-09', version: 1, lignes: [ligne()],
  pourMemoire: [ligne({ trip_id: 't2', motif: 'Trajet habituel du matin', nature: 'domicile_travail', montant_bareme: 0, frais: 0, frais_detail: '', total: 0 })],
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
    expect(rows[1]).toContain(';53,74;4,60;Péage 4,60 € (A40);58,34;Déplacement professionnel;')
    expect(rows[2]).toContain(';0,00;Domicile–travail (non remboursé);')
  })
  it('met à zéro les colonnes monétaires (barème, frais annexes, total) des lignes pour mémoire, même si les frais annexes saisis sont non nuls', () => {
    // Un trajet domicile–travail peut porter un péage/parking : ni le barème, ni ces frais
    // annexes ne sont remboursables. Le CSV doit afficher 0,00 sur les trois colonnes monétaires,
    // même si la ligne source porte encore un barème ou des frais non nuls.
    const dataAvecFraisNonNuls = {
      ...data,
      pourMemoire: [ligne({ trip_id: 't2', motif: 'Trajet habituel du matin', nature: 'domicile_travail', montant_bareme: 12.5, frais: 4.6, frais_detail: 'Péage 4,60 € (A40)', total: 17.1 })],
    } as unknown as ExportData
    const csv = toCsv(dataAvecFraisNonNuls)
    const rows = csv.slice(1).trimEnd().split('\r\n')
    // Colonnes : ...Véhicule;Barème (€);Frais annexes (€);Détail frais;Total (€);Nature;...
    expect(rows[2]).toContain(';0,00;0,00;Péage 4,60 € (A40);0,00;Domicile–travail (non remboursé);')
  })
  it('nom de fichier stable', () => {
    expect(exportFileName({ activite: 'swing_house', mois: '2026-09', version: 2 }, 'pdf')).toBe('carnet-swing-house-2026-09-v2.pdf')
    expect(exportFileName({ activite: 'lmnp', mois: '2026-09', version: 1 }, 'csv')).toBe('carnet-lmnp-2026-09-v1.csv')
  })
})

import { describe, expect, it } from 'vitest'
import type { ExportData, LigneExport } from './build'
import { autoTableParts, PDF_COLONNES, pdfEntete, pdfPiedTableau, pdfText, renderPdf, signatureTexte } from './pdf'

const ligne: LigneExport = {
  trip_id: 't1', date: '2026-09-10', motif: 'Réunion fournisseur TrackMan à Annecy', depart: 'Domicile', arrivee: 'Annecy',
  km: 84.6, aller_retour: true, km_route: 42.3, km_saisi: null, justif_km: null, montant_bareme: 53.8,
  rattrapage: 'août 2026', vehicule: 'Golf (AB-123-CD, 5 CV)', nature: 'pro',
}

const data: ExportData = {
  activite: 'swing_house', mois: '2026-09', version: 2, titre: 'Swing House SAS — Note de frais kilométriques',
  beneficiaire: 'Sam Pochat', lignes: Array.from({ length: 40 }, (_, i) => ({ ...ligne, trip_id: `t${i}` })),
  pourMemoire: [{ ...ligne, trip_id: 'dt', nature: 'domicile_travail', montant_bareme: 0 }],
  totaux: { km: 3384, bareme: 2152, frais: 0, total: 2152, nb_trajets: 40 },
  vehicules: [{ nom: 'Golf', immatriculation: 'AB-123-CD', cv: 5, energie: 'thermique', cumulAvant: 1200, cumulApres: 4584 }],
  bareme_annee: 2026, bareme_provisoire: false, bareme_indisponible: false,
  montant_negatif: false, mode: 'bareme', genere_le: '2026-10-01T09:00:00.000Z',
}

describe('pdf', () => {
  it('pdfText remplace les caractères hors WinAnsi', () => {
    expect(pdfText('A → B € — x')).toBe('A > B € - x')
  })
  it('une seule colonne de montant, pied sans frais, mention des péages et parkings', () => {
    expect(PDF_COLONNES).toEqual(['Date', 'Motif', 'Trajet', 'Km', 'Indemnité'])
    expect(pdfPiedTableau(data)).toEqual(['Total', '40 trajet(s)', '', '3 384', '2 152,00 €'])
    expect(pdfEntete(data)).toContain('Péages et parkings non inclus : réglés directement par l’entreprise.')
    const reel = pdfEntete({ ...data, mode: 'frais_reels' }).join('\n')
    expect(reel).toMatch(/frais réels/i)
    expect(reel).not.toMatch(/frais annexes/)
    expect(pdfEntete(data).join('\n')).not.toMatch(/\bte\b|\btu\b/)
  })
  it('montants et km alignés à droite, y compris dans le pied et les sous-totaux', () => {
    const parts = autoTableParts({
      head: ['Date', 'Motif', 'Trajet', 'Km', 'Indemnité', 'Statut'],
      body: [
        ['01/03/2026', 'm', 't', '1 218,6', '849,36 €', 'Exporté v1'],
        [{ content: 'Sous-total mars 2026 · 1 trajet(s)', bold: true, colSpan: 3 }, { content: '1 218,6', bold: true }, { content: '849,36 €', bold: true }, { content: '', bold: true }],
      ],
      foot: ['Total 2026', '1 trajet(s)', '', '1 218,6', '849,36 €', ''],
      widths: [22, 95, 80, 16, 26, 30],
      rightFrom: 3,
      rightTo: 4,
    })
    const align = (row: { styles?: { halign?: string } }[]) => row.map((c) => c.styles?.halign ?? '')
    expect(align(parts.foot![0])).toEqual(['', '', '', 'right', 'right', ''])
    expect(align(parts.body[0])).toEqual(['', '', '', 'right', 'right', ''])
    expect(align(parts.body[1])).toEqual(['', 'right', 'right', ''])
    expect(parts.body[1][0]).toMatchObject({ colSpan: 3, styles: { fontStyle: 'bold' } })
    expect(parts.foot![0][4]).toMatchObject({ content: '849,36 €' })
  })
  it('signature : « Certifié exact » pour la note mensuelle, « Établi le » pour la synthèse', () => {
    expect(signatureTexte('certifie', '2026-10-01T09:00:00.000Z')).toBe('Certifié exact, le 01/10/2026.')
    expect(signatureTexte('etabli', '2026-12-31T09:00:00.000Z')).toBe('Établi le 31/12/2026.')
  })
  it('génère un PDF multipage', async () => {
    const blob = renderPdf(data)
    expect(blob.type).toBe('application/pdf')
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))
    expect(head).toBe('%PDF-')
    expect(blob.size).toBeGreaterThan(3000)
  })
})

import { describe, expect, it } from 'vitest'
import type { ExportData, LigneExport } from './build'
import { pdfText, renderPdf } from './pdf'

const ligne: LigneExport = {
  trip_id: 't1', date: '2026-09-10', motif: 'Réunion fournisseur TrackMan à Annecy', depart: 'Domicile', arrivee: 'Annecy',
  km: 84.6, aller_retour: true, km_route: 42.3, km_saisi: null, justif_km: null, montant_bareme: 53.8, frais: 4.6,
  frais_detail: 'Péage 4,60 € (A40)', total: 58.4, rattrapage: 'août 2026', vehicule: 'Golf (AB-123-CD, 5 CV)', nature: 'pro',
}

const data: ExportData = {
  activite: 'swing_house', mois: '2026-09', version: 2, titre: 'Swing House SAS — Note de frais kilométriques',
  beneficiaire: 'Sam Pochat', lignes: Array.from({ length: 40 }, (_, i) => ({ ...ligne, trip_id: `t${i}` })),
  pourMemoire: [{ ...ligne, trip_id: 'dt', nature: 'domicile_travail', montant_bareme: 0, total: 0 }],
  totaux: { km: 3384, bareme: 2152, frais: 184, total: 2336, nb_trajets: 40 },
  vehicules: [{ nom: 'Golf', immatriculation: 'AB-123-CD', cv: 5, energie: 'thermique', cumulAvant: 1200, cumulApres: 4584 }],
  bareme_annee: 2026, bareme_provisoire: false, bareme_indisponible: false, mode: 'bareme', genere_le: '2026-10-01T09:00:00.000Z',
}

describe('pdf', () => {
  it('pdfText remplace les caractères hors WinAnsi', () => {
    expect(pdfText('A → B € — x')).toBe('A > B € - x')
  })
  it('génère un PDF multipage', async () => {
    const blob = renderPdf(data)
    expect(blob.type).toBe('application/pdf')
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))
    expect(head).toBe('%PDF-')
    expect(blob.size).toBeGreaterThan(3000)
  })
})

import { jsPDF } from 'jspdf'
import { autoTable, type UserOptions } from 'jspdf-autotable'
import { decimalFr, formatDateCourte, formatEuro, formatKm, formatMoisLong } from '../lib/format'
import type { Energie } from '../domain/types'
import { FRAIS_NON_INCLUS, type ExportData, type LigneExport } from './build'

// Helvetica (police standard PDF) = encodage WinAnsi : on remplace ce qu'elle ne sait pas afficher.
export function pdfText(s: string): string {
  return s
    .replace(/[  ]/g, ' ')
    .replace(/→/g, '>')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
}

const M = 14 // marge (mm)

// Style commun : noir sur blanc, filets fins, aucune couleur.
const BASE: Partial<UserOptions> = {
  theme: 'plain',
  styles: { font: 'helvetica', fontSize: 8.5, textColor: 0, cellPadding: 1.8, lineColor: 0, lineWidth: 0 },
  headStyles: { fontStyle: 'bold', lineWidth: { bottom: 0.3 } },
  bodyStyles: { lineWidth: { bottom: 0.1 } },
  footStyles: { fontStyle: 'bold', lineWidth: { top: 0.3 } },
  margin: { left: M, right: M, bottom: 16 },
}

export const trajet = (l: LigneExport) => `${l.depart} - ${l.arrivee}${l.aller_retour ? ' (aller-retour)' : ''}`

// En-tête (lignes de texte sous le titre).
export function pdfEntete(d: ExportData): string[] {
  return [
    `Bénéficiaire : ${d.beneficiaire}`,
    `Période : ${formatMoisLong(d.mois)}${d.version > 1 ? ` - version ${d.version}, annule et remplace la version ${d.version - 1}` : ''}`,
    ...d.vehicules.map(
      (v) =>
        `${vehiculeTexte(v)} - cumul ${d.mois.slice(0, 4)} : ${formatKm(v.cumulAvant)} avant ce mois, ${formatKm(v.cumulApres)} en fin de mois`,
    ),
    d.mode === 'bareme' ? baremeTexte([{ annee: d.bareme_annee, provisoire: d.bareme_provisoire }]) : FRAIS_REELS_PDF,
    FRAIS_NON_INCLUS,
  ]
}

// Une seule colonne de montant : l'indemnité kilométrique.
export const PDF_COLONNES = ['Date', 'Motif', 'Trajet', 'Km', 'Indemnité']

export function pdfPiedTableau(d: ExportData): string[] {
  return ['Total', `${d.totaux.nb_trajets} trajet(s)`, '', decimalFr(d.totaux.km, 1), formatEuro(d.totaux.bareme)]
}

// Blocs communs aux notes mensuelles et au récapitulatif annuel.
export const FRAIS_REELS_PDF = 'Mode frais réels : coût du véhicule traité hors de cet état, barème non appliqué.'

export function vehiculeTexte(v: { nom: string; immatriculation: string; cv: number; energie: Energie }): string {
  return `Véhicule : ${v.nom} - ${v.immatriculation} - ${v.cv} CV - ${v.energie === 'electrique' ? 'électrique' : 'thermique'}`
}

export function baremeTexte(baremes: { annee: number | null; provisoire: boolean }[]): string {
  const parts = baremes.map((b) => `${b.annee ?? '-'}${b.provisoire ? ' (provisoire : barème de l’année pas encore publié)' : ''}`)
  return `Barème kilométrique ${parts.length > 0 ? parts.join(' ; ') : '-'}`
}

// Cellule de tableau : texte simple, ou ligne de sous-total (en gras).
export type PdfCell = string | { content: string; bold: true }

export interface PdfTable {
  titre?: string
  head: string[]
  body: PdfCell[][]
  foot?: string[]
  widths: number[] // mm ; les colonnes à partir de `rightFrom` sont alignées à droite
  rightFrom?: number
  rightTo?: number
}

export interface PdfDocument {
  titre: string
  entete: string[]
  tableaux: PdfTable[]
  pourMemoire: LigneExport[]
  beneficiaire: string
  genere_le: string
  piedPage: string // ex. « … - septembre 2026 », suivi de « - page i/n »
}

const cell = (c: PdfCell) => (typeof c === 'string' ? pdfText(c) : { content: pdfText(c.content), styles: { fontStyle: 'bold' as const } })

export function renderDocument(p: PdfDocument): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const t = pdfText
  const H = doc.internal.pageSize.getHeight()
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const room = (y: number, need: number) => {
    if (y <= H - need) return y
    doc.addPage()
    return 20
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(t(p.titre), M, 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  p.entete.forEach((s, i) => doc.text(t(s), M, 26 + i * 5))

  let y = 26 + p.entete.length * 5 + 3
  for (const tab of p.tableaux) {
    if (tab.titre) {
      y = room(y + 4, 40)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(t(tab.titre), M, y)
      y += 2
    }
    const columnStyles = Object.fromEntries(
      tab.widths.map((w, i) => [i, { cellWidth: w, ...(tab.rightFrom != null && i >= tab.rightFrom && i <= (tab.rightTo ?? Infinity) ? { halign: 'right' as const } : {}) }]),
    )
    autoTable(doc, {
      ...BASE,
      startY: y,
      showFoot: 'lastPage',
      head: [tab.head.map(t)],
      body: tab.body.map((row) => row.map(cell)),
      ...(tab.foot ? { foot: [tab.foot.map(t)] } : {}),
      columnStyles,
    })
    y = finalY() + 6
  }

  y += 4
  if (p.pourMemoire.length > 0) {
    y = room(y, 40)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(t('Pour mémoire - trajets domicile-travail non remboursés'), M, y)
    autoTable(doc, {
      ...BASE,
      startY: y + 2,
      head: [['Date', 'Motif', 'Trajet', 'Km']],
      body: p.pourMemoire.map((l) => [formatDateCourte(l.date), l.motif, trajet(l), decimalFr(l.km, 1)].map(t)),
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 80 }, 2: { cellWidth: 70 }, 3: { cellWidth: 16, halign: 'right' } },
    })
    y = finalY() + 10
  }

  y = room(y, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(t(`Certifié exact, le ${formatDateCourte(p.genere_le.slice(0, 10))}.`), M, y)
  doc.text(t(p.beneficiaire), M, y + 6)

  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.text(t(`${p.piedPage} - page ${i}/${n}`), M, H - 8)
  }
  return doc.output('blob')
}

// Ligne de tableau d'un trajet (date, motif, trajet, km, indemnité), commune aux deux documents.
export function trajetCells(l: LigneExport, rattrapage: boolean): string[] {
  return [
    formatDateCourte(l.date) + (rattrapage && l.rattrapage ? `\nrattrapage ${l.rattrapage}` : ''),
    l.motif + (l.km_saisi != null ? `\nKm corrigés : ${l.justif_km ?? ''}` : ''),
    trajet(l),
    decimalFr(l.km, 1),
    formatEuro(l.montant_bareme),
  ]
}

export function renderPdf(d: ExportData): Blob {
  return renderDocument({
    titre: d.titre,
    entete: pdfEntete(d),
    tableaux: [{
      head: PDF_COLONNES,
      body: d.lignes.map((l) => trajetCells(l, true)),
      foot: pdfPiedTableau(d),
      widths: [24, 110, 89, 16, 30],
      rightFrom: 3,
    }],
    pourMemoire: d.pourMemoire,
    beneficiaire: d.beneficiaire,
    genere_le: d.genere_le,
    piedPage: `${d.titre} - ${formatMoisLong(d.mois)}`,
  })
}

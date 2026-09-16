import { jsPDF } from 'jspdf'
import { autoTable, type UserOptions } from 'jspdf-autotable'
import { decimalFr, formatDateCourte, formatEuro, formatKm, formatMoisLong } from '../lib/format'
import type { ExportData, LigneExport } from './build'

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

const trajet = (l: LigneExport) => `${l.depart} - ${l.arrivee}${l.aller_retour ? ' (aller-retour)' : ''}`

export function renderPdf(d: ExportData): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const t = pdfText
  const H = doc.internal.pageSize.getHeight()
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(t(d.titre), M, 18)

  const entete = [
    `Bénéficiaire : ${d.beneficiaire}`,
    `Période : ${formatMoisLong(d.mois)}${d.version > 1 ? ` - version ${d.version}, annule et remplace la version ${d.version - 1}` : ''}`,
    ...d.vehicules.map(
      (v) =>
        `Véhicule : ${v.nom} - ${v.immatriculation} - ${v.cv} CV - ${v.energie === 'electrique' ? 'électrique' : 'thermique'}` +
        ` - cumul ${d.mois.slice(0, 4)} : ${formatKm(v.cumulAvant)} avant ce mois, ${formatKm(v.cumulApres)} en fin de mois`,
    ),
    d.mode === 'bareme'
      ? `Barème kilométrique ${d.bareme_annee ?? '-'}${d.bareme_provisoire ? " (provisoire : barème de l'année pas encore publié)" : ''}`
      : 'Mode frais réels : coût du véhicule traité hors de cet état ; seuls les frais annexes figurent ici.',
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  entete.forEach((s, i) => doc.text(t(s), M, 26 + i * 5))

  autoTable(doc, {
    ...BASE,
    startY: 26 + entete.length * 5 + 3,
    showFoot: 'lastPage',
    head: [['Date', 'Motif', 'Trajet', 'Km', 'Barème', 'Frais annexes', 'Total']],
    body: d.lignes.map((l) =>
      [
        formatDateCourte(l.date) + (l.rattrapage ? `\nrattrapage ${l.rattrapage}` : ''),
        l.motif + (l.km_saisi != null ? `\nKm corrigés : ${l.justif_km ?? ''}` : ''),
        trajet(l),
        decimalFr(l.km, 1),
        formatEuro(l.montant_bareme),
        l.frais_detail ? `${formatEuro(l.frais)}\n${l.frais_detail}` : '',
        formatEuro(l.total),
      ].map(t),
    ),
    foot: [
      [
        'Total',
        `${d.totaux.nb_trajets} trajet(s)`,
        '',
        decimalFr(d.totaux.km, 1),
        formatEuro(d.totaux.bareme),
        formatEuro(d.totaux.frais),
        formatEuro(d.totaux.total),
      ].map(t),
    ],
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 80 },
      2: { cellWidth: 70 },
      3: { cellWidth: 16, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 32, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
    },
  })

  let y = finalY() + 10
  if (d.pourMemoire.length > 0) {
    if (y > H - 40) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(t('Pour mémoire - trajets domicile-travail non remboursés'), M, y)
    autoTable(doc, {
      ...BASE,
      startY: y + 2,
      head: [['Date', 'Motif', 'Trajet', 'Km']],
      body: d.pourMemoire.map((l) => [formatDateCourte(l.date), l.motif, trajet(l), decimalFr(l.km, 1)].map(t)),
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 80 }, 2: { cellWidth: 70 }, 3: { cellWidth: 16, halign: 'right' } },
    })
    y = finalY() + 10
  }

  if (y > H - 30) {
    doc.addPage()
    y = 20
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(t(`Certifié exact, le ${formatDateCourte(d.genere_le.slice(0, 10))}.`), M, y)
  doc.text(t(d.beneficiaire), M, y + 6)

  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.text(t(`${d.titre} - ${formatMoisLong(d.mois)} - page ${i}/${n}`), M, H - 8)
  }
  return doc.output('blob')
}

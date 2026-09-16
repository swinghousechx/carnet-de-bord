import type { ExportData } from './build'
import { toCsv } from './csv'
import { exportFileName } from './filenames'
import { renderPdf } from './pdf'

export function makeExportFiles(d: ExportData): File[] {
  return [
    new File([renderPdf(d)], exportFileName(d, 'pdf'), { type: 'application/pdf' }),
    new File([toCsv(d)], exportFileName(d, 'csv'), { type: 'text/csv;charset=utf-8' }),
  ]
}

// À appeler directement dans un gestionnaire de tap : iOS exige un geste utilisateur récent.
export async function shareOrDownload(files: File[], title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.share && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title })
      return 'shared'
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled'
      // Autre refus (ex. NotAllowedError) : repli sur le téléchargement.
    }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f)
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  return 'downloaded'
}

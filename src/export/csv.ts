import type { ExportData } from './build'
import { CSV_COLUMNS, type CsvColumn } from './columns'

export function csvEscape(s: string): string {
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// CSV pour Excel FR : BOM UTF-8, séparateur « ; », décimales à virgule, CRLF.
export function toCsv(d: ExportData, columns: CsvColumn[] = CSV_COLUMNS): string {
  const line = (cells: string[]) => cells.map(csvEscape).join(';')
  const rows = [line(columns.map((c) => c.header))]
  for (const l of d.lignes) rows.push(line(columns.map((c) => c.value(l, d, false))))
  for (const l of d.pourMemoire) rows.push(line(columns.map((c) => c.value(l, d, true))))
  return `﻿${rows.join('\r\n')}\r\n`
}

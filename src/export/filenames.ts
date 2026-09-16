import type { Activite } from '../domain/types'

export function exportFileName(d: { activite: Activite; mois: string; version: number }, ext: 'pdf' | 'csv'): string {
  const act = d.activite === 'swing_house' ? 'swing-house' : 'lmnp'
  return `carnet-${act}-${d.mois}-v${d.version}.${ext}`
}

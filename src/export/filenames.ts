import type { Activite } from '../domain/types'

const slug = (a: Activite) => (a === 'swing_house' ? 'swing-house' : 'lmnp')

export function exportFileName(d: { activite: Activite; mois: string; version: number }, ext: 'pdf' | 'csv'): string {
  return `carnet-${slug(d.activite)}-${d.mois}-v${d.version}.${ext}`
}

// Récapitulatif annuel (non verrouillant) : même préfixe, sans version.
export function annualFileName(d: { activite: Activite; annee: number }, ext: 'pdf' | 'csv'): string {
  return `carnet-${slug(d.activite)}-${d.annee}-recap-annuel.${ext}`
}

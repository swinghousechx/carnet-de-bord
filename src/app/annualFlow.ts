import type { TripCalc } from '../domain/chain'
import type { Activite } from '../domain/types'
import { buildAnnualData, type AnnualData } from '../export/annual'
import type { AppData } from '../hooks/useData'

// Vue annuelle du Récap : synthèse locale, sans réseau ni verrouillage.
export function prepareAnnual(app: AppData, calc: Map<string, TripCalc>, activite: Activite, annee: number, genereLe: string): AnnualData {
  return buildAnnualData({ activite, annee, data: app, calc, genere_le: genereLe })
}

export function annualCardStatus(d: AnnualData): { mois: string | null; alertes: string[] } {
  return {
    // Aucun trajet compté : rien à dire (pas de « 0 mois exporté(s) sur 0 »).
    mois: d.moisTotal > 0 ? `${d.moisExportes} mois exporté(s) sur ${d.moisTotal}` : null,
    alertes: [
      d.nonExportes > 0 ? `${d.nonExportes} trajet(s) non encore exporté(s)` : '',
      d.brouillons > 0 ? `${d.brouillons} brouillon(s)` : '',
    ].filter(Boolean),
  }
}

// Court pour tenir sur une ligne à 375 px : l'activité figure déjà dans l'en-tête de la carte.
export function annualButtonLabel(annee: number): string {
  return `Exporter le récapitulatif ${annee}`
}

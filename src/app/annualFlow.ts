import type { TripCalc } from '../domain/chain'
import { ACTIVITE_LABEL, type Activite } from '../domain/types'
import { buildAnnualData, type AnnualData } from '../export/annual'
import type { AppData } from '../hooks/useData'

// Vue annuelle du Récap : synthèse locale, sans réseau ni verrouillage.
export function prepareAnnual(app: AppData, calc: Map<string, TripCalc>, activite: Activite, annee: number, genereLe: string): AnnualData {
  return buildAnnualData({ activite, annee, data: app, calc, genere_le: genereLe })
}

export function annualCardStatus(d: AnnualData): { mois: string; alertes: string[] } {
  return {
    mois: `${d.moisExportes} mois exporté(s) sur ${d.moisTotal}`,
    alertes: [
      d.nonExportes > 0 ? `${d.nonExportes} trajet(s) non encore exporté(s)` : '',
      d.brouillons > 0 ? `${d.brouillons} brouillon(s)` : '',
    ].filter(Boolean),
  }
}

export function annualButtonLabel(activite: Activite, annee: number): string {
  return `Exporter le récapitulatif annuel — ${ACTIVITE_LABEL[activite]} ${annee}`
}

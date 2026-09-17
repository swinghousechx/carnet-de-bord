import { ACTIVITE_LABEL } from '../domain/types'
import { decimalFr, formatDateCourte } from '../lib/format'
import type { Activite, ModeFiscal } from '../domain/types'
import type { LigneExport } from './build'

// Ce dont une colonne a besoin du document (note mensuelle ou récapitulatif annuel).
export interface CsvContext {
  activite: Activite
  mode: ModeFiscal
}

export interface CsvColumn<L extends LigneExport = LigneExport, D extends CsvContext = CsvContext> {
  header: string
  value: (l: L, d: D, pourMemoire: boolean) => string
}

// Colonnes du CSV. SEUL fichier à modifier quand le comptable aura donné son format.
export const CSV_COLUMNS: CsvColumn[] = [
  { header: 'Date', value: (l) => formatDateCourte(l.date) },
  { header: 'Activité', value: (_l, d) => ACTIVITE_LABEL[d.activite] },
  { header: 'Motif', value: (l) => l.motif },
  { header: 'Départ', value: (l) => l.depart },
  { header: 'Arrivée', value: (l) => l.arrivee },
  { header: 'Aller-retour', value: (l) => (l.aller_retour ? 'Oui' : 'Non') },
  { header: 'Km', value: (l) => decimalFr(l.km, 1) },
  {
    header: 'Correction km',
    value: (l) =>
      l.km_saisi == null
        ? ''
        : `${decimalFr(l.km_saisi, 1)} au lieu de ${l.km_route == null ? '—' : decimalFr(l.km_route, 1)} : ${l.justif_km ?? ''}`,
  },
  { header: 'Véhicule', value: (l) => l.vehicule },
  // Seul montant : l'indemnité kilométrique. Péages et parkings ne figurent pas dans la note (réglés
  // directement par l'entreprise, spec §6.4) ; la mention n'est pas ajoutée au CSV pour garder le
  // format « une ligne d'en-tête puis une ligne par trajet » (elle figure dans le PDF).
  // Ligne pour mémoire (domicile–travail) : non remboursable, donc 0.
  { header: 'Indemnité (€)', value: (l, _d, pm) => decimalFr(pm ? 0 : l.montant_bareme, 2) },
  // Mode frais réels (spec §6.4) : barème à 0 € voulu, précisé ici pour ne pas passer pour un oubli.
  {
    header: 'Nature',
    value: (_l, d, pm) =>
      pm ? 'Domicile–travail (non remboursé)'
      : d.mode === 'frais_reels' ? 'Déplacement professionnel (frais réels : barème non appliqué)'
      : 'Déplacement professionnel',
  },
  { header: 'Rattrapage', value: (l) => l.rattrapage ?? '' },
]

// Types partagés : une interface par table (mêmes noms de colonnes que Supabase).

export type Activite = 'swing_house' | 'lmnp'
export type Nature = 'pro' | 'domicile_travail'
export type Statut = 'brouillon' | 'valide' | 'exporte'
export type Energie = 'thermique' | 'electrique'
export type ModeFiscal = 'bareme' | 'frais_reels'
export type PlaceRole = 'domicile' | 'swing_house' | 'lmnp'
export type ExpenseType = 'peage' | 'parking' | 'autre'
export type ExportStatut = 'emis' | 'a_rectifier' | 'remplace'

export const ACTIVITES: Activite[] = ['swing_house', 'lmnp']

export const ACTIVITE_LABEL: Record<Activite, string> = {
  swing_house: 'Swing House',
  lmnp: 'LMNP',
}

export const ROLE_LABEL: Record<PlaceRole, string> = {
  domicile: 'Domicile',
  swing_house: 'Swing House',
  lmnp: 'Appartement LMNP',
}

export interface BaseRow {
  id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Vehicle extends BaseRow {
  nom: string
  immatriculation: string
  cv: number
  energie: Energie
  date_debut: string
  date_fin: string | null
}

export interface FiscalYear extends BaseRow {
  annee: number
  activite: Activite
  mode: ModeFiscal
  inclure_domicile_travail: boolean
}

export interface BaremeYear extends BaseRow {
  annee: number
  majoration_electrique: number
  source: string
}

export interface BaremeRate extends BaseRow {
  annee: number
  cv_min: number | null
  cv_max: number | null
  km_min: number
  km_max: number | null
  coef: number
  constante: number
}

export interface Place extends BaseRow {
  label: string
  adresse: string
  google_place_id: string | null
  lat: number | null
  lng: number | null
  role: PlaceRole | null
  last_used_at: string | null
}

export interface Trip extends BaseRow {
  date: string
  activite: Activite
  motif: string
  depart_place_id: string | null
  depart_label: string
  depart_adresse: string
  arrivee_place_id: string | null
  arrivee_label: string
  arrivee_adresse: string
  km_route: number | null // aller simple calculé par Google
  km_saisi: number | null // aller simple corrigé à la main
  justif_km: string | null
  aller_retour: boolean
  km_total: number | null
  vehicle_id: string | null
  nature: Nature | null // null = question domicile–travail sans réponse
  statut: Statut
  brouillon_force: boolean // « Finir plus tard »
  doublon_confirme: boolean // doublon signalé puis confirmé
  montant_bareme: number // figé à l'export ; 0 sinon (calcul à la volée)
  export_id: string | null
}

export interface TripExpense extends BaseRow {
  trip_id: string
  type: ExpenseType
  montant: number
  note: string
}

// Cumul annuel des km d'un véhicule (groupe de la chaîne) figé au moment de l'export, pour que
// l'en-tête d'un re-partage reste identique au fichier d'origine.
export interface ExportCumul {
  vehicle_id: string
  avant: number
  apres: number
}

export interface ExportTotaux {
  km: number
  bareme: number
  frais: number
  total: number
  nb_trajets: number
  cumuls?: ExportCumul[] // absent sur les exports antérieurs à ce champ
}

export interface ExportRecord extends BaseRow {
  activite: Activite
  mois: string
  version: number
  statut: ExportStatut
  bareme_annee: number | null
  bareme_provisoire: boolean
  totaux: ExportTotaux
  trip_ids: string[]
}

export interface TripEvent extends BaseRow {
  trip_id: string
  export_id: string | null
  action: 'export' | 'reopen'
  motif: string | null
}

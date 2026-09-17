import Dexie, { type EntityTable } from 'dexie'
import type {
  BaremeRate, BaremeYear, ExportRecord, FiscalYear, Place, Trip, TripEvent, TripExpense, Vehicle,
} from '../domain/types'

// Champs locaux : _rev = compteur d'écritures locales ; _dirty =
//   0 : identique au serveur ;
//   1 : à pousser vers Supabase ;
//   2 : mise à l'écart — refusée par le verrou métier (P0001) alors que le serveur n'a jamais eu
//       cette ligne. Conservée sur l'appareil (jamais supprimée en silence) mais ni renvoyée, ni
//       comptée en attente, ni prise en compte dans les calculs ; « Réessayer » dans Réglages.
export const MISE_A_L_ECART = 2
export interface LocalMeta {
  _dirty: 0 | 1 | typeof MISE_A_L_ECART
  _rev: number
}
export type Local<T> = T & LocalMeta

// Ordre de poussée = ordre des clés étrangères.
export const SYNC_TABLES = ['places', 'vehicles', 'bareme_years', 'bareme_rates', 'fiscal_years', 'trips', 'trip_expenses'] as const
export const PULL_TABLES = [...SYNC_TABLES, 'exports', 'trip_events'] as const
export type SyncTableName = (typeof SYNC_TABLES)[number]
export type PullTableName = (typeof PULL_TABLES)[number]

export interface RowOf {
  places: Place
  vehicles: Vehicle
  bareme_years: BaremeYear
  bareme_rates: BaremeRate
  fiscal_years: FiscalYear
  trips: Trip
  trip_expenses: TripExpense
  exports: ExportRecord
  trip_events: TripEvent
}

export interface MetaRow {
  key: string
  value: string
}

export class CarnetDB extends Dexie {
  // « declare » : pas de champ initialisé qui écraserait les tables créées par Dexie.
  declare places: EntityTable<Local<Place>, 'id'>
  declare vehicles: EntityTable<Local<Vehicle>, 'id'>
  declare bareme_years: EntityTable<Local<BaremeYear>, 'id'>
  declare bareme_rates: EntityTable<Local<BaremeRate>, 'id'>
  declare fiscal_years: EntityTable<Local<FiscalYear>, 'id'>
  declare trips: EntityTable<Local<Trip>, 'id'>
  declare trip_expenses: EntityTable<Local<TripExpense>, 'id'>
  declare exports: EntityTable<Local<ExportRecord>, 'id'>
  declare trip_events: EntityTable<Local<TripEvent>, 'id'>
  declare meta: EntityTable<MetaRow, 'key'>

  constructor(name = 'carnet-de-bord') {
    super(name)
    this.version(1).stores({
      places: 'id, _dirty, role',
      vehicles: 'id, _dirty',
      bareme_years: 'id, _dirty, annee',
      bareme_rates: 'id, _dirty, annee',
      fiscal_years: 'id, _dirty',
      trips: 'id, _dirty, date, export_id',
      trip_expenses: 'id, _dirty, trip_id',
      exports: 'id, _dirty',
      trip_events: 'id, _dirty, trip_id',
      meta: 'key',
    })
  }
}

export const db = new CarnetDB()

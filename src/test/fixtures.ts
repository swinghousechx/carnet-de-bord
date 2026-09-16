import { buildBaremeRows, DEFAULT_RATES } from '../domain/default-bareme'
import type { ExportRecord, FiscalYear, Place, Trip, TripExpense, Vehicle } from '../domain/types'

const T0 = '2026-01-01T00:00:00.000Z'
let seq = 0
const id = (prefix: string) => `${prefix}-${++seq}`
const base = (prefix: string) => ({ id: id(prefix), created_at: T0, updated_at: T0, deleted_at: null })

export function makeVehicle(o: Partial<Vehicle> = {}): Vehicle {
  return { ...base('veh'), nom: 'Voiture actuelle', immatriculation: 'AA-123-BB', cv: 5, energie: 'thermique', date_debut: '2020-01-01', date_fin: null, ...o }
}

export function makePlace(o: Partial<Place> = {}): Place {
  return { ...base('place'), label: 'Lieu', adresse: 'Adresse', google_place_id: 'gp', lat: 45.9, lng: 6.8, role: null, last_used_at: null, ...o }
}

export function makeTrip(o: Partial<Trip> = {}): Trip {
  return {
    ...base('trip'),
    date: '2026-09-15',
    activite: 'swing_house',
    motif: 'Rendez-vous fournisseur matériel TrackMan',
    depart_place_id: 'p-dom',
    depart_label: 'Domicile',
    depart_adresse: 'Servoz',
    arrivee_place_id: 'p-client',
    arrivee_label: 'Client',
    arrivee_adresse: 'Chamonix',
    km_route: 10,
    km_saisi: null,
    justif_km: null,
    aller_retour: false,
    km_total: 10,
    vehicle_id: 'veh-A',
    nature: 'pro',
    statut: 'valide',
    brouillon_force: false,
    doublon_confirme: false,
    montant_bareme: 0,
    export_id: null,
    ...o,
  }
}

export function makeFiscalYear(o: Partial<FiscalYear> = {}): FiscalYear {
  return { ...base('fy'), annee: 2026, activite: 'swing_house', mode: 'bareme', inclure_domicile_travail: false, ...o }
}

export function makeExpense(o: Partial<TripExpense> = {}): TripExpense {
  return { ...base('exp'), trip_id: 'trip-x', type: 'peage', montant: 5, note: '', ...o }
}

export function makeExport(o: Partial<ExportRecord> = {}): ExportRecord {
  return {
    ...base('export'),
    activite: 'swing_house',
    mois: '2026-09',
    version: 1,
    statut: 'emis',
    bareme_annee: 2026,
    bareme_provisoire: false,
    totaux: { km: 0, bareme: 0, frais: 0, total: 0, nb_trajets: 0 },
    trip_ids: [],
    ...o,
  }
}

export function defaultBareme() {
  return buildBaremeRows(2026, 0.2, 'test', DEFAULT_RATES)
}

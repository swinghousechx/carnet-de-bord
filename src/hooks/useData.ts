import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { MISE_A_L_ECART, type CarnetDB } from '../db/db'
import { db } from '../db/db'
import { computeAll, type CalcData, type TripCalc } from '../domain/chain'
import { effectiveStatut } from '../domain/rules'
import type { ExportRecord, Place } from '../domain/types'

export interface AppData extends CalcData {
  places: Place[]
  exports: ExportRecord[]
}

const alive = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at)

// Un seul instantané de toutes les données (petites : un utilisateur), lues directement dans
// Dexie. Partagé entre `useData` (rejoué à chaque écriture locale via useLiveQuery) et tout appel
// ponctuel qui a besoin des données les plus fraîches à un instant précis (ex. juste avant de
// verrouiller un export, après une synchro : voir doExport dans Recap.tsx).
export async function loadAppData(database: CarnetDB): Promise<AppData> {
  // Lignes mises à l'écart (refus définitif du serveur, voir db.ts) : ignorées dans les calculs,
  // pour que l'appareil calcule sur les mêmes données que celles que le serveur verrouillera.
  const kept = <T extends { _dirty: number }>(rows: T[]) => rows.filter((r) => r._dirty !== MISE_A_L_ECART)
  const [trips, expenses, vehicles, fiscalYears, baremeYears, rates, places, exports] = await Promise.all([
    database.trips.toArray().then(kept),
    database.trip_expenses.toArray().then(kept),
    database.vehicles.toArray().then(kept),
    database.fiscal_years.toArray().then(kept),
    database.bareme_years.toArray().then(kept),
    database.bareme_rates.toArray().then(kept),
    database.places.toArray().then(kept),
    database.exports.toArray(),
  ])
  const ctx = { vehicles: alive(vehicles), places: alive(places) }
  return {
    // Statut effectif (voir effectiveStatut) : tout l'écran et l'export voient le même statut.
    trips: alive(trips).map((t) => {
      const statut = effectiveStatut(t, ctx)
      return statut === t.statut ? t : { ...t, statut }
    }),
    expenses: alive(expenses),
    vehicles: alive(vehicles),
    fiscalYears: alive(fiscalYears),
    baremeYears: alive(baremeYears),
    rates: alive(rates),
    places: alive(places),
    exports: alive(exports),
  }
}

// Toutes les données + calculs, recalculés à chaque écriture locale.
export function useData(): { data: AppData; calc: Map<string, TripCalc> } | undefined {
  const data = useLiveQuery(() => loadAppData(db), [])
  const calc = useMemo(() => (data ? computeAll(data) : undefined), [data])
  return data && calc ? { data, calc } : undefined
}

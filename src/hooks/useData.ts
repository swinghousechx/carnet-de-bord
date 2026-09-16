import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../db/db'
import { computeAll, type CalcData, type TripCalc } from '../domain/chain'
import type { ExportRecord, Place } from '../domain/types'

export interface AppData extends CalcData {
  places: Place[]
  exports: ExportRecord[]
}

const alive = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at)

// Toutes les données (petites : un utilisateur) + calculs, recalculés à chaque écriture locale.
export function useData(): { data: AppData; calc: Map<string, TripCalc> } | undefined {
  const data = useLiveQuery(async (): Promise<AppData> => {
    const [trips, expenses, vehicles, fiscalYears, baremeYears, rates, places, exports] = await Promise.all([
      db.trips.toArray(),
      db.trip_expenses.toArray(),
      db.vehicles.toArray(),
      db.fiscal_years.toArray(),
      db.bareme_years.toArray(),
      db.bareme_rates.toArray(),
      db.places.toArray(),
      db.exports.toArray(),
    ])
    return {
      trips: alive(trips),
      expenses: alive(expenses),
      vehicles: alive(vehicles),
      fiscalYears: alive(fiscalYears),
      baremeYears: alive(baremeYears),
      rates: alive(rates),
      places: alive(places),
      exports: alive(exports),
    }
  }, [])
  const calc = useMemo(() => (data ? computeAll(data) : undefined), [data])
  return data && calc ? { data, calc } : undefined
}

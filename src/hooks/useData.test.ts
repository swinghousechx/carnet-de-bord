import { beforeEach, describe, expect, it } from 'vitest'
import { prepareExport } from '../app/exportFlow'
import { CarnetDB } from '../db/db'
import { saveRow } from '../db/repo'
import { computeAll } from '../domain/chain'
import { defaultBareme, makeTrip, makeVehicle } from '../test/fixtures'
import { loadAppData } from './useData'

let db: CarnetDB
beforeEach(() => {
  db = new CarnetDB(`test-${crypto.randomUUID()}`)
})

describe('loadAppData', () => {
  it('un trajet « valide » rattaché à un autre véhicule que celui de sa date est chargé en brouillon et n’est pas exportable', async () => {
    const { year, rates } = defaultBareme()
    const ancienne = makeVehicle({ id: 'veh-A', date_debut: '2020-01-01', date_fin: '2026-09-14' })
    const nouvelle = makeVehicle({ id: 'veh-B', cv: 7, date_debut: '2026-09-15' })
    for (const v of [ancienne, nouvelle]) await saveRow(db, 'vehicles', v)
    await saveRow(db, 'bareme_years', year)
    for (const r of rates) await saveRow(db, 'bareme_rates', r)
    // Cas du bug de synchro : trajet du 20 sept. remis sur l'ancien véhicule, statut resté « valide ».
    const remis = makeTrip({ date: '2026-09-20', vehicle_id: 'veh-A', statut: 'valide', km_total: 100 })
    const bon = makeTrip({ date: '2026-09-21', vehicle_id: 'veh-B', statut: 'valide', km_total: 100 })
    await saveRow(db, 'trips', remis)
    await saveRow(db, 'trips', bon)

    const app = await loadAppData(db)
    expect(app.trips.find((t) => t.id === remis.id)?.statut).toBe('brouillon')
    expect(app.trips.find((t) => t.id === bon.id)?.statut).toBe('valide')

    const p = prepareExport(app, computeAll(app), 'swing_house', '2026-09', 'x')
    expect(p.prepared?.payload.map((l) => l.id)).toEqual([bon.id])
    expect(p.drafts.map((t) => t.id)).toEqual([remis.id])
  })
})

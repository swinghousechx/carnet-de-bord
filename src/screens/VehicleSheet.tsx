import { useState } from 'react'
import { dayBefore, overlaps, tripsToReassign, vehicleToClose } from '../app/vehicles'
import { db } from '../db/db'
import { newRow, saveRow, saveRows, softDelete } from '../db/repo'
import type { Energie, Vehicle } from '../domain/types'
import type { AppData } from '../hooks/useData'
import { todayISO } from '../lib/dates'
import { formatDateCourte, nb } from '../lib/format'
import { TextRow } from '../ui/Field'
import { Row, Section } from '../ui/List'
import { Segmented } from '../ui/Segmented'
import { Sheet } from '../ui/Sheet'

export interface VehicleSheetProps {
  data: AppData
  vehicleId?: string
  onClose: () => void
}

export default function VehicleSheet({ data, vehicleId, onClose }: VehicleSheetProps) {
  const existing = data.vehicles.find((v) => v.id === vehicleId)
  const [nom, setNom] = useState(existing?.nom ?? '')
  const [immat, setImmat] = useState(existing?.immatriculation ?? '')
  const [cv, setCv] = useState(existing ? String(existing.cv) : '')
  const [energie, setEnergie] = useState<Energie>(existing?.energie ?? 'thermique')
  const [debut, setDebut] = useState(existing?.date_debut ?? todayISO())
  const [fin, setFin] = useState(existing?.date_fin ?? '')
  const [error, setError] = useState<string | null>(null)

  const cvNum = Number(cv)
  const others = data.vehicles.filter((v) => v.id !== vehicleId)
  // Nouveau véhicule sans date de fin (il devient le véhicule actuel) : l'actuel (sans date de
  // fin, plus ancien) est clôturé la veille automatiquement.
  const aCloturer = !existing ? vehicleToClose(others, debut, fin || null) : undefined
  const nbTrajets = existing ? data.trips.filter((t) => t.vehicle_id === existing.id).length : 0

  async function save() {
    if (!nom.trim() || !Number.isInteger(cvNum) || cvNum < 1 || cvNum > 50) return setError('Nom et puissance fiscale (1 à 50 CV) obligatoires.')
    if (fin && fin < debut) return setError('La date de fin précède la date de début.')
    const clotures = aCloturer ? [{ ...aCloturer, date_fin: dayBefore(debut) }] : []
    const period = { date_debut: debut, date_fin: fin || null }
    const autres = others.map((v) => clotures.find((c) => c.id === v.id) ?? v)
    const conflit = autres.find((v) => overlaps(v, period))
    if (conflit) return setError(`Chevauche la période de « ${conflit.nom} ».`)

    const fields = { nom: nom.trim(), immatriculation: immat.trim(), cv: cvNum, energie, ...period }
    const vehicle: Vehicle = existing ? { ...existing, ...fields } : newRow<Vehicle>(fields)
    if (clotures.length) await saveRows(db, 'vehicles', clotures)
    await saveRow(db, 'vehicles', vehicle)
    const vehicles = [...autres, vehicle]
    const reassign = tripsToReassign(data.trips, vehicles, data.places)
    if (reassign.length) await saveRows(db, 'trips', reassign)
    onClose()
  }

  async function remove() {
    if (!existing || nbTrajets > 0) return
    await softDelete(db, 'vehicles', existing.id)
    onClose()
  }

  return (
    <Sheet open title={existing ? 'Véhicule' : 'Nouveau véhicule'} onCancel={onClose} onConfirm={() => void save()} confirmLabel="Enregistrer">
      <Section footer={error && <span className="text-red">{error}</span>}>
        <TextRow label="Nom" value={nom} onChange={setNom} placeholder="Ex. Golf" />
        <TextRow label="Immatriculation" value={immat} onChange={setImmat} placeholder="AB-123-CD" />
        <TextRow label="Puissance (CV)" value={cv} onChange={setCv} inputMode="numeric" placeholder="5" />
        <div className="px-4 py-2">
          <Segmented
            value={energie}
            onChange={setEnergie}
            options={[
              { value: 'thermique', label: 'Thermique / hybride' },
              { value: 'electrique', label: 'Électrique' },
            ]}
          />
        </div>
      </Section>
      <Section
        header="Période d’utilisation"
        footer={
          aCloturer
            ? `« ${aCloturer.nom} » sera clôturé le ${formatDateCourte(dayBefore(debut))}.`
            : fin
              ? undefined
              : 'Date de fin vide = véhicule actuel.'
        }
      >
        <TextRow label="Début" value={debut} onChange={setDebut} type="date" />
        <TextRow label="Fin" value={fin} onChange={setFin} type="date" />
      </Section>
      {existing && (
        <Section footer={nbTrajets > 0 ? `Utilisé par ${nb(nbTrajets, 'trajet')} : suppression impossible.` : undefined}>
          <Row label="Supprimer le véhicule" tone={nbTrajets > 0 ? 'default' : 'destructive'} onClick={nbTrajets > 0 ? undefined : () => void remove()} />
        </Section>
      )}
    </Sheet>
  )
}

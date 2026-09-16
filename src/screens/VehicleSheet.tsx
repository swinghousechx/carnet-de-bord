import type { AppData } from '../hooks/useData'
import { Sheet } from '../ui/Sheet'

export interface VehicleSheetProps {
  data: AppData
  vehicleId?: string
  onClose: () => void
}

export default function VehicleSheet({ onClose }: VehicleSheetProps) {
  return <Sheet open title="Véhicule" onCancel={onClose}>{null}</Sheet>
}

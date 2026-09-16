import type { TripCalc } from '../domain/chain'
import type { Trip } from '../domain/types'
import type { AppData } from '../hooks/useData'
import { Sheet } from '../ui/Sheet'

export interface TripSheetProps {
  data: AppData
  calc: Map<string, TripCalc>
  tripId?: string
  prefill?: Partial<Trip>
  onClose: () => void
  onNext: (prefill: Partial<Trip>) => void
}

export default function TripSheet({ onClose }: TripSheetProps) {
  return <Sheet open title="Trajet" onCancel={onClose}>{null}</Sheet>
}

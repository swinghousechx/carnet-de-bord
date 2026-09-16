import type { AppData } from '../hooks/useData'
import { Sheet } from '../ui/Sheet'

export interface BaremeSheetProps {
  data: AppData
  annee: number
  onClose: () => void
}

export default function BaremeSheet({ onClose }: BaremeSheetProps) {
  return <Sheet open title="Barème" onCancel={onClose}>{null}</Sheet>
}

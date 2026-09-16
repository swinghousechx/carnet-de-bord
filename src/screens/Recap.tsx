import type { TripCalc } from '../domain/chain'
import type { AppData } from '../hooks/useData'
import { LargeTitle } from '../ui/NavBar'

export interface RecapProps {
  data: AppData
  calc: Map<string, TripCalc>
  onOpenTrip: (id: string) => void
}

export default function Recap(_props: RecapProps) {
  return <LargeTitle title="Récap" />
}

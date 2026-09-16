import type { AppData } from '../hooks/useData'
import { LargeTitle } from '../ui/NavBar'

export interface SettingsProps {
  data: AppData
  onOpenVehicle: (id?: string) => void
  onOpenBareme: (annee: number) => void
}

export default function Settings(_props: SettingsProps) {
  return <LargeTitle title="Réglages" />
}

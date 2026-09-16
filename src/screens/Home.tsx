import type { AppData } from '../hooks/useData'
import { LargeTitle } from '../ui/NavBar'
import type { Tab } from '../ui/TabBar'

export interface HomeProps {
  data: AppData
  onOpenTrip: (id?: string) => void
  onGoto: (t: Tab) => void
}

export default function Home(_props: HomeProps) {
  return <LargeTitle title="Trajets" />
}

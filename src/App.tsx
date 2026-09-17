import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from './app/supabase'
import { syncEngine } from './app/sync'
import type { Trip } from './domain/types'
import { useData } from './hooks/useData'
import BaremeSheet from './screens/BaremeSheet'
import Home from './screens/Home'
import Login from './screens/Login'
import Recap from './screens/Recap'
import Settings from './screens/Settings'
import TripSheet from './screens/TripSheet'
import VehicleSheet from './screens/VehicleSheet'
import { TabBar, type Tab } from './ui/TabBar'

export type SheetState =
  | { kind: 'trip'; nonce: number; tripId?: string; prefill?: Partial<Trip> }
  | { kind: 'vehicle'; vehicleId?: string }
  | { kind: 'bareme'; annee: number }
  | null

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('home')
  const [sheet, setSheet] = useState<SheetState>(null)
  const loaded = useData()

  useEffect(() => {
    void navigator.storage?.persist?.()
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session && syncEngine) return syncEngine.start()
  }, [session])

  if (!supabase) {
    return (
      <main className="min-h-full bg-bg px-8 pt-24 text-center text-[15px] text-label2">
        Configuration manquante : variables VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.
      </main>
    )
  }
  if (session === undefined || !loaded) return <div className="min-h-full bg-bg" />
  if (!session) return <Login />

  const { data, calc } = loaded
  const openTrip = (tripId?: string, prefill?: Partial<Trip>) => setSheet({ kind: 'trip', nonce: Date.now(), tripId, prefill })

  return (
    <div className="min-h-full bg-bg pb-[calc(env(safe-area-inset-bottom)+72px)]">
      {tab === 'home' && <Home data={data} onOpenTrip={(id) => openTrip(id)} onGoto={setTab} />}
      {tab === 'recap' && <Recap data={data} calc={calc} onOpenTrip={(id) => openTrip(id)} />}
      {tab === 'settings' && (
        <Settings
          data={data}
          calc={calc}
          onOpenVehicle={(id) => setSheet({ kind: 'vehicle', vehicleId: id })}
          onOpenBareme={(annee) => setSheet({ kind: 'bareme', annee })}
        />
      )}
      <TabBar tab={tab} onChange={setTab} />
      {sheet?.kind === 'trip' && (
        <TripSheet
          key={sheet.nonce}
          data={data}
          calc={calc}
          tripId={sheet.tripId}
          prefill={sheet.prefill}
          onClose={() => setSheet(null)}
          onNext={(prefill) => openTrip(undefined, prefill)}
        />
      )}
      {sheet?.kind === 'vehicle' && <VehicleSheet data={data} vehicleId={sheet.vehicleId} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'bareme' && <BaremeSheet data={data} annee={sheet.annee} onClose={() => setSheet(null)} />}
    </div>
  )
}

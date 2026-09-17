import { useEffect, useState } from 'react'
import { supabase } from '../app/supabase'
import { syncEngine } from '../app/sync'
import { db } from '../db/db'
import { newRow, retryQuarantined, saveRow, saveRows } from '../db/repo'
import { selectRateSet } from '../domain/bareme'
import type { TripCalc } from '../domain/chain'
import { fiscalSettings } from '../domain/rules'
import { ACTIVITES, ACTIVITE_LABEL, ROLE_LABEL, type Activite, type FiscalYear, type ModeFiscal, type Place, type PlaceRole } from '../domain/types'
import type { AppData } from '../hooks/useData'
import { useSyncState } from '../hooks/useSyncState'
import { todayISO, yearOf } from '../lib/dates'
import { formatDateCourte, nb } from '../lib/format'
import { ActionSheet } from '../ui/ActionSheet'
import { Banner } from '../ui/Banner'
import { Row, Section } from '../ui/List'
import { LargeTitle } from '../ui/NavBar'
import { Segmented } from '../ui/Segmented'
import { Toggle } from '../ui/Toggle'
import PlacePicker from './PlacePicker'

export interface SettingsProps {
  data: AppData
  calc: Map<string, TripCalc>
  onOpenVehicle: (id?: string) => void
  onOpenBareme: (annee: number) => void
}

const ROLES: PlaceRole[] = ['domicile', 'swing_house', 'lmnp']
const BAREME_SECTION_ID = 'reglages-bareme'

export default function Settings({ data, calc, onOpenVehicle, onOpenBareme }: SettingsProps) {
  const sync = useSyncState()
  const courante = yearOf(todayISO())
  const [annee, setAnnee] = useState(courante)
  const [pickRole, setPickRole] = useState<PlaceRole | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [logout, setLogout] = useState(false)

  useEffect(() => {
    void supabase?.auth.getSession().then(({ data: d }) => setEmail(d.session?.user.email ?? null))
  }, [])

  const verrouille = (a: Activite) => data.trips.some((t) => t.activite === a && t.statut === 'exporte' && yearOf(t.date) === annee)

  // Trajets non exportés dont le montant barème n'a pas pu être calculé (barème manquant ou incomplet).
  const indisponibles = data.trips.filter((t) => t.statut !== 'exporte' && calc.get(t.id)?.bareme_indisponible)

  async function setFiscal(a: Activite, patch: Partial<Pick<FiscalYear, 'mode' | 'inclure_domicile_travail'>>) {
    const row = data.fiscalYears.find((f) => f.annee === annee && f.activite === a)
    const base = row ?? newRow<FiscalYear>({ annee, activite: a, ...fiscalSettings(annee, a, []) })
    await saveRow(db, 'fiscal_years', { ...base, ...patch })
  }

  async function assignRole(role: PlaceRole, place: Place) {
    const clear = data.places.filter((p) => p.role === role && p.id !== place.id).map((p) => ({ ...p, role: null }))
    await saveRows(db, 'places', [...clear, { ...place, role }])
    setPickRole(null)
  }

  function scrollToBareme() {
    document.getElementById(BAREME_SECTION_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const rateSet = selectRateSet(courante, data.baremeYears, data.rates)
  const annees = [...data.baremeYears].sort((a, b) => b.annee - a.annee)
  const prochaine = (annees[0]?.annee ?? courante - 1) + 1
  const etat =
    sync.status === 'syncing' ? 'Synchro…' : sync.status === 'offline' ? 'Hors ligne' : sync.status === 'error' ? 'Erreur' : sync.pending > 0 ? `${sync.pending} en attente` : 'À jour'

  return (
    <>
      <LargeTitle title="Réglages" />

      {indisponibles.length > 0 && (
        <Banner onClick={scrollToBareme}>
          {indisponibles.length === 1
            ? "Barème indisponible pour 1 trajet : complète le barème correspondant."
            : `Barème indisponible pour ${indisponibles.length} trajets : complète le barème correspondant.`}
        </Banner>
      )}

      <Section header="Véhicules" footer="Chaque trajet garde le véhicule actif à sa date.">
        {data.vehicles
          .slice()
          .sort((a, b) => b.date_debut.localeCompare(a.date_debut))
          .map((v) => (
            <Row
              key={v.id}
              label={v.nom}
              detail={`${v.immatriculation || 'Sans immatriculation'} · ${v.cv} CV · ${v.energie === 'electrique' ? 'électrique' : 'thermique'}`}
              value={v.date_fin ? `${formatDateCourte(v.date_debut)} → ${formatDateCourte(v.date_fin)}` : `depuis ${formatDateCourte(v.date_debut)}`}
              onClick={() => onOpenVehicle(v.id)}
              chevron
            />
          ))}
        <Row label="Ajouter un véhicule" tone="accent" onClick={() => onOpenVehicle()} />
      </Section>

      <Section header="Lieux favoris">
        {ROLES.map((r) => {
          const p = data.places.find((x) => x.role === r)
          return <Row key={r} label={ROLE_LABEL[r]} detail={p ? p.adresse : 'À définir'} onClick={() => setPickRole(r)} chevron />
        })}
      </Section>

      <div className="mx-4 mb-2">
        <Segmented
          value={String(annee)}
          onChange={(v) => setAnnee(Number(v))}
          options={[courante - 1, courante, courante + 1].map((y) => ({ value: String(y), label: String(y) }))}
        />
      </div>
      <Section
        header={`Choix fiscal ${annee}`}
        footer="Le mode s’applique à tous les véhicules de l’année. Domicile–travail : exclu par défaut, à valider avec le comptable. Verrouillé dès le premier export de l’année."
      >
        {ACTIVITES.map((a) => {
          const s = fiscalSettings(annee, a, data.fiscalYears)
          const lock = verrouille(a)
          return (
            <div key={a} className="space-y-3 px-4 py-3">
              <div className="flex items-center justify-between">
                <span>{ACTIVITE_LABEL[a]}</span>
                {lock && <span className="text-[13px] text-label2">Verrouillé</span>}
              </div>
              <div className={lock ? 'pointer-events-none opacity-40' : ''}>
                <Segmented<ModeFiscal>
                  value={s.mode}
                  onChange={(mode) => void setFiscal(a, { mode })}
                  options={[
                    { value: 'bareme', label: 'Barème km' },
                    { value: 'frais_reels', label: 'Frais réels' },
                  ]}
                />
              </div>
              {a === 'swing_house' && (
                <div className={`flex items-center justify-between ${lock ? 'pointer-events-none opacity-40' : ''}`}>
                  <span className="text-[15px]">Inclure domicile–travail</span>
                  <Toggle label="Inclure domicile–travail" checked={s.inclure_domicile_travail} onChange={(v) => void setFiscal(a, { inclure_domicile_travail: v })} />
                </div>
              )}
            </div>
          )
        })}
      </Section>

      <div id={BAREME_SECTION_ID}>
        <Section
          header="Barème kilométrique"
          footer={rateSet?.provisoire ? `Barème ${courante} absent : le barème ${rateSet.annee} est appliqué à titre provisoire.` : undefined}
        >
          {annees.map((y) => (
            <Row key={y.id} label={`Barème ${y.annee}`} detail={y.source || undefined} onClick={() => onOpenBareme(y.annee)} chevron />
          ))}
          <Row label={`Ajouter le barème ${prochaine}`} tone="accent" onClick={() => onOpenBareme(prochaine)} />
        </Section>
      </div>

      <Section header="Synchronisation" footer={sync.message ?? (sync.lastSync ? `Dernière synchro : ${new Date(sync.lastSync).toLocaleString('fr-FR')}` : undefined)}>
        <Row label="État" value={etat} />
        {sync.quarantined > 0 && (
          <Row
            label={<span className="text-red">Réessayer l’envoi des modifications refusées</span>}
            value={sync.quarantined}
            onClick={() => void retryQuarantined(db).then(() => syncEngine?.syncNow())}
          />
        )}
        <Row label="Synchroniser maintenant" tone="accent" onClick={() => void syncEngine?.syncNow()} />
      </Section>

      <Section header="Compte">
        <Row label={email ?? '—'} />
        <Row label="Se déconnecter" tone="destructive" onClick={() => setLogout(true)} />
      </Section>

      {pickRole && (
        <PlacePicker
          open
          title={ROLE_LABEL[pickRole]}
          places={data.places}
          onPick={(p) => void assignRole(pickRole, p)}
          onCancel={() => setPickRole(null)}
        />
      )}
      <ActionSheet
        open={logout}
        title="Se déconnecter ?"
        message={sync.pending > 0 ? `${nb(sync.pending, 'modification pas encore synchronisée', 'modifications pas encore synchronisées')} : ${sync.pending > 1 ? 'elles restent' : 'elle reste'} sur ce téléphone.` : undefined}
        actions={[{ label: 'Se déconnecter', tone: 'destructive', onClick: () => void supabase?.auth.signOut().then(() => setLogout(false)) }]}
        onCancel={() => setLogout(false)}
      />
    </>
  )
}

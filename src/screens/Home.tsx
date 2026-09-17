import { useMemo } from 'react'
import { homeSummary } from '../app/home'
import { ACTIVITES, ACTIVITE_LABEL, type Trip } from '../domain/types'
import type { AppData } from '../hooks/useData'
import { prevMonth, todayISO } from '../lib/dates'
import { formatJour, formatKm, formatMoisLong } from '../lib/format'
import { ActivityDot } from '../ui/ActivityDot'
import { Banner } from '../ui/Banner'
import { IconLock, IconPlus } from '../ui/icons'
import { Row, Section } from '../ui/List'
import { LargeTitle, NavButton } from '../ui/NavBar'
import { SyncBadge } from '../ui/SyncBadge'
import type { Tab } from '../ui/TabBar'

export interface HomeProps {
  data: AppData
  onOpenTrip: (id?: string) => void
  onGoto: (t: Tab) => void
}

function statusValue(t: Trip) {
  if (t.statut === 'brouillon') return <span className="text-orange">Brouillon</span>
  if (t.statut === 'exporte')
    return (
      <span className="inline-flex items-center gap-1">
        {formatKm(t.km_total)}
        <IconLock className="size-3.5" />
      </span>
    )
  return formatKm(t.km_total)
}

export default function Home({ data, onOpenTrip, onGoto }: HomeProps) {
  const today = todayISO()
  // Recalculée seulement quand `data` change (nouvelle référence à chaque écriture Dexie) ou que
  // le jour change ; pas d'appel réseau ici, homeSummary est un pur calcul sur les données locales.
  const s = useMemo(() => homeSummary(data, today), [data, today])
  return (
    <>
      <LargeTitle
        title="Trajets"
        subtitle={formatMoisLong(s.mois)}
        right={
          <>
            <SyncBadge />
            <NavButton onClick={() => onOpenTrip()} label="Nouveau trajet">
              <IconPlus />
            </NavButton>
          </>
        }
      />
      {s.aConfigurer && <Banner onClick={() => onGoto('settings')}>Renseigner le véhicule et le domicile</Banner>}
      {s.nonExportes.length > 0 && (
        <Banner onClick={() => onGoto('recap')}>
          {formatMoisLong(prevMonth(s.mois))} pas encore exporté : {s.nonExportes.map((a) => ACTIVITE_LABEL[a]).join(', ')}
        </Banner>
      )}
      <Section footer={s.brouillons > 0 ? `${s.brouillons} brouillon(s) à compléter.` : undefined}>
        {ACTIVITES.map((a) => (
          <Row
            key={a}
            leading={<ActivityDot activite={a} />}
            label={ACTIVITE_LABEL[a]}
            detail={`${s.parActivite[a].nb} trajet(s)`}
            value={formatKm(s.parActivite[a].km)}
          />
        ))}
      </Section>
      {s.brouillonsAnciens.length > 0 && (
        <Section header="Brouillons à terminer">
          {s.brouillonsAnciens.map((t) => (
            <Row
              key={t.id}
              leading={<ActivityDot activite={t.activite} />}
              label={t.motif || 'Sans motif'}
              detail={`${t.depart_label} → ${t.arrivee_label}${t.aller_retour ? ' · aller-retour' : ''}`}
              value={statusValue(t)}
              onClick={() => onOpenTrip(t.id)}
              chevron
            />
          ))}
        </Section>
      )}
      {s.jours.map(([date, trips]) => (
        <Section key={date} header={formatJour(date)}>
          {trips.map((t) => (
            <Row
              key={t.id}
              leading={<ActivityDot activite={t.activite} />}
              label={t.motif || 'Sans motif'}
              detail={`${t.depart_label} → ${t.arrivee_label}${t.aller_retour ? ' · aller-retour' : ''}`}
              value={statusValue(t)}
              onClick={() => onOpenTrip(t.id)}
              chevron
            />
          ))}
        </Section>
      ))}
      {s.jours.length === 0 && <p className="px-8 pt-6 text-center text-[15px] text-label2">Aucun trajet ce mois-ci. Touche + pour en ajouter un.</p>}
    </>
  )
}

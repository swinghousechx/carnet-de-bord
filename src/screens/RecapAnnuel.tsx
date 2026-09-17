import { useMemo, useState, type ReactNode } from 'react'
import { annualButtonLabel, annualCardStatus, prepareAnnual } from '../app/annualFlow'
import { modeNote, NEGATIF_AVERTISSEMENT, TOTAL_NATURE, TOTAL_TITRE } from '../app/exportFlow'
import type { TripCalc } from '../domain/chain'
import { ACTIVITES, ACTIVITE_LABEL } from '../domain/types'
import { annualShareTitle } from '../export/annual'
import { FRAIS_NON_INCLUS } from '../export/build'
import { makeAnnualFiles, shareOrDownload } from '../export/share'
import type { AppData } from '../hooks/useData'
import { nowISO, todayISO, yearOf } from '../lib/dates'
import { formatEuro, formatKm, nb } from '../lib/format'
import { ActionSheet } from '../ui/ActionSheet'
import { ActivityDot } from '../ui/ActivityDot'
import { Banner } from '../ui/Banner'
import { PrimaryButton } from '../ui/Button'
import { IconChevron } from '../ui/icons'
import { FootNote, Row, Section } from '../ui/List'
import { LargeTitle, NavButton } from '../ui/NavBar'
import type { Tab } from '../ui/TabBar'
import { RefusBanner } from './RefusBanner'

export interface RecapAnnuelProps {
  data: AppData
  calc: Map<string, TripCalc>
  vueSwitch: ReactNode
  onGoto: (t: Tab) => void
}

// Vue « Année » du Récap : synthèse par activité (jamais additionnées), export non verrouillant.
export default function RecapAnnuel({ data, calc, vueSwitch, onGoto }: RecapAnnuelProps) {
  const [annee, setAnnee] = useState(() => yearOf(todayISO()))
  const [ready, setReady] = useState<{ files: File[]; title: string } | null>(null)

  // Aperçu des cartes : la date de génération n'y est pas affichée. Le fichier, lui, est reconstruit
  // au tap avec un horodatage frais (comme la note mensuelle).
  const cards = useMemo(() => ACTIVITES.map((a) => prepareAnnual(data, calc, a, annee, '')), [data, calc, annee])

  return (
    <>
      <LargeTitle
        title="Récap"
        subtitle={`Année ${annee}`}
        right={
          <>
            <NavButton onClick={() => setAnnee(annee - 1)} label="Année précédente">
              <IconChevron className="size-5 rotate-180" />
            </NavButton>
            <NavButton onClick={() => setAnnee(annee + 1)} label="Année suivante">
              <IconChevron className="size-5" />
            </NavButton>
          </>
        }
      />
      {vueSwitch}
      <RefusBanner onGoto={onGoto} />

      {cards.map((d) => {
        const statut = annualCardStatus(d)
        const vide = d.lignes.length === 0 && d.pourMemoire.length === 0
        return (
          <div key={d.activite}>
            <Section
              header={
                <span className="inline-flex items-center gap-2">
                  <ActivityDot activite={d.activite} />
                  {ACTIVITE_LABEL[d.activite]}
                </span>
              }
              footer={
                [
                  d.pourMemoire.length ? `${nb(d.pourMemoire.length, 'trajet domicile–travail pour mémoire, non compté', 'trajets domicile–travail pour mémoire, non comptés')}.` : '',
                  modeNote(d) ?? '',
                ].filter(Boolean).join(' ') || undefined
              }
            >
              <Row label="Trajets" value={d.totaux.nb_trajets} />
              <Row label="Distance" value={formatKm(d.totaux.km)} />
              <Row
                label={<span className="font-semibold">{TOTAL_TITRE}</span>}
                detail={TOTAL_NATURE[d.activite]}
                value={<span className="font-semibold text-label">{formatEuro(d.totaux.indemnite)}</span>}
              />
              {(statut.mois || statut.alertes.length > 0) && (
                <Row
                  label={statut.mois ?? <span className="text-warn">{statut.alertes.join(' · ')}</span>}
                  detail={statut.mois && statut.alertes.length ? <span className="text-warn">{statut.alertes.join(' · ')}</span> : undefined}
                />
              )}
            </Section>
            {d.bareme_indisponible && <Banner>Barème indisponible pour certains trajets non exportés : montants à 0 €.</Banner>}
            {d.montant_negatif && <Banner>{NEGATIF_AVERTISSEMENT}</Banner>}
            <div className="-mt-4 mb-8 px-4">
              <PrimaryButton
                tone="plain"
                disabled={vide}
                // Aucun verrouillage, aucun réseau : fichiers générés localement puis feuille de partage
                // (second tap, iOS n'ouvrant le partage que sur un geste récent).
                onClick={() => {
                  const fichier = prepareAnnual(data, calc, d.activite, annee, nowISO())
                  setReady({ files: makeAnnualFiles(fichier), title: annualShareTitle(fichier) })
                }}
              >
                {annualButtonLabel(annee)}
              </PrimaryButton>
            </div>
          </div>
        )
      })}

      <FootNote>{FRAIS_NON_INCLUS}</FootNote>

      <ActionSheet
        open={ready != null}
        title={ready?.title}
        message={ready?.files.map((f) => f.name).join(' · ')}
        actions={[
          {
            label: 'Partager PDF + CSV',
            bold: true,
            onClick: () => {
              if (ready) void shareOrDownload(ready.files, ready.title).then(() => setReady(null))
            },
          },
        ]}
        onCancel={() => setReady(null)}
      />
    </>
  )
}

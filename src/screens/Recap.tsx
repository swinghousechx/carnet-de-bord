import { useMemo, useState } from 'react'
import { defaultRecapMonth, prepareExport, rebuildExport, runExport, sameExport, type ExportPreview, type PreparedExport } from '../app/exportFlow'
import { supabase } from '../app/supabase'
import { syncEngine } from '../app/sync'
import { db } from '../db/db'
import { computeAll, type TripCalc } from '../domain/chain'
import { ACTIVITES, ACTIVITE_LABEL, type Activite, type ExportRecord, type ExportStatut } from '../domain/types'
import type { ExportData } from '../export/build'
import { makeExportFiles, shareOrDownload } from '../export/share'
import type { AppData } from '../hooks/useData'
import { loadAppData } from '../hooks/useData'
import { nextMonth, nowISO, prevMonth, todayISO } from '../lib/dates'
import { formatDateCourte, formatEuro, formatKm, formatMoisLong, round2 } from '../lib/format'
import { ActionSheet } from '../ui/ActionSheet'
import { ActivityDot } from '../ui/ActivityDot'
import { Banner } from '../ui/Banner'
import { PrimaryButton } from '../ui/Button'
import { IconChevron } from '../ui/icons'
import { Row, Section } from '../ui/List'
import { LargeTitle, NavButton } from '../ui/NavBar'
import type { Tab } from '../ui/TabBar'

export interface RecapProps {
  data: AppData
  calc: Map<string, TripCalc>
  onOpenTrip: (id: string) => void
  onGoto: (t: Tab) => void
}

interface Confirm {
  activite: Activite
  prepared: PreparedExport
  draftsCount: number
  firstDraftId: string | null
}

const STATUT_LABEL: Record<ExportStatut, string> = { emis: 'Émis', a_rectifier: 'À rectifier', remplace: 'Remplacé' }
const TOTAL_LABEL: Record<Activite, string> = { swing_house: 'À te verser', lmnp: 'Charge déductible' }
const ZERO_TOTAUX = { km: 0, bareme: 0, frais: 0, total: 0, nb_trajets: 0 }

export default function Recap({ data, calc, onOpenTrip, onGoto }: RecapProps) {
  const [mois, setMois] = useState(() => defaultRecapMonth(data, todayISO()))
  const [open, setOpen] = useState<Activite | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [ready, setReady] = useState<{ files: File[]; title: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Horodatage d'aperçu (imprimé dans l'ExportData mais pas affiché à l'écran) : mémorisé par
  // (data, mois) uniquement pour que `cards` ci-dessous ne se reconstruise pas à chaque rendu sans
  // rapport (busy, confirm, erreur…) — buildExportData recalcule des cumuls par véhicule pour les
  // deux activités, ce n'est pas gratuit. Ce n'est PAS l'horodatage réellement figé à l'export :
  // celui-ci est régénéré à l'instant du tap (voir le bouton Exporter) puis, une deuxième fois,
  // juste avant l'appel réseau dans doExport, sur les données les plus fraîches après synchro.
  const genereLe = useMemo(() => nowISO(), [data, mois])

  // Un « paquet » par activité : l'aperçu (préparation + éventuel blocage), le dernier export émis
  // pour ce mois s'il existe, et les données d'export à afficher (celles, figées, de l'export émis,
  // reconstruites via rebuildExport ; sinon l'aperçu). Regrouper les trois ici évite de reconstruire
  // rebuildExport (cumuls véhicule inclus) à chaque rendu pour l'activité déjà exportée.
  const cards = useMemo(() => {
    return Object.fromEntries(
      ACTIVITES.map((a) => {
        const preview = prepareExport(data, calc, a, mois, genereLe)
        const emis = data.exports.filter((e) => e.activite === a && e.mois === mois && e.statut === 'emis').sort((x, y) => y.version - x.version)[0]
        const display = emis ? rebuildExport(data, calc, emis) : preview.prepared?.data ?? null
        return [a, { preview, emis, display }]
      }),
    ) as Record<Activite, { preview: ExportPreview; emis: ExportRecord | undefined; display: ExportData | null }>
  }, [data, calc, mois, genereLe])

  const global = round2(ACTIVITES.reduce((s, a) => s + (cards[a].display?.totaux.total ?? ZERO_TOTAUX.total), 0))

  function share(d: ExportData) {
    setReady({ files: makeExportFiles(d), title: `${ACTIVITE_LABEL[d.activite]} — ${formatMoisLong(d.mois)} (v${d.version})` })
  }

  async function doExport() {
    if (!confirm) return
    if (!supabase) {
      setConfirm(null)
      setError('Configuration manquante : impossible de contacter le serveur.')
      return
    }
    const { activite, prepared: confirmed } = confirm
    const confirmedMois = confirmed.data.mois
    setConfirm(null)
    setBusy(true)
    setError(null)

    let result: { id: string; version: number }
    let sent: PreparedExport
    try {
      // Pousse d'abord les trajets en attente, PUIS récupère les écritures distantes : les
      // montants confirmés au tap peuvent être devenus obsolètes (édition sur un autre appareil,
      // chaîne du barème recalculée par un pull). On ne verrouille jamais l'aperçu du tap sans
      // l'avoir revérifié contre les données les plus fraîches juste avant l'appel réseau — et
      // c'est bien cet aperçu revérifié (« fresh »), jamais celui du tap, qui part au serveur.
      await syncEngine?.syncNow()
      const freshData = await loadAppData(db)
      const fresh = prepareExport(freshData, computeAll(freshData), activite, confirmedMois, confirmed.data.genere_le)
      if (fresh.blocked || !fresh.prepared || !sameExport(confirmed, fresh.prepared)) {
        setError(fresh.blocked ?? 'Les données ont changé : vérifie le récap puis relance l’export.')
        setBusy(false)
        return
      }
      sent = fresh.prepared
      result = await runExport(supabase, sent)
      await syncEngine?.syncNow() // récupère les trajets verrouillés et l'export
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : 'Export impossible hors ligne.')
      setBusy(false)
      return
    }

    // Le trajet est désormais verrouillé côté serveur : un échec à partir d'ici (reconstruction ou
    // partage des fichiers) n'est plus un échec d'export, juste un partage à retenter.
    try {
      const after = await loadAppData(db)
      const record = after.exports.find((ex) => ex.id === result.id)
      share(record ? rebuildExport(after, computeAll(after), record) : sent.data)
    } catch {
      setError('Export verrouillé ; fichiers indisponibles, utilise Re-partager.')
    }
    setBusy(false)
  }

  const historique = [...data.exports].sort((a, b) => b.mois.localeCompare(a.mois) || b.version - a.version)

  return (
    <>
      <LargeTitle
        title="Récap"
        subtitle={formatMoisLong(mois)}
        right={
          <>
            <NavButton onClick={() => setMois(prevMonth(mois))} label="Mois précédent">
              <IconChevron className="size-5 rotate-180" />
            </NavButton>
            <NavButton onClick={() => setMois(nextMonth(mois))} label="Mois suivant">
              <IconChevron className="size-5" />
            </NavButton>
          </>
        }
      />

      {ACTIVITES.map((a) => {
        const { preview: p, emis: e, display } = cards[a]
        const bareme_indisponible = !e && display?.bareme_indisponible === true
        const totaux = display?.totaux ?? ZERO_TOTAUX
        const nbPourMemoire = display?.pourMemoire.length ?? 0
        const rattrapages = display?.lignes.filter((l) => l.rattrapage).length ?? 0
        const trajetRows = display
          ? [
              ...display.lignes.map((l) => ({ ligne: l, pourMemoire: false })),
              ...display.pourMemoire.map((l) => ({ ligne: l, pourMemoire: true })),
            ]
              .map((r) => ({ ...r, trip: data.trips.find((x) => x.id === r.ligne.trip_id) }))
              .filter((r): r is typeof r & { trip: NonNullable<typeof r.trip> } => r.trip != null)
          : []
        return (
          <div key={a}>
            <Section
              header={
                <span className="inline-flex items-center gap-2">
                  <ActivityDot activite={a} />
                  {ACTIVITE_LABEL[a]}
                </span>
              }
              footer={
                e
                  ? `Exporté le ${formatDateCourte(e.created_at.slice(0, 10))} (v${e.version}), trajets verrouillés.`
                  : [
                      display?.version && display.version > 1 ? `Rectificatif : version ${display.version}.` : '',
                      rattrapages ? `${rattrapages} rattrapage(s) de mois antérieurs inclus.` : '',
                      display?.bareme_provisoire ? 'Barème provisoire.' : '',
                    ].filter(Boolean).join(' ') || undefined
              }
            >
              <Row label="Trajets" value={totaux.nb_trajets} />
              <Row label="Distance" value={formatKm(totaux.km)} />
              <Row label="Barème kilométrique" value={formatEuro(totaux.bareme)} />
              <Row label="Péages, parkings" value={formatEuro(totaux.frais)} />
              <Row label={<span className="font-semibold">{TOTAL_LABEL[a]}</span>} value={<span className="font-semibold text-label">{formatEuro(totaux.total)}</span>} />
              {p.drafts.length > 0 && !e && (
                <Row label={<span className="text-orange">{p.drafts.length} brouillon(s) à compléter</span>} onClick={() => onOpenTrip(p.drafts[0].id)} chevron />
              )}
              {trajetRows.length > 0 && (
                <Row
                  label={open === a ? 'Masquer les trajets' : `Voir les ${totaux.nb_trajets} trajet(s)${nbPourMemoire ? ` (+${nbPourMemoire} pour mémoire)` : ''}`}
                  tone="accent"
                  onClick={() => setOpen(open === a ? null : a)}
                />
              )}
              {open === a &&
                trajetRows.map(({ ligne, pourMemoire, trip: x }) => (
                  <Row
                    key={x.id}
                    label={x.motif}
                    detail={`${formatDateCourte(x.date)} · ${formatKm(x.km_total)}${x.nature === 'domicile_travail' ? ' · domicile–travail' : ''}`}
                    value={pourMemoire ? 'Pour mémoire' : formatEuro(ligne.total)}
                    onClick={() => onOpenTrip(x.id)}
                    chevron
                  />
                ))}
            </Section>
            {bareme_indisponible && <Banner onClick={() => onGoto('settings')}>{p.blocked}</Banner>}
            <div className="-mt-4 mb-8 px-4">
              {e ? (
                <PrimaryButton tone="plain" onClick={() => display && share(display)}>
                  Re-partager les fichiers
                </PrimaryButton>
              ) : (
                <PrimaryButton
                  disabled={busy || !p.prepared || p.blocked != null}
                  onClick={() => {
                    if (p.blocked || !p.prepared) return
                    // Aperçu recalculé à l'instant du tap (pas celui, mémorisé, du dernier rendu) :
                    // seul le clic déclenche ce calcul « lourd », et l'horodatage de génération
                    // (imprimé dans le PDF) reste précis même si l'écran est resté ouvert.
                    const fresh = prepareExport(data, calc, a, mois, nowISO())
                    if (!fresh.prepared || fresh.blocked) {
                      setError(fresh.blocked ?? 'Aucun trajet validé à exporter.')
                      return
                    }
                    setConfirm({ activite: a, prepared: fresh.prepared, draftsCount: fresh.drafts.length, firstDraftId: fresh.drafts[0]?.id ?? null })
                  }}
                >
                  {p.blocked ?? `Exporter ${ACTIVITE_LABEL[a]} — ${formatMoisLong(mois)}`}
                </PrimaryButton>
              )}
            </div>
          </div>
        )
      })}

      <Section footer={error && <span className="text-red">{error}</span>}>
        <Row label={<span className="font-semibold">Total global</span>} value={<span className="font-semibold text-label">{formatEuro(global)}</span>} />
      </Section>

      {historique.length > 0 && (
        <Section header="Exports">
          {historique.map((e: ExportRecord) => (
            <Row
              key={e.id}
              label={`${ACTIVITE_LABEL[e.activite]} — ${formatMoisLong(e.mois)}`}
              detail={`v${e.version} · ${STATUT_LABEL[e.statut]} · ${formatDateCourte(e.created_at.slice(0, 10))}`}
              value={formatEuro(e.totaux.total)}
              onClick={e.statut === 'emis' ? () => share(rebuildExport(data, calc, e)) : undefined}
            />
          ))}
        </Section>
      )}

      <ActionSheet
        open={confirm != null}
        title={confirm ? `Exporter ${ACTIVITE_LABEL[confirm.activite]} — ${formatMoisLong(confirm.prepared.data.mois)}` : undefined}
        message={
          confirm
            ? `${confirm.prepared.payload.length} trajet(s) seront verrouillés.` +
              (confirm.draftsCount > 0 ? ` ${confirm.draftsCount} brouillon(s) partiront au prochain export (rattrapage).` : '')
            : undefined
        }
        actions={[
          ...(confirm && confirm.draftsCount > 0 && confirm.firstDraftId
            ? [{ label: 'Compléter d’abord', bold: true, onClick: () => { const id = confirm.firstDraftId!; setConfirm(null); onOpenTrip(id) } }]
            : []),
          { label: confirm && confirm.draftsCount > 0 ? 'Exporter quand même' : 'Exporter et verrouiller', bold: !confirm?.draftsCount, onClick: () => void doExport() },
        ]}
        onCancel={() => setConfirm(null)}
      />
      <ActionSheet
        open={ready != null}
        title={ready?.title}
        message={ready?.files.map((f) => f.name).join(' · ')}
        actions={[
          {
            label: 'Partager PDF + CSV',
            bold: true,
            // Tap direct : iOS n'ouvre la feuille de partage que sur un geste récent.
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

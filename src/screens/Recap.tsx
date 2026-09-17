import { useMemo, useState } from 'react'
import { defaultRecapMonth, prepareExport, rebuildExport, runExport, type ExportPreview, type PreparedExport } from '../app/exportFlow'
import { supabase } from '../app/supabase'
import { syncEngine } from '../app/sync'
import type { TripCalc } from '../domain/chain'
import { ACTIVITES, ACTIVITE_LABEL, type Activite, type ExportRecord, type ExportStatut } from '../domain/types'
import type { ExportData } from '../export/build'
import { makeExportFiles, shareOrDownload } from '../export/share'
import type { AppData } from '../hooks/useData'
import { nextMonth, nowISO, prevMonth, todayISO } from '../lib/dates'
import { formatDateCourte, formatEuro, formatKm, formatMoisLong, round2 } from '../lib/format'
import { ActionSheet } from '../ui/ActionSheet'
import { ActivityDot } from '../ui/ActivityDot'
import { Banner } from '../ui/Banner'
import { PrimaryButton } from '../ui/Button'
import { IconChevron } from '../ui/icons'
import { Row, Section } from '../ui/List'
import { LargeTitle, NavButton } from '../ui/NavBar'

export interface RecapProps {
  data: AppData
  calc: Map<string, TripCalc>
  onOpenTrip: (id: string) => void
}

const STATUT_LABEL: Record<ExportStatut, string> = { emis: 'Émis', a_rectifier: 'À rectifier', remplace: 'Remplacé' }
const TOTAL_LABEL: Record<Activite, string> = { swing_house: 'À te verser', lmnp: 'Charge déductible' }

export default function Recap({ data, calc, onOpenTrip }: RecapProps) {
  const [mois, setMois] = useState(() => defaultRecapMonth(data, todayISO()))
  const [open, setOpen] = useState<Activite | null>(null)
  const [confirm, setConfirm] = useState<{ activite: Activite; prepared: PreparedExport; drafts: number } | null>(null)
  const [ready, setReady] = useState<{ files: File[]; title: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // `data` change de référence à chaque écriture Dexie (voir useData) : mémoriser l'aperçu par
  // (data, mois) évite de reconstruire les exports (buildExportData, cumuls véhicule) à chaque
  // ouverture de feuille ou changement d'état local (busy, confirm, erreur…) sans rapport.
  const genereLe = useMemo(() => nowISO(), [data, mois])
  const previews = useMemo(
    () => Object.fromEntries(ACTIVITES.map((a) => [a, prepareExport(data, calc, a, mois, genereLe)])) as Record<Activite, ExportPreview>,
    [data, calc, mois, genereLe],
  )
  const emis = (a: Activite) =>
    data.exports.filter((e) => e.activite === a && e.mois === mois && e.statut === 'emis').sort((x, y) => y.version - x.version)[0]

  // Totaux affichés : export émis s'il existe, sinon aperçu de ce qui serait exporté (même
  // barème indisponible : les totaux d'aperçu restent parlants, le barème est simplement à 0).
  const totals = (a: Activite) => {
    const e = emis(a)
    if (e) return e.totaux
    return previews[a].prepared?.data.totaux ?? { km: 0, bareme: 0, frais: 0, total: 0, nb_trajets: 0 }
  }
  const global = round2(ACTIVITES.reduce((s, a) => s + totals(a).total, 0))

  function share(d: ExportData) {
    setReady({ files: makeExportFiles(d), title: `${ACTIVITE_LABEL[d.activite]} — ${formatMoisLong(d.mois)} (v${d.version})` })
  }

  async function doExport() {
    if (!confirm || !supabase) return
    const { prepared } = confirm
    setConfirm(null)
    setBusy(true)
    setError(null)
    try {
      await syncEngine?.syncNow() // pousse d'abord les trajets en attente
      await runExport(supabase, prepared)
      await syncEngine?.syncNow() // récupère les trajets verrouillés et l'export
      share(prepared.data)
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : 'Export impossible hors ligne.')
    } finally {
      setBusy(false)
    }
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
        const p = previews[a]
        const t = totals(a)
        const e = emis(a)
        const bareme_indisponible = !e && p.prepared?.data.bareme_indisponible === true
        const trajets = e
          ? data.trips.filter((x) => x.export_id === e.id)
          : p.prepared
            ? [...p.prepared.data.lignes, ...p.prepared.data.pourMemoire].map((l) => data.trips.find((x) => x.id === l.trip_id)!).filter(Boolean)
            : []
        const rattrapages = p.prepared?.data.lignes.filter((l) => l.rattrapage).length ?? 0
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
                      p.prepared?.data.version && p.prepared.data.version > 1 ? `Rectificatif : version ${p.prepared.data.version}.` : '',
                      rattrapages ? `${rattrapages} rattrapage(s) de mois antérieurs inclus.` : '',
                      p.prepared?.data.bareme_provisoire ? 'Barème provisoire.' : '',
                    ].filter(Boolean).join(' ') || undefined
              }
            >
              <Row label="Trajets" value={t.nb_trajets} />
              <Row label="Distance" value={formatKm(t.km)} />
              <Row label="Barème kilométrique" value={formatEuro(t.bareme)} />
              <Row label="Péages, parkings" value={formatEuro(t.frais)} />
              <Row label={<span className="font-semibold">{TOTAL_LABEL[a]}</span>} value={<span className="font-semibold text-label">{formatEuro(t.total)}</span>} />
              {p.drafts.length > 0 && !e && (
                <Row label={<span className="text-orange">{p.drafts.length} brouillon(s) à compléter</span>} onClick={() => onOpenTrip(p.drafts[0].id)} chevron />
              )}
              {trajets.length > 0 && <Row label={open === a ? 'Masquer les trajets' : `Voir les ${trajets.length} trajet(s)`} tone="accent" onClick={() => setOpen(open === a ? null : a)} />}
              {open === a &&
                trajets.map((x) => (
                  <Row
                    key={x.id}
                    label={x.motif}
                    detail={`${formatDateCourte(x.date)} · ${formatKm(x.km_total)}${x.nature === 'domicile_travail' ? ' · domicile–travail' : ''}`}
                    value={formatEuro(calc.get(x.id)?.total ?? 0)}
                    onClick={() => onOpenTrip(x.id)}
                    chevron
                  />
                ))}
            </Section>
            {bareme_indisponible && <Banner>{p.blocked}</Banner>}
            <div className="-mt-4 mb-8 px-4">
              {e ? (
                <PrimaryButton tone="plain" onClick={() => share(rebuildExport(data, calc, e))}>
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
                    if (fresh.prepared && !fresh.blocked) setConfirm({ activite: a, prepared: fresh.prepared, drafts: fresh.drafts.length })
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
        title={confirm ? `Exporter ${ACTIVITE_LABEL[confirm.activite]} — ${formatMoisLong(mois)}` : undefined}
        message={
          confirm
            ? `${confirm.prepared.payload.length} trajet(s) seront verrouillés.` +
              (confirm.drafts > 0 ? ` ${confirm.drafts} brouillon(s) partiront au prochain export (rattrapage).` : '')
            : undefined
        }
        actions={[
          ...(confirm && confirm.drafts > 0
            ? [{ label: 'Compléter d’abord', bold: true, onClick: () => { const d = previews[confirm.activite].drafts[0]; setConfirm(null); onOpenTrip(d.id) } }]
            : []),
          { label: confirm && confirm.drafts > 0 ? 'Exporter quand même' : 'Exporter et verrouiller', bold: !confirm?.drafts, onClick: () => void doExport() },
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

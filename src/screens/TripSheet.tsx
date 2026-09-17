import { useEffect, useState } from 'react'
import { supabase } from '../app/supabase'
import { syncEngine } from '../app/sync'
import { emptyTrip, finalizeTrip, nextStepPrefill, recentMotifs } from '../app/tripForm'
import { db } from '../db/db'
import { newRow, saveRow, saveRows, softDelete } from '../db/repo'
import type { TripCalc } from '../domain/chain'
import { findDuplicate, isDomicileTravailCandidate, missingReasons, resolveVehicle, roleOf, validateMotif } from '../domain/rules'
import { ACTIVITE_LABEL, EXPENSE_LABEL, ROLE_LABEL, type Activite, type ExpenseType, type Nature, type Place, type Trip, type TripExpense } from '../domain/types'
import { computeRouteKm, mapsConfigured } from '../geo/maps'
import type { AppData } from '../hooks/useData'
import { nowISO, todayISO } from '../lib/dates'
import { decimalFr, formatKm } from '../lib/format'
import { parseDecimal } from '../lib/parse'
import { ActionSheet } from '../ui/ActionSheet'
import { PrimaryButton } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { TextAreaRow, TextRow } from '../ui/Field'
import { Row, Section } from '../ui/List'
import { Segmented } from '../ui/Segmented'
import { Sheet } from '../ui/Sheet'
import { Toggle } from '../ui/Toggle'
import PlacePicker from './PlacePicker'

export interface TripSheetProps {
  data: AppData
  calc: Map<string, TripCalc>
  tripId?: string
  prefill?: Partial<Trip>
  onClose: () => void
  onNext: (prefill: Partial<Trip>) => void
}

type KmState = 'idle' | 'calcul' | 'attente' | 'erreur'

export default function TripSheet({ data, tripId, prefill, onClose, onNext }: TripSheetProps) {
  const existing = tripId ? data.trips.find((t) => t.id === tripId) : undefined
  const locked = existing?.statut === 'exporte'
  const [f, setF] = useState<Trip>(() => existing ?? emptyTrip(data, todayISO(), prefill))
  const [expenses, setExpenses] = useState<TripExpense[]>(() => data.expenses.filter((e) => e.trip_id === f.id))
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(expenses.map((e) => [e.id, decimalFr(e.montant, 2)])),
  )
  const [removed, setRemoved] = useState<string[]>([])
  const [picker, setPicker] = useState<'depart' | 'arrivee' | null>(null)
  const [kmState, setKmState] = useState<KmState>('idle')
  const [retry, setRetry] = useState(0)
  const [kmSaisi, setKmSaisi] = useState(f.km_saisi != null ? decimalFr(f.km_saisi, 1) : '')
  const [corriger, setCorriger] = useState(f.km_saisi != null)
  const [motifTouche, setMotifTouche] = useState(false)
  const [askDoublon, setAskDoublon] = useState<{ force: boolean } | null>(null)
  const [askDelete, setAskDelete] = useState(false)
  const [askReopen, setAskReopen] = useState(false)
  const [reopenMotif, setReopenMotif] = useState('')
  const [saved, setSaved] = useState<Trip | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<Trip>) => setF((x) => ({ ...x, ...patch }))
  const placeById = (id: string | null) => data.places.find((p) => p.id === id)

  // Distance automatique dès que départ et arrivée sont connus. Appel facturé et non annulable :
  // si l'utilisateur change de départ/arrivée pendant que la requête est en vol, la fonction de
  // nettoyage de l'effet passe `cancelled` à true avant que le nouvel effet (nouvelle paire) ne
  // démarre — la réponse tardive ne peut donc jamais écraser les km de la paire courante. Une fois
  // `km_route` connu, l'effet ne relance pas de requête pour la même paire (garde `f.km_route != null`).
  // `data.places` est dans les dépendances : un lieu tout juste créé (recherche Google) peut ne pas
  // encore figurer dans `data.places` au moment du choix (écriture Dexie/synchro live query pas
  // encore répercutée) ; sans cette dépendance l'effet ne se relancerait jamais pour le déclencher.
  useEffect(() => {
    if (locked || f.km_route != null) return
    const a = placeById(f.depart_place_id)
    const b = placeById(f.arrivee_place_id)
    if (!a || !b) return
    if (!navigator.onLine || !mapsConfigured() || a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
      setKmState('attente')
      return
    }
    let cancelled = false
    setKmState('calcul')
    computeRouteKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }).then(
      (km) => {
        if (cancelled) return
        set({ km_route: km })
        setKmState('idle')
      },
      () => !cancelled && setKmState('erreur'),
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.depart_place_id, f.arrivee_place_id, f.km_route, data.places, retry, locked])

  function pickPlace(p: Place, cote: 'depart' | 'arrivee') {
    const label = p.role ? ROLE_LABEL[p.role] : p.label
    if (cote === 'depart') set({ depart_place_id: p.id, depart_label: label, depart_adresse: p.adresse, km_route: null })
    else set({ arrivee_place_id: p.id, arrivee_label: label, arrivee_adresse: p.adresse, km_route: null })
    setPicker(null)
  }

  const draft = finalizeTrip({ ...f, km_saisi: corriger ? parseDecimal(kmSaisi) : null }, data)
  const reasons = missingReasons(draft, { vehicles: data.vehicles, places: data.places })
  const candidat = isDomicileTravailCandidate(f.activite, roleOf(f.depart_place_id, data.places), roleOf(f.arrivee_place_id, data.places))
  const vehicle = resolveVehicle(f.date, data.vehicles)
  const motifError = motifTouche ? validateMotif(f.motif) : null
  const suggestions = recentMotifs(data.trips, f.id).filter((m) => m !== f.motif)
  const quickPlaces = [
    ...data.places.filter((p) => p.role),
    ...data.places.filter((p) => !p.role).sort((a, b) => (b.last_used_at ?? '').localeCompare(a.last_used_at ?? '')).slice(0, 4),
  ].filter((p) => p.id !== f.depart_place_id)

  async function save(force: boolean, doublonOk = false) {
    setError(null)
    if (!doublonOk && !f.doublon_confirme && findDuplicate(draft, data.trips)) {
      setAskDoublon({ force })
      return
    }
    const trip = finalizeTrip({ ...draft, brouillon_force: force, doublon_confirme: f.doublon_confirme || doublonOk }, data)
    await saveRow(db, 'trips', trip)
    const valid = expenses.flatMap((e) => {
      const montant = parseDecimal(amounts[e.id] ?? '')
      return montant != null && montant > 0 ? [{ ...e, trip_id: trip.id, montant }] : []
    })
    if (valid.length) await saveRows(db, 'trip_expenses', valid)
    for (const id of removed) await softDelete(db, 'trip_expenses', id)
    const used = data.places.filter((p) => p.id === trip.depart_place_id || p.id === trip.arrivee_place_id)
    if (used.length) await saveRows(db, 'places', used.map((p) => ({ ...p, last_used_at: nowISO() })))
    if (existing) onClose()
    else setSaved(trip)
  }

  async function remove() {
    if (!existing) return
    for (const e of expenses) await softDelete(db, 'trip_expenses', e.id)
    await softDelete(db, 'trips', existing.id)
    onClose()
  }

  async function reopen() {
    if (!supabase || !existing) return
    const { error: err } = await supabase.rpc('reopen_trip', { p_trip_id: existing.id, p_motif: reopenMotif })
    if (err) {
      setError(navigator.onLine ? err.message : 'Réouverture impossible hors ligne.')
      setAskReopen(false)
      return
    }
    await syncEngine?.syncNow()
    onClose()
  }

  function addExpense(type: ExpenseType) {
    const e = newRow<TripExpense>({ trip_id: f.id, type, montant: 0, note: '' })
    setExpenses((xs) => [...xs, e])
    setAmounts((a) => ({ ...a, [e.id]: '' }))
  }

  if (saved) {
    const r = missingReasons(saved, { vehicles: data.vehicles, places: data.places })
    return (
      <Sheet open title="Trajet enregistré" onCancel={onClose}>
        <Section footer={saved.statut === 'brouillon' ? `Brouillon : ${r.join(' · ') || 'à finir plus tard'}.` : 'Trajet validé.'}>
          <Row label={saved.motif || 'Sans motif'} detail={`${saved.depart_label} → ${saved.arrivee_label}`} value={formatKm(saved.km_total)} />
        </Section>
        <div className="space-y-3 px-4">
          <PrimaryButton onClick={() => onNext(nextStepPrefill(saved))}>Étape suivante</PrimaryButton>
          <PrimaryButton tone="plain" onClick={onClose}>Terminé</PrimaryButton>
        </div>
      </Sheet>
    )
  }

  const kmValue =
    kmState === 'calcul' ? 'Calcul…'
    : kmState === 'attente' && draft.km_total == null ? 'Au retour du réseau'
    : kmState === 'erreur' && draft.km_total == null ? 'Échec du calcul'
    : formatKm(draft.km_total)

  return (
    <Sheet
      open
      title={locked ? 'Trajet exporté' : existing ? 'Modifier le trajet' : 'Nouveau trajet'}
      onCancel={onClose}
      onConfirm={locked ? undefined : () => void save(false)}
      confirmLabel={existing ? 'Enregistrer' : 'Ajouter'}
    >
      <fieldset disabled={locked} className="contents">
        <div className="mx-4 mb-6">
          <Segmented<Activite>
            value={f.activite}
            onChange={(activite) => set({ activite })}
            options={[{ value: 'swing_house', label: ACTIVITE_LABEL.swing_house }, { value: 'lmnp', label: ACTIVITE_LABEL.lmnp }]}
          />
        </div>

        <Section>
          <TextRow label="Date" value={f.date} onChange={(date) => set({ date })} type="date" />
          <Row label="Départ" value={f.depart_label || 'Choisir'} detail={f.depart_adresse || undefined} onClick={locked ? undefined : () => setPicker('depart')} chevron={!locked} />
          <Row label="Arrivée" value={f.arrivee_label || 'Choisir'} detail={f.arrivee_adresse || undefined} onClick={locked ? undefined : () => setPicker('arrivee')} chevron={!locked} />
        </Section>
        {!locked && !f.arrivee_place_id && quickPlaces.length > 0 && (
          <div className="-mt-5 mb-6 flex gap-2 overflow-x-auto px-4 pb-1">
            {quickPlaces.map((p) => (
              <Chip key={p.id} label={p.role ? ROLE_LABEL[p.role] : p.label} onClick={() => pickPlace(p, 'arrivee')} />
            ))}
          </div>
        )}

        {candidat && (
          <Section
            header="Nature du trajet"
            footer={f.nature === 'domicile_travail' ? 'Enregistré mais exclu de la note Swing House (réglage annuel).' : 'Domicile ↔ Swing House : trajet habituel ou vrai déplacement pro ?'}
          >
            <div className="px-4 py-2">
              <Segmented<Nature>
                value={f.nature}
                onChange={(nature) => set({ nature })}
                options={[{ value: 'domicile_travail', label: 'Domicile–travail' }, { value: 'pro', label: 'Déplacement pro' }]}
              />
            </div>
          </Section>
        )}

        <Section footer={corriger ? 'Le détour doit correspondre à un trajet réellement effectué.' : undefined}>
          <Row label="Distance" value={kmValue} detail={f.km_route != null ? `Itinéraire Google : ${formatKm(f.km_route)} aller` : undefined} />
          {kmState === 'erreur' && <Row label="Recalculer la distance" tone="accent" onClick={() => setRetry((n) => n + 1)} />}
          <Row label="Aller-retour" accessory={<Toggle label="Aller-retour" checked={f.aller_retour} onChange={(aller_retour) => set({ aller_retour })} />} />
          <Row label="Corriger les km" accessory={<Toggle label="Corriger les km" checked={corriger} onChange={setCorriger} />} />
          {corriger && <TextRow label="Km aller réels" value={kmSaisi} onChange={setKmSaisi} inputMode="decimal" placeholder="0,0" />}
          {corriger && <TextAreaRow value={f.justif_km ?? ''} onChange={(justif_km) => set({ justif_km })} placeholder="Justification (ex. détour dépose matériel chez…)" />}
        </Section>

        <Section header="Motif" footer={motifError && <span className="text-red">{motifError}</span>}>
          <TextAreaRow value={f.motif} onChange={(motif) => { set({ motif }); setMotifTouche(true) }} placeholder="Qui, quoi, où (ex. Rendez-vous fournisseur TrackMan à Annecy)" />
        </Section>
        {!locked && suggestions.length > 0 && (
          <div className="-mt-5 mb-6 flex gap-2 overflow-x-auto px-4 pb-1">
            {suggestions.map((m) => (
              <Chip key={m} label={m} onClick={() => { set({ motif: m }); setMotifTouche(true) }} />
            ))}
          </div>
        )}

        <Section header="Véhicule">
          <Row label={vehicle ? vehicle.nom : 'Aucun véhicule à cette date'} value={vehicle ? `${vehicle.cv} CV` : undefined} tone={vehicle ? 'default' : 'destructive'} />
        </Section>

        <Section header="Frais annexes" footer="Péages et parkings s’ajoutent au barème. Garder le justificatif.">
          {expenses.map((e) => (
            <div key={e.id} className="space-y-1 px-4 py-2">
              <div className="flex items-center gap-3">
                <span className="flex-1">{EXPENSE_LABEL[e.type]}</span>
                <input
                  className="w-24 rounded-md bg-fill px-2 py-1 text-right tabular outline-none"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amounts[e.id] ?? ''}
                  onChange={(ev) => setAmounts((a) => ({ ...a, [e.id]: ev.target.value }))}
                  aria-label={`Montant ${EXPENSE_LABEL[e.type]}`}
                />
                <span className="text-label2">€</span>
                {!locked && (
                  <button type="button" className="text-[15px] text-red" onClick={() => { setExpenses((xs) => xs.filter((x) => x.id !== e.id)); if (data.expenses.some((x) => x.id === e.id)) setRemoved((r) => [...r, e.id]) }}>
                    Retirer
                  </button>
                )}
              </div>
              <input
                className="w-full bg-transparent text-[15px] outline-none placeholder:text-label3"
                placeholder="Note (ex. A40 sortie Sallanches)"
                value={e.note}
                onChange={(ev) => setExpenses((xs) => xs.map((x) => (x.id === e.id ? { ...x, note: ev.target.value } : x)))}
              />
            </div>
          ))}
          {!locked && (
            <div className="flex gap-2 px-4 py-2">
              {(['peage', 'parking', 'autre'] as ExpenseType[]).map((t) => (
                <Chip key={t} label={`+ ${EXPENSE_LABEL[t]}`} onClick={() => addExpense(t)} />
              ))}
            </div>
          )}
        </Section>
      </fieldset>

      {!locked && reasons.length > 0 && <p className="mx-8 -mt-4 mb-6 text-[13px] text-orange">À compléter : {reasons.join(' · ')}</p>}
      {error && <p className="mx-8 mb-6 text-[13px] text-red">{error}</p>}

      {!locked && (
        <div className="mb-8 px-4">
          <PrimaryButton tone="plain" onClick={() => void save(true)}>Finir plus tard</PrimaryButton>
        </div>
      )}
      {existing && !locked && (
        <Section>
          <Row label="Supprimer le trajet" tone="destructive" onClick={() => setAskDelete(true)} />
        </Section>
      )}
      {locked && (
        <Section footer="Trajet verrouillé depuis son export. La réouverture est tracée et l’export concerné passera « à rectifier ».">
          <Row label="Rouvrir le trajet…" tone="destructive" onClick={() => setAskReopen(true)} />
        </Section>
      )}

      {picker && <PlacePicker open title={picker === 'depart' ? 'Départ' : 'Arrivée'} places={data.places} onPick={(p) => pickPlace(p, picker)} onCancel={() => setPicker(null)} />}
      <ActionSheet
        open={askDoublon != null}
        title="Trajet identique déjà saisi"
        message="Même date, même départ, même arrivée. C’est bien un deuxième trajet ?"
        actions={[{ label: 'Oui, c’est un autre trajet', bold: true, onClick: () => { const force = askDoublon?.force ?? false; setAskDoublon(null); void save(force, true) } }]}
        onCancel={() => setAskDoublon(null)}
      />
      <ActionSheet
        open={askDelete}
        title="Supprimer ce trajet ?"
        actions={[{ label: 'Supprimer', tone: 'destructive', onClick: () => void remove() }]}
        onCancel={() => setAskDelete(false)}
      />
      <ActionSheet
        open={askReopen}
        title="Rouvrir le trajet"
        message="Motif obligatoire, conservé dans le journal."
        actions={[{ label: 'Rouvrir', tone: 'destructive', onClick: () => void (reopenMotif.trim().length >= 5 ? reopen() : setError('Motif de réouverture : 5 caractères minimum.')) }]}
        onCancel={() => setAskReopen(false)}
      >
        <input
          className="mt-2 w-full rounded-md bg-fill px-3 py-2 text-[15px] outline-none"
          placeholder="Ex. erreur de date"
          value={reopenMotif}
          onChange={(e) => setReopenMotif(e.target.value)}
        />
      </ActionSheet>
    </Sheet>
  )
}

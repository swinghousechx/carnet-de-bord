import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db/db'
import { newRow, saveRow } from '../db/repo'
import { ROLE_LABEL, type Place, type PlaceRole } from '../domain/types'
import { createAutocompleteSession, mapsConfigured, type Suggestion } from '../geo/maps'
import { nowISO } from '../lib/dates'
import { IconPin, IconSearch } from '../ui/icons'
import { Row, Section } from '../ui/List'
import { Sheet } from '../ui/Sheet'

const ROLE_ORDER: PlaceRole[] = ['domicile', 'swing_house', 'lmnp']

// Anti-rebond de la recherche : requêtes Google facturées, une seule en vol à la fois.
const SUGGEST_DEBOUNCE_MS = 300

export default function PlacePicker(props: {
  open: boolean
  title: string
  places: Place[]
  onPick: (p: Place) => void
  onCancel: () => void
}) {
  const session = useMemo(() => createAutocompleteSession(), [])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Suggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const online = navigator.onLine
  const canSearch = mapsConfigured() && online
  // Numéro de séquence : une réponse dont la requête n'est plus la dernière lancée est ignorée
  // (ni résultats ni erreur appliqués), pour qu'une réponse en retard ne remplace jamais une plus récente.
  const seqRef = useRef(0)

  useEffect(() => {
    if (!canSearch || query.trim().length < 3) {
      seqRef.current += 1
      setResults([])
      setError(null)
      return
    }
    const id = setTimeout(() => {
      const seq = ++seqRef.current
      session.suggest(query).then(
        (r) => {
          if (seq === seqRef.current) setResults(r)
        },
        (e: Error) => {
          if (seq === seqRef.current) setError(e.message)
        },
      )
    }, SUGGEST_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query, canSearch, session])

  const favoris = ROLE_ORDER.flatMap((r) => props.places.filter((p) => p.role === r))
  const recents = props.places
    .filter((p) => !p.role)
    .sort((a, b) => (b.last_used_at ?? '').localeCompare(a.last_used_at ?? ''))
    .slice(0, 8)

  async function pickSuggestion(s: Suggestion) {
    try {
      const r = await session.resolve(s.id)
      const existing = props.places.find((p) => p.google_place_id === r.google_place_id)
      if (existing) return props.onPick(existing)
      const place = newRow<Place>({ ...r, role: null, last_used_at: nowISO() })
      await saveRow(db, 'places', place)
      props.onPick(place)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const placeRow = (p: Place) => (
    <Row
      key={p.id}
      leading={<IconPin className="size-5 text-label2" />}
      label={p.role ? ROLE_LABEL[p.role] : p.label}
      detail={p.adresse}
      onClick={() => props.onPick(p)}
    />
  )

  return (
    <Sheet open={props.open} title={props.title} onCancel={props.onCancel}>
      <div className="mx-4 mb-6 flex h-9 items-center gap-2 rounded-[10px] bg-fill px-2.5 text-label2">
        <IconSearch className="size-4" />
        <input
          className="min-w-0 flex-1 bg-transparent text-label outline-none placeholder:text-label2"
          placeholder={canSearch ? 'Rechercher une adresse' : 'Recherche indisponible'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!canSearch}
          autoFocus={canSearch}
        />
      </div>
      {!online && <p className="mx-8 mb-6 text-[13px] text-label2">Hors ligne : seuls les favoris et les lieux récents sont disponibles.</p>}
      {online && !mapsConfigured() && <p className="mx-8 mb-6 text-[13px] text-label2">Clé Google Maps absente.</p>}
      {error && <p className="mx-8 mb-6 text-[13px] text-red">{error}</p>}
      {results.length > 0 ? (
        <Section header="Résultats">
          {results.map((s) => (
            <Row key={s.id} leading={<IconPin className="size-5 text-label2" />} label={s.principal} detail={s.secondaire} onClick={() => void pickSuggestion(s)} />
          ))}
        </Section>
      ) : (
        <>
          {favoris.length > 0 && <Section header="Favoris">{favoris.map(placeRow)}</Section>}
          {recents.length > 0 && <Section header="Récents">{recents.map(placeRow)}</Section>}
        </>
      )}
    </Sheet>
  )
}

import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { LOCATION_BIAS } from '../config'
import { env } from '../env'
import { round1 } from '../lib/format'

export interface LatLng {
  lat: number
  lng: number
}

export interface Suggestion {
  id: string
  principal: string
  secondaire: string
}

export interface ResolvedPlace {
  google_place_id: string
  label: string
  adresse: string
  lat: number
  lng: number
}

export interface AutocompleteSession {
  suggest(input: string): Promise<Suggestion[]>
  resolve(id: string): Promise<ResolvedPlace>
}

// Types minimaux : on ne dépend que de ce qu'on utilise (robuste aux versions de @types/google.maps).
interface FText {
  text: string
}
interface PlaceObj {
  id: string
  displayName: string | null
  formattedAddress: string | null
  location: { lat(): number; lng(): number } | null
  fetchFields(o: { fields: string[] }): Promise<unknown>
}
interface Prediction {
  placeId: string
  text: FText
  mainText: FText | null
  secondaryText: FText | null
  toPlace(): PlaceObj
}
interface PlacesLib {
  AutocompleteSessionToken: new () => object
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(req: Record<string, unknown>): Promise<{ suggestions: { placePrediction: Prediction | null }[] }>
  }
}
interface RoutesLib {
  Route: { computeRoutes(req: Record<string, unknown>): Promise<{ routes?: { distanceMeters?: number }[] }> }
}
type LibName = Parameters<typeof importLibrary>[0]

let initialised = false
function ensureInit() {
  if (!env.mapsKey) throw new Error('Clé Google Maps manquante')
  if (!initialised) {
    setOptions({ key: env.mapsKey, v: 'weekly', language: 'fr', region: 'FR' })
    initialised = true
  }
}

export function mapsConfigured(): boolean {
  return Boolean(env.mapsKey)
}

// Une session = une recherche + une sélection (regroupées pour la facturation Google).
export function createAutocompleteSession(): AutocompleteSession {
  let token: object | null = null
  const predictions = new Map<string, Prediction>()
  return {
    async suggest(input) {
      if (input.trim().length < 3) return []
      ensureInit()
      const lib = (await importLibrary('places' as LibName)) as unknown as PlacesLib
      token ??= new lib.AutocompleteSessionToken()
      const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: token,
        language: 'fr',
        region: 'fr',
        includedRegionCodes: ['fr', 'ch', 'it'],
        locationBias: LOCATION_BIAS,
      })
      predictions.clear()
      return suggestions.flatMap((s) => {
        const p = s.placePrediction
        if (!p) return []
        predictions.set(p.placeId, p)
        return [{ id: p.placeId, principal: p.mainText?.text ?? p.text.text, secondaire: p.secondaryText?.text ?? '' }]
      })
    },
    async resolve(id) {
      const p = predictions.get(id)
      if (!p) throw new Error('Suggestion expirée, relance la recherche')
      const place = p.toPlace()
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
      token = null
      if (!place.location) throw new Error('Lieu sans coordonnées')
      return {
        google_place_id: place.id,
        label: place.displayName ?? p.text.text,
        adresse: place.formattedAddress ?? p.text.text,
        lat: place.location.lat(),
        lng: place.location.lng(),
      }
    },
  }
}

// Itinéraire routier standard (sans trafic), distance aller en km à 0,1 près.
export async function computeRouteKm(from: LatLng, to: LatLng): Promise<number> {
  ensureInit()
  const { Route } = (await importLibrary('routes' as LibName)) as unknown as RoutesLib
  const { routes } = await Route.computeRoutes({
    origin: from,
    destination: to,
    travelMode: 'DRIVING',
    routingPreference: 'TRAFFIC_UNAWARE',
    fields: ['distanceMeters'],
    language: 'fr',
    region: 'fr',
  })
  const meters = routes?.[0]?.distanceMeters
  if (meters == null) throw new Error('Itinéraire introuvable')
  return round1(meters / 1000)
}

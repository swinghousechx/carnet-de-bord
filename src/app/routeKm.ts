// Décision pure (testable hors React) : faut-il lancer un calcul d'itinéraire Google (facturé) ?
// `aKey`/`bKey` sont des clés de coordonnées, pas des identités d'objet `Place` — `useData`
// recombine toutes les tables dans une seule useLiveQuery, donc une écriture Dexie sans rapport
// (accusé de push, pull périodique, un autre trajet enregistré) reconstruit `data.places` à chaque
// fois ; s'abonner à ce tableau relancerait un appel facturé à chaque écriture. Les clés ne changent
// que si les coordonnées effectives du départ ou de l'arrivée changent.
export interface RouteKmGate {
  locked: boolean
  saved: boolean
  kmRoute: number | null
  aKey: string | null
  bKey: string | null
  online: boolean
  mapsReady: boolean
}

export function placeKey(p: { lat: number | null; lng: number | null } | undefined): string | null {
  return p && p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : null
}

export function shouldComputeRoute(g: RouteKmGate): boolean {
  if (g.locked || g.saved || g.kmRoute != null) return false
  if (!g.aKey || !g.bKey) return false
  return g.online && g.mapsReady
}

import { describe, expect, it } from 'vitest'
import { placeKey, shouldComputeRoute } from './routeKm'

describe('placeKey', () => {
  it('clé stable à partir des coordonnées, null si incomplètes ou absentes', () => {
    expect(placeKey({ lat: 45.9, lng: 6.8 })).toBe('45.9,6.8')
    expect(placeKey({ lat: null, lng: 6.8 })).toBeNull()
    expect(placeKey(undefined)).toBeNull()
  })
})

const base: Parameters<typeof shouldComputeRoute>[0] = {
  locked: false,
  saved: false,
  kmRoute: null,
  aKey: '45.9,6.8',
  bKey: '45.9,6.9',
  online: true,
  mapsReady: true,
}

describe('shouldComputeRoute', () => {
  it('lance un appel quand tout est prêt', () => {
    expect(shouldComputeRoute(base)).toBe(true)
  })
  it('ne relance pas si les km sont déjà connus', () => {
    expect(shouldComputeRoute({ ...base, kmRoute: 10 })).toBe(false)
  })
  it('rien une fois verrouillé ou après enregistrement', () => {
    expect(shouldComputeRoute({ ...base, locked: true })).toBe(false)
    expect(shouldComputeRoute({ ...base, saved: true })).toBe(false)
  })
  it('rien sans les deux clés (lieu non résolu)', () => {
    expect(shouldComputeRoute({ ...base, aKey: null })).toBe(false)
    expect(shouldComputeRoute({ ...base, bKey: null })).toBe(false)
  })
  it('rien hors ligne ou sans clé Maps', () => {
    expect(shouldComputeRoute({ ...base, online: false })).toBe(false)
    expect(shouldComputeRoute({ ...base, mapsReady: false })).toBe(false)
  })
  it('compte les appels réellement déclenchés sur une série de re-rendus simulés (deps React inchangées ⇒ pas de relance)', () => {
    // Reproduit la boucle useEffect(deps) : on ne réévalue la porte que si les dépendances
    // (primitives) diffèrent du rendu précédent — comme le ferait React lui-même.
    let calls = 0
    let lastDeps: string | null = null
    const rerender = (g: Parameters<typeof shouldComputeRoute>[0]) => {
      const deps = JSON.stringify(g)
      if (deps === lastDeps) return
      lastDeps = deps
      if (shouldComputeRoute(g)) calls++
    }
    rerender(base) // 1er rendu : lance l'appel
    rerender(base) // écriture Dexie sans rapport ailleurs dans l'app : mêmes clés, React ne relance pas l'effet
    rerender({ ...base, kmRoute: 10 }) // réponse arrivée : dépendance km changée, mais km déjà connus ⇒ pas d'appel
    rerender({ ...base, kmRoute: 10, saved: true }) // trajet enregistré : toujours rien
    expect(calls).toBe(1)
  })
})

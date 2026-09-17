import { describe, expect, it } from 'vitest'
import { createSuggestQueue } from './placePicker'

// Promesse contrôlée à la main, pour simuler des réponses réseau qui arrivent dans le désordre
// sans jamais appeler Google.
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('createSuggestQueue', () => {
  it('ne laisse jamais plus d’un appel en vol ; seule la dernière requête tapée part une fois l’appel en cours réglé', async () => {
    const calls: string[] = []
    const pendings: ReturnType<typeof deferred<string[]>>[] = []
    const suggest = (q: string) => {
      calls.push(q)
      const d = deferred<string[]>()
      pendings.push(d)
      return d.promise
    }
    const results: string[][] = []
    const errors: Error[] = []
    const queue = createSuggestQueue<string>({ suggest, onResult: (r) => results.push(r), onError: (e) => errors.push(e) })

    queue.request('ser')
    expect(calls).toEqual(['ser']) // (a) un seul appel en vol

    // L'utilisateur continue de taper pendant que « ser » est en vol : mémorisé, aucun second appel.
    queue.request('serv')
    queue.request('servo')
    expect(calls).toEqual(['ser']) // (a) toujours un seul appel en vol

    // Le premier appel se règle : (b) la dernière requête demandée part alors, et seulement elle.
    pendings[0].resolve(['résultat ser'])
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toEqual(['ser', 'servo'])

    pendings[1].resolve(['résultat servo'])
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    // Rien n'était en attente au-delà de « servo » : son règlement ne déclenche rien de plus.
    expect(calls).toEqual(['ser', 'servo'])
    // (c) les résultats affichés (le dernier appliqué) sont ceux de la dernière requête.
    expect(results).toEqual([['résultat ser'], ['résultat servo']])
    expect(errors).toEqual([])
  })

  it('ne renvoie pas une requête identique à celle qui vient de se terminer', async () => {
    const calls: string[] = []
    const pendings: ReturnType<typeof deferred<string[]>>[] = []
    const suggest = (q: string) => {
      calls.push(q)
      const d = deferred<string[]>()
      pendings.push(d)
      return d.promise
    }
    const queue = createSuggestQueue<string>({ suggest, onResult: () => {}, onError: () => {} })

    queue.request('chamonix')
    queue.request('chamonix') // retapée à l'identique pendant qu'elle est en vol
    pendings[0].resolve(['r'])
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(calls).toEqual(['chamonix'])
  })

  it('reset() invalide une réponse en retard sans relancer d’appel', async () => {
    const calls: string[] = []
    const pendings: ReturnType<typeof deferred<string[]>>[] = []
    const suggest = (q: string) => {
      calls.push(q)
      const d = deferred<string[]>()
      pendings.push(d)
      return d.promise
    }
    const results: string[][] = []
    const queue = createSuggestQueue<string>({ suggest, onResult: (r) => results.push(r), onError: () => {} })

    queue.request('serv')
    queue.reset() // champ vidé / désactivé pendant que la requête est en vol
    pendings[0].resolve(['résultat serv'])
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(results).toEqual([]) // réponse en retard ignorée
    expect(calls).toEqual(['serv']) // et aucun nouvel appel déclenché
  })
})

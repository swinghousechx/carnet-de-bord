import { describe, expect, it } from 'vitest'
import { createSuggestQueue } from './placePicker'

// Promesse contrôlée à la main, pour simuler des réponses réseau qui arrivent dans le désordre
// sans jamais appeler Google.
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Laisse s'exécuter la chaîne .then().catch().finally() déclenchée par le règlement d'une promesse.
async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
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

  it('retaper la même requête après un reset() la relance (elle n’a pas été « appliquée »)', async () => {
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

    queue.request('a')
    queue.reset() // ex. champ vidé, la réponse de « a » ne sera pas appliquée
    queue.request('a') // retapée à l'identique pendant que le premier « a » est encore en vol
    expect(calls).toEqual(['a'])

    pendings[0].resolve(['résultat a (invalidé)'])
    await flush()

    // La requête retapée est bien relancée : ce n'est pas parce qu'elle est textuellement
    // identique à la précédente qu'elle doit être ignorée, puisque celle-ci a été invalidée.
    expect(calls).toEqual(['a', 'a'])
    expect(results).toEqual([]) // la 1ʳᵉ réponse, invalidée par reset(), n'est pas appliquée

    pendings[1].resolve(['résultat a'])
    await flush()
    expect(results).toEqual([['résultat a']]) // la 2ᵉ, elle, l'est bien
  })

  it('après une erreur, une requête retapée à l’identique pendant que l’appel est en vol est relancée', async () => {
    const calls: string[] = []
    const pendings: ReturnType<typeof deferred<string[]>>[] = []
    const suggest = (q: string) => {
      calls.push(q)
      const d = deferred<string[]>()
      pendings.push(d)
      return d.promise
    }
    const errors: Error[] = []
    const queue = createSuggestQueue<string>({ suggest, onResult: () => {}, onError: (e) => errors.push(e) })

    queue.request('b')
    queue.request('b') // retapée pendant que le premier « b » est en vol
    expect(calls).toEqual(['b'])

    pendings[0].reject(new Error('échec réseau'))
    await flush()

    // Un échec ne doit jamais empêcher de retenter la même recherche.
    expect(calls).toEqual(['b', 'b'])
    expect(errors).toHaveLength(1)
  })
})

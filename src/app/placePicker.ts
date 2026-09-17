// File d'attente des suggestions d'adresses (Google Places, facturé à la requête) : au plus un
// appel `suggest()` en vol à la fois. Tant que la réponse n'est pas arrivée, seule la dernière
// requête demandée est mémorisée ; elle n'est envoyée qu'une fois l'appel en cours réglé, et
// seulement si elle diffère de celle qui vient de se terminer. Une réponse qui arriverait quand
// même en retard (résolution d'une promesse déjà dépassée) est ignorée via un numéro de séquence.
export interface SuggestQueueOptions<T> {
  suggest: (query: string) => Promise<T[]>
  onResult: (results: T[]) => void
  onError: (error: Error) => void
}

export interface SuggestQueue {
  request(query: string): void
  reset(): void
}

export function createSuggestQueue<T>(opts: SuggestQueueOptions<T>): SuggestQueue {
  let seq = 0
  let pending = false
  let next: string | null = null

  function send(query: string) {
    pending = true
    const mine = ++seq
    opts
      .suggest(query)
      .then(
        (r) => {
          if (mine === seq) opts.onResult(r)
        },
        (e: Error) => {
          if (mine === seq) opts.onError(e)
        },
      )
      .finally(() => {
        pending = false
        const q = next
        next = null
        if (q != null && q !== query) send(q)
      })
  }

  return {
    request(query) {
      if (pending) next = query
      else send(query)
    },
    reset() {
      seq += 1
      next = null
    },
  }
}

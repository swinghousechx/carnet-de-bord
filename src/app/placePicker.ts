// File d'attente des suggestions d'adresses (Google Places, facturé à la requête) : au plus un
// appel `suggest()` en vol à la fois. Tant que la réponse n'est pas arrivée, seule la dernière
// requête demandée est mémorisée ; elle n'est envoyée qu'une fois l'appel en cours réglé, sauf si
// elle est identique à celle qui vient de se terminer ET que la réponse de celle-ci a bien été
// appliquée (sinon — reset() ou échec — elle repart même à texte inchangé). Une réponse qui
// arriverait quand même en retard (résolution d'une promesse déjà dépassée) est ignorée via un
// numéro de séquence.
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
    let applied = false // vrai seulement si la réussite a été transmise à onResult pour CETTE requête
    opts
      .suggest(query)
      .then(
        (r) => {
          if (mine === seq) {
            applied = true
            opts.onResult(r)
          }
        },
        (e: Error) => {
          // Une erreur ne compte jamais comme « appliquée » : même retapée à l'identique, la
          // requête doit pouvoir être retentée plutôt que silencieusement abandonnée.
          if (mine === seq) opts.onError(e)
        },
      )
      .finally(() => {
        pending = false
        const q = next
        next = null
        // On ne réenvoie pas la requête suivante seulement si elle est identique à celle qui
        // vient de se terminer ET que sa réponse a bien été appliquée (sinon, invalidée par
        // reset() ou en échec, elle doit repartir même si le texte n'a pas changé).
        if (q != null && !(applied && q === query)) send(q)
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

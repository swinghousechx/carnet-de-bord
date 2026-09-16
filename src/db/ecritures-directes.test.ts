/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Garde-fou : toute écriture dans la base locale doit passer par saveRow/saveRows/softDelete
// (src/db/repo.ts), qui posent _dirty/_rev pour que le moteur de synchro la pousse vers Supabase.
// Une écriture Dexie qui contourne cette couche ne serait jamais synchronisée : la donnée
// existerait sur l'appareil et nulle part ailleurs, sans aucun signe visible.
//
// Ce test détecte ce contournement sous ses deux formes (accès direct, et via une variable
// intermédiaire comme `const t = db.table('trips'); t.put(...)`) et interdit les deux partout
// dans src/, sauf dans les couches explicitement autorisées ci-dessous.

const RACINE = join(import.meta.dirname, '..', '..')
const SRC = join(RACINE, 'src')

// Liste blanche des couches autorisées à écrire directement dans Dexie.
const COUCHES_AUTORISEES = [
  // src/db : la couche d'accès elle-même — saveRow/saveRows/softDelete y sont définis et sont les
  // seuls points d'entrée légitimes pour écrire ; ils DOIVENT toucher Dexie directement.
  join(SRC, 'db'),
  // src/sync : le moteur de synchro — il applique les lignes venues du serveur (pull) et marque les
  // lignes comme propres après un envoi réussi (push). Ces écritures ne doivent pas repasser par
  // saveRow, sinon elles se marqueraient elles-mêmes _dirty et boucleraient indéfiniment.
  join(SRC, 'sync'),
]

const METHODES_ECRITURE = ['put', 'add', 'update', 'delete', 'bulkPut', 'bulkAdd', 'bulkDelete', 'bulkUpdate', 'clear', 'modify']

// Racine directe d'une chaîne : `db.<table>` ou `db.table(...)` (generics `<...>` optionnels avant
// les parenthèses de `table(...)`). On ne capture qu'un seul point après `db` : la suite de la
// chaîne (où peut apparaître la méthode d'écriture, immédiatement ou plus loin) est examinée à part —
// voir `chaineContientEcriture` — pour repérer aussi les formes chaînées comme
// `db.trips.where('id').equals(x).delete()`, pas seulement `db.trips.put(...)`.
const RACINE_DIRECTE = /\bdb\.\w+/g

// Repère les variables assignées depuis `db.table(...)` ou `db.<table>` — ex. `const t = db.table('trips')`
// ou `const t = db.trips`. Une seule passe sur le fichier : pas de résolution de portée, pas de suivi
// entre fichiers ; le nom de variable trouvé est ensuite cherché tel quel dans tout le fichier.
const MOTIF_ASSIGNATION_TABLE = /\b(?:const|let|var)\s+(\w+)\s*=\s*db\.(?:table(?:<[^>]*>)?\([^)]*\)|\w+)\b/g

export interface EcritureDetectee {
  /** Numéro de ligne, 1-indexé. */
  ligne: number
  texte: string
}

// Vrai si une méthode d'écriture apparaît n'importe où dans la suite d'une chaîne — juste après un
// point (`.put(`, plus loin dans `.where(...).equals(...).delete(`), ou en tout début de chaîne
// quand le point qui précède la racine a déjà été consommé par le motif appelant (`put(` après
// avoir reconnu la variable `t` puis son point).
function chaineContientEcriture(suite: string): boolean {
  return new RegExp(`(?:^|\\.)(?:${METHODES_ECRITURE.join('|')})\\s*\\(`).test(suite)
}

/**
 * Détecte les écritures Dexie directes — accès direct (`db.<table>.put(...)`) ou via une variable
 * intermédiaire (`const t = db.table(...); t.put(...)`) — y compris sous forme chaînée
 * (`db.trips.where('id').equals(x).delete()`, `db.trips.toCollection().modify(...)`, et leurs
 * équivalents via variable). On raisonne sur la racine de la chaîne : si elle part de `db.<table>`,
 * de `db.table(...)`, ou d'une variable issue de l'un des deux, et qu'une méthode d'écriture
 * apparaît n'importe où dans la chaîne, c'est une violation. Ignore les lectures légitimes
 * (`.toArray()`, `.get(...)`, `.where(...).first()`, `.count()`, `.each(...)`, etc.) et les appels
 * à saveRow/saveRows/softDelete.
 */
export function detecterEcrituresDirectes(code: string): EcritureDetectee[] {
  const variablesTable = new Set<string>()
  for (const correspondance of code.matchAll(MOTIF_ASSIGNATION_TABLE)) {
    variablesTable.add(correspondance[1])
  }
  const motifVariable = variablesTable.size > 0 ? new RegExp(`\\b(?:${[...variablesTable].join('|')})\\b`, 'g') : null

  const violations: EcritureDetectee[] = []
  code.split('\n').forEach((ligne, index) => {
    let violee = false

    for (const correspondance of ligne.matchAll(RACINE_DIRECTE)) {
      const suite = ligne.slice((correspondance.index ?? 0) + correspondance[0].length)
      if (chaineContientEcriture(suite)) {
        violee = true
        break
      }
    }

    if (!violee && motifVariable !== null) {
      for (const correspondance of ligne.matchAll(motifVariable)) {
        const suite = ligne.slice((correspondance.index ?? 0) + correspondance[0].length)
        if (chaineContientEcriture(suite)) {
          violee = true
          break
        }
      }
    }

    if (violee) violations.push({ ligne: index + 1, texte: ligne.trim() })
  })
  return violations
}

function estCoucheAutorisee(chemin: string): boolean {
  return COUCHES_AUTORISEES.some((couche) => chemin === couche)
}

function listerFichiersSource(dossier: string): string[] {
  const resultat: string[] = []
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (estCoucheAutorisee(chemin)) continue
    if (statSync(chemin).isDirectory()) {
      resultat.push(...listerFichiersSource(chemin))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entree)) continue
    if (entree.endsWith('.test.ts') || entree.endsWith('.test.tsx')) continue
    resultat.push(chemin)
  }
  return resultat
}

describe('garde-fou : pas d’écriture Dexie directe hors de src/db et src/sync', () => {
  it('n’autorise .put/.add/.update/.delete/.bulk*/.clear sur db.<table> (accès direct ou via variable) que dans les couches autorisées', () => {
    const violations: string[] = []
    for (const fichier of listerFichiersSource(SRC)) {
      const contenu = readFileSync(fichier, 'utf-8')
      for (const { ligne, texte } of detecterEcrituresDirectes(contenu)) {
        violations.push(`${relative(RACINE, fichier)}:${ligne} — ${texte}`)
      }
    }
    expect(
      violations,
      `Écriture Dexie directe hors de src/db et src/sync (contourne saveRow/saveRows/softDelete) :\n${violations.join('\n')}\n` +
        `→ Passe par saveRow/saveRows/softDelete (src/db/repo.ts) au lieu d'écrire dans Dexie directement.`,
    ).toEqual([])
  })

  describe('detecterEcrituresDirectes', () => {
    it('signale un accès direct : db.<table>.<méthode>(', () => {
      const violations = detecterEcrituresDirectes(`await db.trips.put(row)`)
      expect(violations).toEqual([{ ligne: 1, texte: 'await db.trips.put(row)' }])
    })

    it('signale une écriture via variable intermédiaire (forme employée par src/sync/push.ts et pull.ts)', () => {
      const code = ["const t = db.table('trips')", 't.put(row)'].join('\n')
      const violations = detecterEcrituresDirectes(code)
      expect(violations).toEqual([{ ligne: 2, texte: 't.put(row)' }])
    })

    it('signale une écriture chaînée directe (db.<table>.where(...).delete())', () => {
      const violations = detecterEcrituresDirectes(`await db.trips.where('id').equals(x).delete()`)
      expect(violations).toEqual([{ ligne: 1, texte: `await db.trips.where('id').equals(x).delete()` }])
    })

    it('signale une écriture chaînée via variable intermédiaire', () => {
      const code = ["const t = db.table('trips')", "t.where('id').equals(x).delete()"].join('\n')
      const violations = detecterEcrituresDirectes(code)
      expect(violations).toEqual([{ ligne: 2, texte: "t.where('id').equals(x).delete()" }])
    })

    it('signale un modify (méthode d’écriture au même titre que put/add/…)', () => {
      const violations = detecterEcrituresDirectes(`await db.trips.toCollection().modify({ done: true })`)
      expect(violations).toEqual([{ ligne: 1, texte: `await db.trips.toCollection().modify({ done: true })` }])
    })

    it('laisse passer une lecture légitime (.toArray()/.get())', () => {
      const code = ["const t = db.table('trips')", 'await t.toArray()', "await db.trips.get('id')"].join('\n')
      expect(detecterEcrituresDirectes(code)).toEqual([])
    })

    it('laisse passer d’autres lectures légitimes chaînées (.where(...).first(), .count(), .each(...))', () => {
      const code = [
        "await db.trips.where('id').equals(x).first()",
        'await db.trips.count()',
        "const t = db.table('trips')",
        'await t.each((row) => console.log(row))',
      ].join('\n')
      expect(detecterEcrituresDirectes(code)).toEqual([])
    })

    it('laisse passer un appel à saveRow', () => {
      const violations = detecterEcrituresDirectes(`await saveRow(db, 'trips', row)`)
      expect(violations).toEqual([])
    })
  })
})

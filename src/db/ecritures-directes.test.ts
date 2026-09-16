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

const METHODES_ECRITURE = ['put', 'add', 'update', 'delete', 'bulkPut', 'bulkAdd', 'bulkDelete', 'bulkUpdate', 'clear']

// Forme 1, accès direct : `db.<table>.<méthode>(` ou `db.table(...).<méthode>(`
// (generics `<...>` optionnels avant les parenthèses de `table(...)`).
const MOTIF_ECRITURE_DIRECTE = new RegExp(
  `\\bdb\\.(?:\\w+|table(?:<[^>]*>)?\\([^)]*\\))\\.(?:${METHODES_ECRITURE.join('|')})\\s*\\(`,
)

// Repère les variables assignées depuis `db.table(...)` ou `db.<table>` — ex. `const t = db.table('trips')`
// ou `const t = db.trips`. Une seule passe sur le fichier : pas de résolution de portée, pas de suivi
// entre fichiers ; le nom de variable trouvé est ensuite cherché tel quel dans tout le fichier.
const MOTIF_ASSIGNATION_TABLE = /\b(?:const|let|var)\s+(\w+)\s*=\s*db\.(?:table(?:<[^>]*>)?\([^)]*\)|\w+)\b/g

export interface EcritureDetectee {
  /** Numéro de ligne, 1-indexé. */
  ligne: number
  texte: string
}

/**
 * Détecte les écritures Dexie directes (`db.<table>.put(...)`, ou via une variable intermédiaire
 * `const t = db.table(...); t.put(...)`) dans un extrait de code. Ignore les lectures
 * (`.toArray()`, `.get(...)`, `.where(...)`, etc.) et les appels à saveRow/saveRows/softDelete.
 */
export function detecterEcrituresDirectes(code: string): EcritureDetectee[] {
  const variablesTable = new Set<string>()
  for (const correspondance of code.matchAll(MOTIF_ASSIGNATION_TABLE)) {
    variablesTable.add(correspondance[1])
  }

  const motifEcritureViaVariable =
    variablesTable.size > 0
      ? new RegExp(`\\b(?:${[...variablesTable].join('|')})\\.(?:${METHODES_ECRITURE.join('|')})\\s*\\(`)
      : null

  const violations: EcritureDetectee[] = []
  code.split('\n').forEach((ligne, index) => {
    if (MOTIF_ECRITURE_DIRECTE.test(ligne) || (motifEcritureViaVariable !== null && motifEcritureViaVariable.test(ligne))) {
      violations.push({ ligne: index + 1, texte: ligne.trim() })
    }
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

    it('laisse passer une lecture légitime (.toArray()/.get())', () => {
      const code = ["const t = db.table('trips')", 'await t.toArray()', "await db.trips.get('id')"].join('\n')
      expect(detecterEcrituresDirectes(code)).toEqual([])
    })

    it('laisse passer un appel à saveRow', () => {
      const violations = detecterEcrituresDirectes(`await saveRow(db, 'trips', row)`)
      expect(violations).toEqual([])
    })
  })
})

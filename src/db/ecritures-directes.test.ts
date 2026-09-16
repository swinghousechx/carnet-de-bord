/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Garde-fou : toute écriture de l'UI doit passer par saveRow/saveRows/softDelete (src/db/repo.ts),
// qui posent _dirty/_rev pour la synchro. Un appel Dexie direct sur une table la contournerait
// sans que rien ne le signale — ce test détecte ce contournement dans tout le code hors de src/db/.

const RACINE = join(import.meta.dirname, '..', '..')
const SRC = join(RACINE, 'src')
const DB_DIR = join(SRC, 'db')

const METHODES_ECRITURE = ['put', 'add', 'update', 'delete', 'bulkPut', 'bulkAdd', 'bulkDelete', 'clear']

// Cible : `db.<table>.<méthode>(` ou `db.table(...).<méthode>(` (generics `<...>` optionnels avant les parenthèses).
const MOTIF_ECRITURE_DIRECTE = new RegExp(
  `\\bdb\\.(?:\\w+|table(?:<[^>]*>)?\\([^)]*\\))\\.(?:${METHODES_ECRITURE.join('|')})\\s*\\(`,
)

function listerFichiersSource(dossier: string): string[] {
  const resultat: string[] = []
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (chemin === DB_DIR) continue // la couche d'accès elle-même : seule autorisée à écrire dans Dexie
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

describe('garde-fou : pas d’écriture Dexie directe hors de src/db', () => {
  it('n’autorise .put/.add/.update/.delete/.bulkPut/.bulkAdd/.bulkDelete/.clear sur db.<table> ou db.table(...) que dans src/db', () => {
    const violations: string[] = []
    for (const fichier of listerFichiersSource(SRC)) {
      const lignes = readFileSync(fichier, 'utf-8').split('\n')
      lignes.forEach((ligne, index) => {
        if (MOTIF_ECRITURE_DIRECTE.test(ligne)) {
          violations.push(`${relative(RACINE, fichier)}:${index + 1} — ${ligne.trim()}`)
        }
      })
    }
    expect(
      violations,
      `Écriture Dexie directe hors de src/db (contourne saveRow/saveRows/softDelete) :\n${violations.join('\n')}`,
    ).toEqual([])
  })
})

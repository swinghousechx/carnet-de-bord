import { ACTIVITES, ACTIVITE_LABEL, type Activite } from '../domain/types'
import { exportBlockReason, latestExport } from '../export/select'
import type { AppData } from '../hooks/useData'
import { monthOf } from '../lib/dates'
import { formatMoisLong } from '../lib/format'

// Mois « en retard » : antérieurs à `avant`, encore exportables (pas d'export émis), et qui ont soit
// des trajets validés non exportés datés de ce mois, soit un export « à rectifier ». Règle unique pour
// le bandeau de l'accueil, celui du Récap et le mois ouvert par défaut dans le Récap : exporter ces
// mois d'abord, dans l'ordre, pour que chaque note corresponde à son mois plutôt que de partir en
// rattrapage. Les brouillons n'en font pas partie (ils ont leur propre liste sur l'accueil).
export function earlierMonthsToExport(app: AppData, activite: Activite, avant: string): string[] {
  const mois = new Set<string>()
  for (const t of app.trips) {
    if (t.deleted_at || t.activite !== activite || t.statut !== 'valide' || t.export_id != null) continue
    const m = monthOf(t.date)
    if (m < avant) mois.add(m)
  }
  for (const e of app.exports) {
    if (e.activite === activite && e.mois < avant && latestExport(app.exports, activite, e.mois)?.statut === 'a_rectifier') mois.add(e.mois)
  }
  return [...mois].filter((m) => exportBlockReason(app.exports, activite, m) == null).sort()
}

export type Retard = [mois: string, activites: Activite[]][]

// Mois en retard toutes activités confondues, du plus ancien au plus récent.
export function monthsBehind(app: AppData, avant: string): Retard {
  const parMois = new Map<string, Activite[]>()
  for (const a of ACTIVITES) for (const m of earlierMonthsToExport(app, a, avant)) parMois.set(m, [...(parMois.get(m) ?? []), a])
  return [...parMois.entries()].sort(([x], [y]) => x.localeCompare(y))
}

const sansAnnee = (m: string) => formatMoisLong(m).replace(/ \d{4}$/, '')
const deA = (m: string) => (/^[aeiouyéè]/i.test(sansAnnee(m)) ? 'd’' : 'de ')

// « juin, juillet 2026 » si même année, sinon « décembre 2025, janvier 2026 ». Au-delà de trois
// mois : « 5 mois, d’avril à août 2026 » (les mois d'un même export se suivent rarement tous).
function moisListe(mois: string[]): string {
  const memeAnnee = new Set(mois.map((m) => m.slice(0, 4))).size === 1
  const premier = mois[0]
  const dernier = mois[mois.length - 1]
  if (mois.length > 3) {
    const debut = memeAnnee ? sansAnnee(premier) : formatMoisLong(premier)
    return `${mois.length} mois, ${deA(premier)}${debut} à ${formatMoisLong(dernier)}`
  }
  if (!memeAnnee) return mois.map(formatMoisLong).join(', ')
  return `${mois.map(sansAnnee).join(', ')} ${premier.slice(0, 4)}`
}

// Texte du bandeau (minuscule initiale : l'écran met la majuscule). `mois` = mois de référence
// (celui affiché dans le Récap, ou le mois en cours sur l'accueil).
export function retardMessage(retard: Retard, mois: string): string {
  const activites = [...new Set(retard.flatMap(([, acts]) => acts))]
  const qui = ` (${activites.map((a) => ACTIVITE_LABEL[a]).join(', ')})`
  if (retard.length === 1) return `${formatMoisLong(retard[0][0])} pas encore exporté${qui} : à exporter avant ${formatMoisLong(mois)}.`
  const liste = moisListe(retard.map(([m]) => m))
  // « 5 mois, d’avril à août 2026 pas encore exportés » se lit mal : le compte passe devant.
  const texte = retard.length > 3 ? liste.replace(/^(\d+ mois), /, '$1 pas encore exportés, ') : `${liste} pas encore exportés`
  return `${texte}${qui} : commencer par ${formatMoisLong(retard[0][0])}.`
}

import { useState } from 'react'
import { db } from '../db/db'
import { saveRow, saveRows } from '../db/repo'
import { buildBaremeRows, DEFAULT_RATES } from '../domain/default-bareme'
import type { BaremeRate, BaremeYear } from '../domain/types'
import type { AppData } from '../hooks/useData'
import { decimalFr } from '../lib/format'
import { parseDecimal } from '../lib/parse'
import { TextRow } from '../ui/Field'
import { Section } from '../ui/List'
import { Sheet } from '../ui/Sheet'

export interface BaremeSheetProps {
  data: AppData
  annee: number
  onClose: () => void
}

const cvLabel = (r: BaremeRate) =>
  r.cv_min == null ? `${r.cv_max} CV et moins` : r.cv_max == null ? `${r.cv_min} CV et plus` : `${r.cv_min} CV`
const trancheLabel = (r: BaremeRate) =>
  r.km_min === 0 ? 'Jusqu’à 5 000 km' : r.km_max == null ? 'Au-delà de 20 000 km' : 'De 5 001 à 20 000 km'

// Barème existant, ou nouvelle année pré-remplie par copie de la plus récente.
function initial(data: AppData, annee: number): { year: BaremeYear; rates: BaremeRate[]; isNew: boolean } {
  const year = data.baremeYears.find((y) => y.annee === annee)
  if (year) return { year, rates: data.rates.filter((r) => r.annee === annee), isNew: false }
  const prev = [...data.baremeYears].filter((y) => y.annee < annee).sort((a, b) => b.annee - a.annee)[0]
  const seeds = prev ? data.rates.filter((r) => r.annee === prev.annee) : DEFAULT_RATES
  const built = buildBaremeRows(
    annee,
    prev?.majoration_electrique ?? 0.2,
    '',
    seeds.map(({ cv_min, cv_max, km_min, km_max, coef, constante }) => ({ cv_min, cv_max, km_min, km_max, coef, constante })),
  )
  return { ...built, isNew: true }
}

export default function BaremeSheet({ data, annee, onClose }: BaremeSheetProps) {
  const [init] = useState(() => initial(data, annee))
  const [maj, setMaj] = useState(decimalFr(init.year.majoration_electrique * 100, 0))
  const [source, setSource] = useState(init.year.source)
  const [values, setValues] = useState<Record<string, { coef: string; constante: string }>>(() =>
    Object.fromEntries(init.rates.map((r) => [r.id, { coef: decimalFr(r.coef, 3), constante: decimalFr(r.constante, 0) }])),
  )
  const [error, setError] = useState<string | null>(null)

  const sorted = [...init.rates].sort((a, b) => (a.cv_min ?? 0) - (b.cv_min ?? 0) || a.km_min - b.km_min)
  const groups = [...new Set(sorted.map(cvLabel))].map((label) => ({ label, rates: sorted.filter((r) => cvLabel(r) === label) }))
  const set = (id: string, key: 'coef' | 'constante', v: string) => setValues((s) => ({ ...s, [id]: { ...s[id], [key]: v } }))

  async function save() {
    const majNum = parseDecimal(maj)
    const rates = sorted.map((r) => ({ ...r, coef: parseDecimal(values[r.id].coef), constante: parseDecimal(values[r.id].constante) }))
    if (majNum == null || rates.some((r) => r.coef == null || r.constante == null)) return setError('Toutes les valeurs doivent être des nombres.')
    await saveRow(db, 'bareme_years', { ...init.year, majoration_electrique: majNum / 100, source: source.trim() })
    await saveRows(db, 'bareme_rates', rates.map((r) => ({ ...r, coef: r.coef!, constante: r.constante! })))
    onClose()
  }

  return (
    <Sheet open title={`Barème ${annee}`} onCancel={onClose} onConfirm={() => void save()} confirmLabel="Enregistrer">
      <Section
        footer={
          <>
            {init.isNew && 'Nouvelle année pré-remplie avec la précédente : corrige les valeurs publiées. '}
            Les trajets non exportés sont recalculés ; les trajets exportés restent figés.
            {error && <span className="block text-red">{error}</span>}
          </>
        }
      >
        <TextRow label="Majoration électrique (%)" value={maj} onChange={setMaj} inputMode="decimal" />
        <TextRow label="Source" value={source} onChange={setSource} placeholder="Arrêté du …" />
      </Section>
      {groups.map((g) => (
        <Section key={g.label} header={g.label}>
          {g.rates.map((r) => (
            <div key={r.id} className="flex min-h-11 items-center gap-2 px-4 py-1.5 text-[15px]">
              <span className="flex-1">{trancheLabel(r)}</span>
              <span className="text-label2">d ×</span>
              <input
                className="w-16 rounded-md bg-fill px-2 py-1 text-right tabular outline-none"
                inputMode="decimal"
                value={values[r.id].coef}
                onChange={(e) => set(r.id, 'coef', e.target.value)}
                aria-label={`Coefficient ${g.label} ${trancheLabel(r)}`}
              />
              {r.constante !== 0 || (r.km_min > 0 && r.km_max != null) ? (
                <>
                  <span className="text-label2">+</span>
                  <input
                    className="w-16 rounded-md bg-fill px-2 py-1 text-right tabular outline-none"
                    inputMode="decimal"
                    value={values[r.id].constante}
                    onChange={(e) => set(r.id, 'constante', e.target.value)}
                    aria-label={`Constante ${g.label} ${trancheLabel(r)}`}
                  />
                </>
              ) : null}
            </div>
          ))}
        </Section>
      ))}
    </Sheet>
  )
}

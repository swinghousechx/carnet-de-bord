# Carnet de bord — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Construire la PWA « Carnet de bord » (notes de frais kilométriques Swing House SAS + LMNP EI) décrite dans `docs/superpowers/specs/2026-09-15-carnet-de-bord-design.md`.

**Architecture :** PWA local-first : l'UI React lit et écrit dans IndexedDB (Dexie) ; un moteur de synchro pousse/tire vers un projet Supabase dédié (Postgres + Auth + RLS + triggers de verrouillage + RPC d'export). Le calcul (barème en chaîne télescopique) et la construction des exports sont des modules TypeScript purs, testés avec Vitest. Google Maps JS (Places New + Routes) est chargé à la demande, uniquement en ligne.

**Tech Stack :** Vite 8, React 19, TypeScript ~6.0, Tailwind CSS 4 (`@tailwindcss/vite`), vite-plugin-pwa 1.3, Dexie 4 + dexie-react-hooks, @supabase/supabase-js 2, @googlemaps/js-api-loader 2 (+ @types/google.maps), jsPDF 4 + jspdf-autotable 5, Vitest 5 + fake-indexeddb. Hébergement GitHub Pages.

## Global Constraints

- Tout le texte d'interface, les commentaires et les messages de commit sont en **français**.
- Repo : `/Users/samuelpochat/Documents/carnet-de-bord`, branche `main`, **public** → aucun secret dans le code ; ne jamais écrire le prénom du comptable, écrire « le comptable ».
- Base path de production : `/carnet-de-bord/` (variable `VITE_BASE`, `/` en local). URL : `https://swinghousechx.github.io/carnet-de-bord/`.
- Variables d'environnement (build) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_KEY`, `VITE_BASE`.
- Activités : `swing_house` (« Swing House ») et `lmnp` (« LMNP »). Une seule activité par trajet.
- Dates stockées en `YYYY-MM-DD` (date locale), mois en `YYYY-MM`, horodatages en ISO 8601.
- Km stockés à 0,1 km près ; montants arrondis au centime (`round2`).
- Montant barème d'un trajet = `round2(f(C + km)) − round2(f(C))`, chaîne par (véhicule, activité, année civile) ; les trajets exportés gardent leur montant figé.
- Tranches barème : `D ≤ 5 000`, `5 000 < D ≤ 20 000`, `D > 20 000`. Électrique : × (1 + majoration, 0,20 en 2026).
- Motif : ≥ 12 caractères après trim, et refus des motifs génériques seuls.
- **Aucun montant en euros sur l'écran Accueil** ; les montants n'apparaissent que dans Récap/export.
- Direction visuelle : **simple, épurée, style Apple** (police système, listes « inset grouped », fond #F2F2F7 / cellules blanches, un seul accent #007AFF, mode sombre automatique, feuilles modales, pas d'ombres/dégradés/logos).
- PDF : noir sur blanc, Helvetica, filets fins, aucune couleur ; caractères limités à WinAnsi (pas de « → », espaces insécables remplacés).
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Actions externes (création du projet Supabase, repo GitHub, clé Google) : **demander confirmation à Sam avant**, annoncer le coût.

## Écarts assumés par rapport à la spec

- RPC `export_month` / `reopen_trip` en `security definer` (contrôle explicite d'`auth.uid()`) : `exports` et `trip_events` ne sont écrits que par ces fonctions, le client n'a que la lecture (spec §11 : « security invoker »). Plus strict, même intention.
- Statut d'export supplémentaire `remplace` pour une version remplacée par un rectificatif (spec §5 : `emis`, `a_rectifier`).
- Deux champs techniques sur `trips` : `brouillon_force` (« Finir plus tard ») et `doublon_confirme` (doublon signalé puis confirmé).
- « Un lieu par rôle » (spec §5) garanti par l'app (réaffectation atomique locale), sans index unique en base, pour éviter les conflits d'ordre à la synchro.
- La recherche des trajets à exporter inclut les trajets domicile–travail exclus (section « pour mémoire », montant 0), qui sont verrouillés avec l'export.

## Structure des fichiers

```
carnet-de-bord/
├─ index.html                      # meta iOS, manifest, point d'entrée
├─ package.json / vite.config.ts / vitest.config.ts / tsconfig*.json
├─ .env.example                    # modèle des variables VITE_*
├─ scripts/generate-icons.mjs      # icônes PNG (pictogramme sur fond uni)
├─ public/                         # icon.svg, favicon.svg, PNG générés
├─ supabase/migrations/            # 0001_schema.sql, 0002_securite.sql, 0003_rpc.sql
├─ docs/mise-en-service.md         # Google Cloud, Supabase Auth, GitHub, iPhone
├─ .github/workflows/deploy.yml    # build + GitHub Pages
├─ .github/workflows/keepalive.yml # ping hebdo Supabase
└─ src/
   ├─ main.tsx / App.tsx / index.css / env.ts / config.ts / vite-env.d.ts
   ├─ lib/dates.ts, lib/format.ts            # utilitaires purs
   ├─ domain/types.ts                        # types partagés (lignes de tables)
   ├─ domain/default-bareme.ts               # barème 2026 pré-rempli
   ├─ domain/bareme.ts                       # selectRateSet, baremeAmount
   ├─ domain/rules.ts                        # véhicule, km, motif, nature, statut, doublon
   ├─ domain/chain.ts                        # computeAll (chaîne), cumulKm
   ├─ export/select.ts                       # périmètre d'un export, versions
   ├─ export/build.ts                        # ExportData
   ├─ export/columns.ts, export/csv.ts       # CSV (colonnes centralisées)
   ├─ export/pdf.ts, export/share.ts, export/filenames.ts
   ├─ db/db.ts, db/repo.ts                   # Dexie + écritures locales (outbox)
   ├─ sync/remote.ts, sync/push.ts, sync/pull.ts, sync/engine.ts
   ├─ geo/maps.ts, geo/pending.ts            # Google Maps + calcul différé des km
   ├─ app/supabase.ts, app/sync.ts, app/seed.ts, app/exportFlow.ts
   ├─ hooks/useData.ts, hooks/useSyncState.ts
   ├─ ui/ (icons, NavBar, List, Sheet, Segmented, Toggle, ActionSheet, Chip, Banner, TabBar, Field)
   └─ screens/ (Login, Home, TripSheet, PlacePicker, Recap, Settings, VehicleSheet, BaremeSheet)
```

Tests : fichiers `*.test.ts` à côté du module testé, environnement `node`, IndexedDB simulé par `fake-indexeddb`.

---
### Task 1 : Socle du projet + utilitaires dates/format

**Files :**
- Create : `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `.gitignore`, `.env.example`
- Create : `src/vite-env.d.ts`, `src/env.ts`, `src/config.ts`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test/setup.ts`
- Create : `src/lib/dates.ts`, `src/lib/format.ts`
- Test : `src/lib/dates.test.ts`, `src/lib/format.test.ts`

**Interfaces :**
- Consumes : rien.
- Produces :
  - `dates.ts` : `todayISO(now?: Date): string`, `nowISO(): string`, `monthOf(date: string): string`, `yearOf(dateOrMonth: string): number`, `firstDayOfMonth(mois: string): string`, `lastDayOfMonth(mois: string): string`, `prevMonth(mois: string): string`, `nextMonth(mois: string): string`
  - `format.ts` : `roundTo(x: number, decimals: number): number`, `round1(x: number): number`, `round2(x: number): number`, `cleanSpaces(s: string): string`, `decimalFr(x: number, digits: number): string`, `formatKm(km: number | null): string`, `formatEuro(x: number): string`, `formatMoisLong(mois: string): string`, `formatJour(date: string): string`, `formatDateCourte(date: string): string`
  - `env.ts` : `env.supabaseUrl`, `env.supabaseKey`, `env.mapsKey` (`string | undefined`)
  - `config.ts` : `BENEFICIAIRE`, `LOCATION_BIAS`, `SYNC_INTERVAL_MS`
  - `index.css` : classes Tailwind de couleur `bg-bg`, `bg-cell`, `text-label`, `text-label2`, `text-label3`, `border-sep`, `bg-fill`, `text-accent`/`bg-accent`, `text-orange`, `text-red`, `bg-green`, `bg-indigo`, utilitaire `.tabular`

- [ ] **Step 1 : Créer `package.json`**

```json
{
  "name": "carnet-de-bord",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "icons": "node scripts/generate-icons.mjs"
  }
}
```

- [ ] **Step 2 : Installer les dépendances**

Run :
```bash
cd /Users/samuelpochat/Documents/carnet-de-bord
npm install react@^19.2.8 react-dom@^19.2.8 dexie@^4.4.6 dexie-react-hooks@^4.4.0 @supabase/supabase-js@^2.116.0 @googlemaps/js-api-loader@^2.1.1 jspdf@^4.2.1 jspdf-autotable@^5.0.8
npm install -D vite@^8.3.0 @vitejs/plugin-react@^6.1.1 typescript@~6.0.2 @types/react@^19.2.18 @types/react-dom@^19.2.7 @types/node@^24.13.3 @types/google.maps@^3.66.2 tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3 vite-plugin-pwa@^1.3.0 vitest@^5.0.1 fake-indexeddb@^6.2.5
```
Expected : `added N packages`, aucune erreur de peer dependency bloquante.

- [ ] **Step 3 : Configs TypeScript (reprises du modèle officiel Vite 8 react-ts)**

`tsconfig.json` :
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`tsconfig.app.json` :
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "esnext",
    "types": ["vite/client", "google.maps"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

`tsconfig.node.json` :
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4 : `vite.config.ts` et `vitest.config.ts`**

`vite.config.ts` (le plugin PWA est ajouté en Task 16) :
```ts
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Base path : '/' en local, '/carnet-de-bord/' sur GitHub Pages (injecté par le workflow).
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
```

`vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
```

`src/test/setup.ts` :
```ts
// IndexedDB simulé pour les tests Dexie (environnement node).
import 'fake-indexeddb/auto'
```

- [ ] **Step 5 : `index.html`, `.gitignore`, `.env.example`**

`index.html` :
```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f2f2f7" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Carnet" />
    <link rel="icon" type="image/svg+xml" href="favicon.svg" />
    <link rel="apple-touch-icon" href="apple-touch-icon.png" />
    <title>Carnet de bord</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore` :
```
node_modules
dist
dev-dist
.env
.env.local
*.tsbuildinfo
.DS_Store
```

`.env.example` :
```
# Copier en .env.local et remplir (jamais commité)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
VITE_GOOGLE_MAPS_KEY=AIza...
```

- [ ] **Step 6 : `src/vite-env.d.ts`, `src/env.ts`, `src/config.ts`**

`src/vite-env.d.ts` :
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_GOOGLE_MAPS_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

`src/env.ts` :
```ts
// Variables injectées au build. Toutes publiques par nature (clé publishable Supabase
// protégée par RLS, clé Google restreinte par référent) : aucun secret ici.
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '') || undefined,
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || undefined,
  mapsKey: import.meta.env.VITE_GOOGLE_MAPS_KEY?.trim() || undefined,
}
```

`src/config.ts` :
```ts
// Bénéficiaire affiché sur les exports.
export const BENEFICIAIRE = 'Sam Pochat'

// Biais géographique de l'autocomplete : vallée de Chamonix (rayon en mètres).
export const LOCATION_BIAS = { center: { lat: 45.92, lng: 6.87 }, radius: 40000 }

// Fréquence de synchro quand l'app est ouverte et en ligne.
export const SYNC_INTERVAL_MS = 60_000
```

- [ ] **Step 7 : Thème et coquille React**

`src/index.css` :
```css
@import "tailwindcss";

/* Palette système iOS (clair), redéfinie en sombre plus bas. */
:root {
  --bg: #f2f2f7;
  --cell: #ffffff;
  --label: #000000;
  --label2: rgba(60, 60, 67, 0.6);
  --label3: rgba(60, 60, 67, 0.3);
  --sep: rgba(60, 60, 67, 0.29);
  --fill: rgba(120, 120, 128, 0.12);
  --accent: #007aff;
  --orange: #ff9500;
  --red: #ff3b30;
  --green: #34c759;
  --indigo: #5856d6;
  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000000;
    --cell: #1c1c1e;
    --label: #ffffff;
    --label2: rgba(235, 235, 245, 0.6);
    --label3: rgba(235, 235, 245, 0.3);
    --sep: rgba(84, 84, 88, 0.65);
    --fill: rgba(118, 118, 128, 0.24);
    --accent: #0a84ff;
    --orange: #ff9f0a;
    --red: #ff453a;
    --green: #30d158;
    --indigo: #5e5ce6;
  }
}

@theme inline {
  --color-bg: var(--bg);
  --color-cell: var(--cell);
  --color-label: var(--label);
  --color-label2: var(--label2);
  --color-label3: var(--label3);
  --color-sep: var(--sep);
  --color-fill: var(--fill);
  --color-accent: var(--accent);
  --color-orange: var(--orange);
  --color-red: var(--red);
  --color-green: var(--green);
  --color-indigo: var(--indigo);
  --font-sans: system-ui, -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--label);
  font-family: var(--font-sans);
  font-size: 17px;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior-y: none;
}

button {
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
}

/* 17 px minimum : pas de zoom automatique d'iOS au focus. */
input,
textarea,
select {
  font-size: 17px;
}

.tabular {
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

`src/main.tsx` :
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.tsx` (remplacé en Task 11) :
```tsx
export default function App() {
  return (
    <main className="min-h-full bg-bg px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
      <h1 className="text-[34px] font-bold tracking-tight">Carnet de bord</h1>
    </main>
  )
}
```

- [ ] **Step 8 : Écrire les tests des utilitaires (échec attendu)**

`src/lib/dates.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { firstDayOfMonth, lastDayOfMonth, monthOf, nextMonth, prevMonth, todayISO, yearOf } from './dates'

describe('dates', () => {
  it('todayISO utilise la date locale', () => {
    expect(todayISO(new Date(2026, 8, 5, 23, 30))).toBe('2026-09-05')
  })
  it('monthOf / yearOf', () => {
    expect(monthOf('2026-09-15')).toBe('2026-09')
    expect(yearOf('2026-09-15')).toBe(2026)
    expect(yearOf('2026-09')).toBe(2026)
  })
  it('premier et dernier jour du mois, années bissextiles', () => {
    expect(firstDayOfMonth('2026-09')).toBe('2026-09-01')
    expect(lastDayOfMonth('2026-09')).toBe('2026-09-30')
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28')
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29')
  })
  it('mois précédent / suivant avec changement d’année', () => {
    expect(prevMonth('2026-01')).toBe('2025-12')
    expect(prevMonth('2026-09')).toBe('2026-08')
    expect(nextMonth('2026-12')).toBe('2027-01')
  })
})
```

`src/lib/format.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { decimalFr, formatDateCourte, formatEuro, formatJour, formatKm, formatMoisLong, round1, round2 } from './format'

describe('arrondis', () => {
  it('round2 arrondit au centime sans erreur flottante', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
    expect(round2(0)).toBe(0)
    expect(round2(-1.005)).toBe(-1.01)
  })
  it('round1 arrondit au dixième', () => {
    expect(round1(15.25)).toBe(15.3)
    expect(round1(15.24)).toBe(15.2)
  })
})

describe('format', () => {
  it('decimalFr : virgule, sans séparateur de milliers', () => {
    expect(decimalFr(1234.5, 2)).toBe('1234,50')
    expect(decimalFr(1.005, 2)).toBe('1,01')
  })
  it('formatEuro remplace les espaces insécables par des espaces simples', () => {
    expect(formatEuro(1234.5)).toBe('1 234,50 €')
  })
  it('formatKm', () => {
    expect(formatKm(1234.5)).toBe('1 234,5 km')
    expect(formatKm(15)).toBe('15 km')
    expect(formatKm(null)).toBe('—')
  })
  it('dates lisibles', () => {
    expect(formatMoisLong('2026-09')).toBe('septembre 2026')
    expect(formatJour('2026-09-15')).toMatch(/15 sept/)
    expect(formatDateCourte('2026-09-15')).toBe('15/09/2026')
  })
})
```

- [ ] **Step 9 : Lancer les tests (échec attendu)**

Run : `npm test`
Expected : FAIL — `Failed to resolve import "./dates"` / `"./format"`.

- [ ] **Step 10 : Implémenter `src/lib/dates.ts`**

```ts
const pad = (n: number) => String(n).padStart(2, '0')

// Date locale au format YYYY-MM-DD (pas toISOString, qui passe en UTC).
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function yearOf(dateOrMonth: string): number {
  return Number(dateOrMonth.slice(0, 4))
}

export function firstDayOfMonth(mois: string): string {
  return `${mois}-01`
}

export function lastDayOfMonth(mois: string): string {
  const [y, m] = mois.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  return `${mois}-${pad(days)}`
}

export function prevMonth(mois: string): string {
  const [y, m] = mois.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`
}

export function nextMonth(mois: string): string {
  const [y, m] = mois.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}
```

- [ ] **Step 11 : Implémenter `src/lib/format.ts`**

```ts
// Arrondi « commercial » robuste aux erreurs flottantes (1.005 → 1.01).
export function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals
  const r = Math.round(Math.abs(x) * f + 1e-6) / f
  return x < 0 ? -r : r
}

export const round1 = (x: number): number => roundTo(x, 1)
export const round2 = (x: number): number => roundTo(x, 2)

// Intl fr-FR produit des espaces insécables (U+202F, U+00A0) : on les normalise.
export function cleanSpaces(s: string): string {
  return s.replace(/[  ]/g, ' ')
}

export function decimalFr(x: number, digits: number): string {
  return roundTo(x, digits).toFixed(digits).replace('.', ',')
}

const kmFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const euroFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const moisFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const jourFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

export function formatKm(km: number | null): string {
  return km == null ? '—' : `${cleanSpaces(kmFmt.format(km))} km`
}

export function formatEuro(x: number): string {
  return cleanSpaces(euroFmt.format(x))
}

// Midi local pour éviter tout décalage de fuseau.
const atNoon = (date: string) => new Date(`${date}T12:00:00`)

export function formatMoisLong(mois: string): string {
  return moisFmt.format(atNoon(`${mois}-01`))
}

export function formatJour(date: string): string {
  return jourFmt.format(atNoon(date))
}

export function formatDateCourte(date: string): string {
  return date.split('-').reverse().join('/')
}
```

- [ ] **Step 12 : Vérifier tests et build**

Run : `npm test && npm run build`
Expected : tests PASS (2 fichiers) ; build OK, dossier `dist/` créé.

- [ ] **Step 13 : Commit**

```bash
git add -A
git commit -m "chore: socle Vite/React/TS/Tailwind + utilitaires dates et format" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 2 : Types du domaine + moteur de barème

**Files :**
- Create : `src/domain/types.ts`, `src/domain/default-bareme.ts`, `src/domain/bareme.ts`
- Test : `src/domain/bareme.test.ts`

**Interfaces :**
- Consumes : `nowISO()` (Task 1).
- Produces :
  - `types.ts` : types `Activite`, `Nature`, `Statut`, `Energie`, `ModeFiscal`, `PlaceRole`, `ExpenseType`, `ExportStatut`, interfaces `BaseRow`, `Vehicle`, `FiscalYear`, `BaremeYear`, `BaremeRate`, `Place`, `Trip`, `TripExpense`, `ExportTotaux`, `ExportRecord`, `TripEvent` ; constantes `ACTIVITES`, `ACTIVITE_LABEL`, `EXPENSE_LABEL`, `ROLE_LABEL`
  - `default-bareme.ts` : `DEFAULT_BAREME_ANNEE = 2026`, `DEFAULT_MAJORATION_ELECTRIQUE = 0.2`, `DEFAULT_BAREME_SOURCE`, `interface RateSeed`, `DEFAULT_RATES: RateSeed[]`, `buildBaremeRows(annee: number, majoration: number, source: string, seeds: RateSeed[]): { year: BaremeYear; rates: BaremeRate[] }`
  - `bareme.ts` : `interface RateSet { annee: number; provisoire: boolean; majoration_electrique: number; rates: BaremeRate[] }`, `selectRateSet(annee: number, years: BaremeYear[], rates: BaremeRate[]): RateSet | null`, `baremeAmount(D: number, cv: number, energie: Energie, set: RateSet): number` (non arrondi)

- [ ] **Step 1 : Créer `src/domain/types.ts`**

```ts
// Types partagés : une interface par table (mêmes noms de colonnes que Supabase).

export type Activite = 'swing_house' | 'lmnp'
export type Nature = 'pro' | 'domicile_travail'
export type Statut = 'brouillon' | 'valide' | 'exporte'
export type Energie = 'thermique' | 'electrique'
export type ModeFiscal = 'bareme' | 'frais_reels'
export type PlaceRole = 'domicile' | 'swing_house' | 'lmnp'
export type ExpenseType = 'peage' | 'parking' | 'autre'
export type ExportStatut = 'emis' | 'a_rectifier' | 'remplace'

export const ACTIVITES: Activite[] = ['swing_house', 'lmnp']

export const ACTIVITE_LABEL: Record<Activite, string> = {
  swing_house: 'Swing House',
  lmnp: 'LMNP',
}

export const EXPENSE_LABEL: Record<ExpenseType, string> = {
  peage: 'Péage',
  parking: 'Parking',
  autre: 'Autre',
}

export const ROLE_LABEL: Record<PlaceRole, string> = {
  domicile: 'Domicile',
  swing_house: 'Swing House',
  lmnp: 'Appartement LMNP',
}

export interface BaseRow {
  id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Vehicle extends BaseRow {
  nom: string
  immatriculation: string
  cv: number
  energie: Energie
  date_debut: string
  date_fin: string | null
}

export interface FiscalYear extends BaseRow {
  annee: number
  activite: Activite
  mode: ModeFiscal
  inclure_domicile_travail: boolean
}

export interface BaremeYear extends BaseRow {
  annee: number
  majoration_electrique: number
  source: string
}

export interface BaremeRate extends BaseRow {
  annee: number
  cv_min: number | null
  cv_max: number | null
  km_min: number
  km_max: number | null
  coef: number
  constante: number
}

export interface Place extends BaseRow {
  label: string
  adresse: string
  google_place_id: string | null
  lat: number | null
  lng: number | null
  role: PlaceRole | null
  last_used_at: string | null
}

export interface Trip extends BaseRow {
  date: string
  activite: Activite
  motif: string
  depart_place_id: string | null
  depart_label: string
  depart_adresse: string
  arrivee_place_id: string | null
  arrivee_label: string
  arrivee_adresse: string
  km_route: number | null // aller simple calculé par Google
  km_saisi: number | null // aller simple corrigé à la main
  justif_km: string | null
  aller_retour: boolean
  km_total: number | null
  vehicle_id: string | null
  nature: Nature | null // null = question domicile–travail sans réponse
  statut: Statut
  brouillon_force: boolean // « Finir plus tard »
  doublon_confirme: boolean // doublon signalé puis confirmé
  montant_bareme: number // figé à l'export ; 0 sinon (calcul à la volée)
  export_id: string | null
}

export interface TripExpense extends BaseRow {
  trip_id: string
  type: ExpenseType
  montant: number
  note: string
}

export interface ExportTotaux {
  km: number
  bareme: number
  frais: number
  total: number
  nb_trajets: number
}

export interface ExportRecord extends BaseRow {
  activite: Activite
  mois: string
  version: number
  statut: ExportStatut
  bareme_annee: number | null
  bareme_provisoire: boolean
  totaux: ExportTotaux
  trip_ids: string[]
}

export interface TripEvent extends BaseRow {
  trip_id: string
  export_id: string | null
  action: 'export' | 'reopen'
  motif: string | null
}
```

- [ ] **Step 2 : Écrire le test du barème (échec attendu)**

`src/domain/bareme.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { baremeAmount, selectRateSet } from './bareme'
import { buildBaremeRows, DEFAULT_RATES } from './default-bareme'

const { year, rates } = buildBaremeRows(2026, 0.2, 'test', DEFAULT_RATES)
const set = selectRateSet(2026, [year], rates)!

describe('selectRateSet', () => {
  it('prend l’année demandée', () => {
    expect(set.annee).toBe(2026)
    expect(set.provisoire).toBe(false)
    expect(set.rates).toHaveLength(15)
  })
  it('se replie sur la dernière année connue, marquée provisoire', () => {
    const s = selectRateSet(2027, [year], rates)!
    expect(s.annee).toBe(2026)
    expect(s.provisoire).toBe(true)
  })
  it('renvoie null sans barème antérieur', () => {
    expect(selectRateSet(2025, [year], rates)).toBeNull()
  })
  it('ignore les lignes supprimées', () => {
    const deleted = { ...year, deleted_at: '2026-01-02T00:00:00.000Z' }
    expect(selectRateSet(2026, [deleted], rates)).toBeNull()
  })
})

describe('baremeAmount — 5 CV thermique', () => {
  it('0 km → 0 €', () => {
    expect(baremeAmount(0, 5, 'thermique', set)).toBe(0)
  })
  it('bornes de la 1re tranche', () => {
    expect(baremeAmount(4999, 5, 'thermique', set)).toBeCloseTo(3179.364, 6)
    expect(baremeAmount(5000, 5, 'thermique', set)).toBeCloseTo(3180, 6)
  })
  it('2e tranche : d × 0,357 + 1 395', () => {
    expect(baremeAmount(5001, 5, 'thermique', set)).toBeCloseTo(3180.357, 6)
    expect(baremeAmount(20000, 5, 'thermique', set)).toBeCloseTo(8535, 6)
  })
  it('3e tranche : d × 0,427', () => {
    expect(baremeAmount(20001, 5, 'thermique', set)).toBeCloseTo(8540.427, 6)
  })
})

describe('baremeAmount — catégories de CV et électrique', () => {
  it('« 3 CV et moins » couvre 2 CV', () => {
    expect(baremeAmount(1000, 2, 'thermique', set)).toBeCloseTo(529, 6)
  })
  it('« 7 CV et plus » couvre 9 CV', () => {
    expect(baremeAmount(1000, 9, 'thermique', set)).toBeCloseTo(697, 6)
  })
  it('électrique : majoration de 20 %', () => {
    expect(baremeAmount(1000, 5, 'electrique', set)).toBeCloseTo(763.2, 6)
  })
})
```

- [ ] **Step 3 : Lancer le test (échec attendu)**

Run : `npx vitest run src/domain/bareme.test.ts`
Expected : FAIL — `Failed to resolve import "./bareme"`.

- [ ] **Step 4 : Créer `src/domain/default-bareme.ts`**

```ts
import { nowISO } from '../lib/dates'
import type { BaremeRate, BaremeYear } from './types'

// Barème 2026 voitures thermiques/hybrides (identique à 2025). Modifiable dans Réglages.
export const DEFAULT_BAREME_ANNEE = 2026
export const DEFAULT_MAJORATION_ELECTRIQUE = 0.2
export const DEFAULT_BAREME_SOURCE = 'Barème kilométrique 2026 (reconduit de 2025)'

export interface RateSeed {
  cv_min: number | null
  cv_max: number | null
  km_min: number
  km_max: number | null
  coef: number
  constante: number
}

// [cv_min, cv_max, coef ≤5000, coef 5001–20000, constante, coef >20000]
const TABLE: [number | null, number | null, number, number, number, number][] = [
  [null, 3, 0.529, 0.316, 1065, 0.37],
  [4, 4, 0.606, 0.34, 1330, 0.407],
  [5, 5, 0.636, 0.357, 1395, 0.427],
  [6, 6, 0.665, 0.374, 1457, 0.447],
  [7, null, 0.697, 0.394, 1515, 0.47],
]

export const DEFAULT_RATES: RateSeed[] = TABLE.flatMap(([cv_min, cv_max, c1, c2, k2, c3]) => [
  { cv_min, cv_max, km_min: 0, km_max: 5000, coef: c1, constante: 0 },
  { cv_min, cv_max, km_min: 5000, km_max: 20000, coef: c2, constante: k2 },
  { cv_min, cv_max, km_min: 20000, km_max: null, coef: c3, constante: 0 },
])

// Construit les lignes d'une année de barème (ids générés côté client).
export function buildBaremeRows(
  annee: number,
  majoration: number,
  source: string,
  seeds: RateSeed[],
): { year: BaremeYear; rates: BaremeRate[] } {
  const now = nowISO()
  const base = () => ({ id: crypto.randomUUID(), created_at: now, updated_at: now, deleted_at: null })
  return {
    year: { ...base(), annee, majoration_electrique: majoration, source },
    rates: seeds.map((s) => ({ ...base(), annee, ...s })),
  }
}
```

- [ ] **Step 5 : Créer `src/domain/bareme.ts`**

```ts
import type { BaremeRate, BaremeYear, Energie } from './types'

export interface RateSet {
  annee: number
  provisoire: boolean // barème d'une année antérieure appliqué faute de mieux
  majoration_electrique: number
  rates: BaremeRate[]
}

// Barème de l'année demandée, sinon le plus récent antérieur (provisoire).
export function selectRateSet(annee: number, years: BaremeYear[], rates: BaremeRate[]): RateSet | null {
  const candidates = years.filter((y) => !y.deleted_at && y.annee <= annee).sort((a, b) => b.annee - a.annee)
  const chosen = candidates[0]
  if (!chosen) return null
  return {
    annee: chosen.annee,
    provisoire: chosen.annee !== annee,
    majoration_electrique: chosen.majoration_electrique,
    rates: rates.filter((r) => !r.deleted_at && r.annee === chosen.annee),
  }
}

// f(D) : montant annuel pour D km avec ce véhicule. Non arrondi.
export function baremeAmount(D: number, cv: number, energie: Energie, set: RateSet): number {
  if (D <= 0) return 0
  const rows = set.rates
    .filter((r) => (r.cv_min ?? -Infinity) <= cv && cv <= (r.cv_max ?? Infinity))
    .sort((a, b) => a.km_min - b.km_min)
  const row = rows.find((r) => r.km_max == null || D <= r.km_max)
  if (!row) throw new Error(`Barème ${set.annee} incomplet pour ${cv} CV`)
  const base = D * row.coef + row.constante
  return energie === 'electrique' ? base * (1 + set.majoration_electrique) : base
}
```

- [ ] **Step 6 : Lancer le test**

Run : `npx vitest run src/domain/bareme.test.ts`
Expected : PASS (11 tests).

- [ ] **Step 7 : Commit**

```bash
git add src/domain
git commit -m "feat: types du domaine et moteur de barème kilométrique" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 3 : Règles des trajets (véhicule, km, motif, nature, statut, doublon)

**Files :**
- Create : `src/domain/rules.ts`, `src/test/fixtures.ts`
- Test : `src/domain/rules.test.ts`

**Interfaces :**
- Consumes : types (Task 2), `round1` (Task 1).
- Produces (`rules.ts`) :
  - `interface FiscalSettings { mode: ModeFiscal; inclure_domicile_travail: boolean }`
  - `interface RuleCtx { vehicles: Vehicle[]; places: Place[] }`
  - `MOTIF_MIN = 12`
  - `resolveVehicle(date: string, vehicles: Vehicle[]): Vehicle | null`
  - `kmTotal(km_route: number | null, km_saisi: number | null, aller_retour: boolean): number | null`
  - `normalizeMotif(m: string): string`, `validateMotif(motif: string): string | null`
  - `roleOf(placeId: string | null, places: Place[]): PlaceRole | null`
  - `isDomicileTravailCandidate(activite: Activite, departRole: PlaceRole | null, arriveeRole: PlaceRole | null): boolean`
  - `fiscalSettings(annee: number, activite: Activite, fiscalYears: FiscalYear[]): FiscalSettings`
  - `isExcludedDomicileTravail(trip: Trip, settings: FiscalSettings): boolean`
  - `tripCounts(trip: Trip, settings: FiscalSettings): boolean`
  - `missingReasons(trip: Trip, ctx: RuleCtx): string[]`, `computeStatut(trip: Trip, ctx: RuleCtx): Statut`
  - `findDuplicate(trip: Trip, trips: Trip[]): Trip | null`
- Produces (`src/test/fixtures.ts`, utilisé par tous les tests suivants) : `makeVehicle`, `makePlace`, `makeTrip`, `makeFiscalYear`, `makeExpense`, `makeExport`, `defaultBareme()` — chacune `(overrides?: Partial<T>) => T`.

- [ ] **Step 1 : Créer `src/test/fixtures.ts`**

```ts
import { buildBaremeRows, DEFAULT_RATES } from '../domain/default-bareme'
import type { ExportRecord, FiscalYear, Place, Trip, TripExpense, Vehicle } from '../domain/types'

const T0 = '2026-01-01T00:00:00.000Z'
let seq = 0
const id = (prefix: string) => `${prefix}-${++seq}`
const base = (prefix: string) => ({ id: id(prefix), created_at: T0, updated_at: T0, deleted_at: null })

export function makeVehicle(o: Partial<Vehicle> = {}): Vehicle {
  return { ...base('veh'), nom: 'Voiture actuelle', immatriculation: 'AA-123-BB', cv: 5, energie: 'thermique', date_debut: '2020-01-01', date_fin: null, ...o }
}

export function makePlace(o: Partial<Place> = {}): Place {
  return { ...base('place'), label: 'Lieu', adresse: 'Adresse', google_place_id: 'gp', lat: 45.9, lng: 6.8, role: null, last_used_at: null, ...o }
}

export function makeTrip(o: Partial<Trip> = {}): Trip {
  return {
    ...base('trip'),
    date: '2026-09-15',
    activite: 'swing_house',
    motif: 'Rendez-vous fournisseur matériel TrackMan',
    depart_place_id: 'p-dom',
    depart_label: 'Domicile',
    depart_adresse: 'Servoz',
    arrivee_place_id: 'p-client',
    arrivee_label: 'Client',
    arrivee_adresse: 'Chamonix',
    km_route: 10,
    km_saisi: null,
    justif_km: null,
    aller_retour: false,
    km_total: 10,
    vehicle_id: 'veh-A',
    nature: 'pro',
    statut: 'valide',
    brouillon_force: false,
    doublon_confirme: false,
    montant_bareme: 0,
    export_id: null,
    ...o,
  }
}

export function makeFiscalYear(o: Partial<FiscalYear> = {}): FiscalYear {
  return { ...base('fy'), annee: 2026, activite: 'swing_house', mode: 'bareme', inclure_domicile_travail: false, ...o }
}

export function makeExpense(o: Partial<TripExpense> = {}): TripExpense {
  return { ...base('exp'), trip_id: 'trip-x', type: 'peage', montant: 5, note: '', ...o }
}

export function makeExport(o: Partial<ExportRecord> = {}): ExportRecord {
  return {
    ...base('export'),
    activite: 'swing_house',
    mois: '2026-09',
    version: 1,
    statut: 'emis',
    bareme_annee: 2026,
    bareme_provisoire: false,
    totaux: { km: 0, bareme: 0, frais: 0, total: 0, nb_trajets: 0 },
    trip_ids: [],
    ...o,
  }
}

export function defaultBareme() {
  return buildBaremeRows(2026, 0.2, 'test', DEFAULT_RATES)
}
```

- [ ] **Step 2 : Écrire les tests (échec attendu)**

`src/domain/rules.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { makeFiscalYear, makePlace, makeTrip, makeVehicle } from '../test/fixtures'
import {
  computeStatut, findDuplicate, fiscalSettings, isDomicileTravailCandidate, kmTotal,
  missingReasons, resolveVehicle, tripCounts, validateMotif,
} from './rules'

const ancienne = makeVehicle({ id: 'veh-A', date_debut: '2020-01-01', date_fin: '2026-12-14' })
const nouvelle = makeVehicle({ id: 'veh-B', date_debut: '2026-12-15', date_fin: null })
const dom = makePlace({ id: 'p-dom', role: 'domicile' })
const sh = makePlace({ id: 'p-sh', role: 'swing_house' })
const client = makePlace({ id: 'p-client' })
const ctx = { vehicles: [ancienne, nouvelle], places: [dom, sh, client] }

describe('resolveVehicle', () => {
  it('choisit le véhicule actif à la date, bornes incluses', () => {
    expect(resolveVehicle('2026-12-14', ctx.vehicles)?.id).toBe('veh-A')
    expect(resolveVehicle('2026-12-15', ctx.vehicles)?.id).toBe('veh-B')
    expect(resolveVehicle('2019-06-01', ctx.vehicles)).toBeNull()
  })
  it('ignore les véhicules supprimés', () => {
    expect(resolveVehicle('2027-01-01', [{ ...nouvelle, deleted_at: 'x' }])).toBeNull()
  })
})

describe('kmTotal', () => {
  it('prend le km saisi en priorité et double l’aller-retour', () => {
    expect(kmTotal(12.3, null, false)).toBe(12.3)
    expect(kmTotal(12.3, null, true)).toBe(24.6)
    expect(kmTotal(12.3, 14, true)).toBe(28)
    expect(kmTotal(null, null, true)).toBeNull()
  })
})

describe('validateMotif', () => {
  it('refuse trop court', () => {
    expect(validateMotif('  Client X ')).not.toBeNull()
  })
  it('refuse les motifs génériques même longs', () => {
    expect(validateMotif('Déplacement professionnel')).not.toBeNull()
    expect(validateMotif('déplacement pro !!')).not.toBeNull()
  })
  it('accepte un motif précis', () => {
    expect(validateMotif('Réunion fournisseur TrackMan à Annecy')).toBeNull()
  })
})

describe('domicile–travail', () => {
  it('ne concerne que Swing House entre domicile et Swing House, dans les deux sens', () => {
    expect(isDomicileTravailCandidate('swing_house', 'domicile', 'swing_house')).toBe(true)
    expect(isDomicileTravailCandidate('swing_house', 'swing_house', 'domicile')).toBe(true)
    expect(isDomicileTravailCandidate('lmnp', 'domicile', 'swing_house')).toBe(false)
    expect(isDomicileTravailCandidate('swing_house', 'domicile', 'lmnp')).toBe(false)
  })
  it('exclu par défaut, compté si le réglage de l’année l’inclut', () => {
    const t = makeTrip({ nature: 'domicile_travail' })
    expect(tripCounts(t, fiscalSettings(2026, 'swing_house', []))).toBe(false)
    const fy = makeFiscalYear({ inclure_domicile_travail: true })
    expect(tripCounts(t, fiscalSettings(2026, 'swing_house', [fy]))).toBe(true)
  })
  it('mode frais réels : aucun trajet ne compte au barème', () => {
    const fy = makeFiscalYear({ mode: 'frais_reels' })
    expect(tripCounts(makeTrip(), fiscalSettings(2026, 'swing_house', [fy]))).toBe(false)
  })
})

describe('statut', () => {
  it('trajet complet → valide', () => {
    expect(computeStatut(makeTrip({ statut: 'brouillon' }), ctx)).toBe('valide')
  })
  it('km non calculés → brouillon', () => {
    const t = makeTrip({ km_route: null, km_total: null, statut: 'brouillon' })
    expect(missingReasons(t, ctx)).toContain('Km non calculés')
    expect(computeStatut(t, ctx)).toBe('brouillon')
  })
  it('km corrigé sans justification → brouillon', () => {
    const t = makeTrip({ km_saisi: 14, km_total: 14 })
    expect(missingReasons(t, ctx)).toContain('Justification des km corrigés manquante')
  })
  it('question domicile–travail sans réponse → brouillon', () => {
    const t = makeTrip({ depart_place_id: 'p-dom', arrivee_place_id: 'p-sh', nature: null })
    expect(missingReasons(t, ctx)).toContain('Préciser : trajet domicile–travail ou déplacement pro')
  })
  it('aucun véhicule à la date → brouillon', () => {
    expect(missingReasons(makeTrip({ date: '2019-01-01' }), ctx)).toContain('Aucun véhicule à cette date')
  })
  it('« Finir plus tard » force le brouillon ; exporté reste exporté', () => {
    expect(computeStatut(makeTrip({ brouillon_force: true }), ctx)).toBe('brouillon')
    expect(computeStatut(makeTrip({ statut: 'exporte', km_total: null }), ctx)).toBe('exporte')
  })
})

describe('findDuplicate', () => {
  it('même date, activité, départ et arrivée', () => {
    const a = makeTrip()
    const b = makeTrip()
    expect(findDuplicate(b, [a, b])?.id).toBe(a.id)
    expect(findDuplicate(makeTrip({ date: '2026-09-16' }), [a])).toBeNull()
    expect(findDuplicate(makeTrip({ activite: 'lmnp' }), [a])).toBeNull()
    expect(findDuplicate(b, [{ ...a, deleted_at: 'x' }, b])).toBeNull()
  })
})
```

- [ ] **Step 3 : Lancer (échec attendu)**

Run : `npx vitest run src/domain/rules.test.ts`
Expected : FAIL — `Failed to resolve import "./rules"`.

- [ ] **Step 4 : Implémenter `src/domain/rules.ts`**

```ts
import { round1 } from '../lib/format'
import type { Activite, FiscalYear, ModeFiscal, Place, PlaceRole, Statut, Trip, Vehicle } from './types'

export interface FiscalSettings {
  mode: ModeFiscal
  inclure_domicile_travail: boolean
}

export interface RuleCtx {
  vehicles: Vehicle[]
  places: Place[]
}

export const MOTIF_MIN = 12

// Motifs refusés quand ils sont seuls (comparés après normalisation).
const GENERIQUES = new Set([
  'deplacement', 'deplacements', 'deplacement pro', 'deplacement professionnel',
  'trajet', 'trajet pro', 'trajet professionnel', 'rdv', 'rendez vous',
  'reunion', 'visite', 'course', 'courses', 'divers',
])

export function resolveVehicle(date: string, vehicles: Vehicle[]): Vehicle | null {
  return (
    vehicles.find((v) => !v.deleted_at && v.date_debut <= date && (v.date_fin == null || date <= v.date_fin)) ?? null
  )
}

export function kmTotal(km_route: number | null, km_saisi: number | null, aller_retour: boolean): number | null {
  const aller = km_saisi ?? km_route
  if (aller == null) return null
  return round1(aller * (aller_retour ? 2 : 1))
}

export function normalizeMotif(m: string): string {
  return m
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function validateMotif(motif: string): string | null {
  const t = motif.trim()
  if (t.length < MOTIF_MIN) return `Motif trop court (${MOTIF_MIN} caractères minimum) : qui, quoi, où.`
  if (GENERIQUES.has(normalizeMotif(t))) return 'Motif trop générique : précise l’objet du déplacement.'
  return null
}

export function roleOf(placeId: string | null, places: Place[]): PlaceRole | null {
  if (!placeId) return null
  return places.find((p) => p.id === placeId && !p.deleted_at)?.role ?? null
}

export function isDomicileTravailCandidate(
  activite: Activite,
  departRole: PlaceRole | null,
  arriveeRole: PlaceRole | null,
): boolean {
  if (activite !== 'swing_house') return false
  return (
    (departRole === 'domicile' && arriveeRole === 'swing_house') ||
    (departRole === 'swing_house' && arriveeRole === 'domicile')
  )
}

// Choix fiscal de l'année ; défauts : barème, domicile–travail exclu.
export function fiscalSettings(annee: number, activite: Activite, fiscalYears: FiscalYear[]): FiscalSettings {
  const fy = fiscalYears.find((f) => !f.deleted_at && f.annee === annee && f.activite === activite)
  return { mode: fy?.mode ?? 'bareme', inclure_domicile_travail: fy?.inclure_domicile_travail ?? false }
}

export function isExcludedDomicileTravail(trip: Trip, settings: FiscalSettings): boolean {
  return trip.nature === 'domicile_travail' && !settings.inclure_domicile_travail
}

// Le trajet entre-t-il dans la chaîne du barème ?
export function tripCounts(trip: Trip, settings: FiscalSettings): boolean {
  if (trip.deleted_at) return false
  if (settings.mode !== 'bareme') return false
  return !isExcludedDomicileTravail(trip, settings)
}

export function missingReasons(trip: Trip, ctx: RuleCtx): string[] {
  const reasons: string[] = []
  const motifError = validateMotif(trip.motif)
  if (motifError) reasons.push(motifError)
  if (!trip.depart_place_id) reasons.push('Départ manquant')
  if (!trip.arrivee_place_id) reasons.push('Arrivée manquante')
  if (trip.km_total == null) reasons.push('Km non calculés')
  const corrige = trip.km_saisi != null && (trip.km_route == null || trip.km_saisi !== trip.km_route)
  if (corrige && !trip.justif_km?.trim()) reasons.push('Justification des km corrigés manquante')
  if (!resolveVehicle(trip.date, ctx.vehicles)) reasons.push('Aucun véhicule à cette date')
  const candidat = isDomicileTravailCandidate(
    trip.activite,
    roleOf(trip.depart_place_id, ctx.places),
    roleOf(trip.arrivee_place_id, ctx.places),
  )
  if (candidat && trip.nature == null) reasons.push('Préciser : trajet domicile–travail ou déplacement pro')
  return reasons
}

export function computeStatut(trip: Trip, ctx: RuleCtx): Statut {
  if (trip.statut === 'exporte') return 'exporte'
  if (trip.brouillon_force) return 'brouillon'
  return missingReasons(trip, ctx).length === 0 ? 'valide' : 'brouillon'
}

export function findDuplicate(trip: Trip, trips: Trip[]): Trip | null {
  if (!trip.depart_place_id || !trip.arrivee_place_id) return null
  return (
    trips.find(
      (t) =>
        t.id !== trip.id &&
        !t.deleted_at &&
        t.date === trip.date &&
        t.activite === trip.activite &&
        t.depart_place_id === trip.depart_place_id &&
        t.arrivee_place_id === trip.arrivee_place_id,
    ) ?? null
  )
}
```

- [ ] **Step 5 : Lancer les tests**

Run : `npx vitest run src/domain/rules.test.ts`
Expected : PASS (16 tests).

- [ ] **Step 6 : Commit**

```bash
git add src/domain/rules.ts src/domain/rules.test.ts src/test/fixtures.ts
git commit -m "feat: règles des trajets (véhicule, km, motif, domicile–travail, statut, doublon)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 4 : Chaîne de calcul (montants par trajet)

**Files :**
- Create : `src/domain/chain.ts`
- Test : `src/domain/chain.test.ts`

**Interfaces :**
- Consumes : `selectRateSet`, `baremeAmount` (Task 2) ; `fiscalSettings`, `tripCounts` (Task 3) ; `yearOf` (Task 1) ; `round1`, `round2` (Task 1) ; fixtures (Task 3).
- Produces :
  - `interface CalcData { trips: Trip[]; expenses: TripExpense[]; vehicles: Vehicle[]; fiscalYears: FiscalYear[]; baremeYears: BaremeYear[]; rates: BaremeRate[] }`
  - `interface TripCalc { montant_bareme: number; frais: number; total: number; compte: boolean; bareme_annee: number | null; provisoire: boolean }`
  - `groupKey(vehicleId: string, activite: Activite, annee: number): string`
  - `computeAll(data: CalcData): Map<string, TripCalc>` (clé = id du trajet, trajets supprimés absents)
  - `cumulKm(data: CalcData, vehicleId: string, activite: Activite, annee: number, untilDate: string, inclusive: boolean): number`

- [ ] **Step 1 : Écrire les tests (échec attendu)**

`src/domain/chain.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { defaultBareme, makeExpense, makeFiscalYear, makeTrip, makeVehicle } from '../test/fixtures'
import { round2 } from '../lib/format'
import { computeAll, cumulKm, type CalcData } from './chain'
import type { Trip } from './types'

const { year, rates } = defaultBareme()
const vA = makeVehicle({ id: 'veh-A', cv: 5 })
const vB = makeVehicle({ id: 'veh-B', cv: 4, date_debut: '2026-12-15' })

function data(trips: Trip[], extra: Partial<CalcData> = {}): CalcData {
  return { trips, expenses: [], vehicles: [vA, vB], fiscalYears: [], baremeYears: [year], rates, ...extra }
}
const sum = (m: Map<string, { montant_bareme: number }>) => round2([...m.values()].reduce((s, c) => s + c.montant_bareme, 0))

describe('computeAll', () => {
  it('un trajet de 100 km en 5 CV → 63,60 €', () => {
    const t = makeTrip({ km_total: 100 })
    expect(computeAll(data([t])).get(t.id)?.montant_bareme).toBe(63.6)
  })

  it('somme télescopique : 6 000 km au total = barème annuel exact', () => {
    const trips = Array.from({ length: 60 }, (_, i) =>
      makeTrip({ km_total: 100, date: `2026-${String(1 + Math.floor(i / 6)).padStart(2, '0')}-10` }),
    )
    expect(sum(computeAll(data(trips)))).toBe(3537) // 6000 × 0,357 + 1395
  })

  it('l’ordre d’entrée ne change rien : les trajets sont chaînés par date', () => {
    const tot = makeTrip({ km_total: 5000, date: '2026-03-01' })
    const tard = makeTrip({ km_total: 100, date: '2026-09-01' })
    const m = computeAll(data([tard, tot]))
    expect(m.get(tot.id)?.montant_bareme).toBe(3180)
    expect(m.get(tard.id)?.montant_bareme).toBe(35.7) // f(5100) − f(5000)
  })

  it('les trajets exportés restent figés et servent de base au cumul', () => {
    const exporte = makeTrip({ km_total: 5000, date: '2026-10-01', statut: 'exporte', montant_bareme: 3180, export_id: 'e1' })
    const rouvert = makeTrip({ km_total: 100, date: '2026-09-01', statut: 'valide' })
    const m = computeAll(data([exporte, rouvert]))
    expect(m.get(exporte.id)?.montant_bareme).toBe(3180)
    expect(m.get(rouvert.id)?.montant_bareme).toBe(35.7)
  })

  it('changement de véhicule : une chaîne par véhicule', () => {
    const a = makeTrip({ km_total: 3000, vehicle_id: 'veh-A', date: '2026-06-01' })
    const b = makeTrip({ km_total: 3000, vehicle_id: 'veh-B', date: '2026-12-20' })
    const m = computeAll(data([a, b]))
    expect(m.get(a.id)?.montant_bareme).toBe(1908) // 3000 × 0,636
    expect(m.get(b.id)?.montant_bareme).toBe(1818) // 3000 × 0,606
  })

  it('cumul séparé par activité', () => {
    const sh = makeTrip({ km_total: 3000, activite: 'swing_house' })
    const lmnp = makeTrip({ km_total: 3000, activite: 'lmnp' })
    const m = computeAll(data([sh, lmnp]))
    expect(m.get(sh.id)?.montant_bareme).toBe(1908)
    expect(m.get(lmnp.id)?.montant_bareme).toBe(1908)
  })

  it('le cumul repart à zéro au 1er janvier ; barème de l’année suivante provisoire', () => {
    const y1 = makeTrip({ km_total: 6000, date: '2026-12-01' })
    const y2 = makeTrip({ km_total: 100, date: '2027-01-05' })
    const c = computeAll(data([y1, y2])).get(y2.id)!
    expect(c.montant_bareme).toBe(63.6)
    expect(c.provisoire).toBe(true)
    expect(c.bareme_annee).toBe(2026)
  })

  it('domicile–travail exclu : 0 € et hors cumul', () => {
    const dt = makeTrip({ km_total: 5000, nature: 'domicile_travail', date: '2026-02-01' })
    const pro = makeTrip({ km_total: 100, date: '2026-03-01' })
    const m = computeAll(data([dt, pro]))
    expect(m.get(dt.id)).toMatchObject({ montant_bareme: 0, compte: false })
    expect(m.get(pro.id)?.montant_bareme).toBe(63.6)
  })

  it('domicile–travail inclus par réglage : compté', () => {
    const dt = makeTrip({ km_total: 100, nature: 'domicile_travail' })
    const fy = makeFiscalYear({ inclure_domicile_travail: true })
    expect(computeAll(data([dt], { fiscalYears: [fy] })).get(dt.id)?.montant_bareme).toBe(63.6)
  })

  it('frais annexes toujours ajoutés, même en mode frais réels', () => {
    const t = makeTrip({ km_total: 100 })
    const expenses = [makeExpense({ trip_id: t.id, montant: 5.2 }), makeExpense({ trip_id: t.id, type: 'parking', montant: 3 })]
    expect(computeAll(data([t], { expenses })).get(t.id)).toMatchObject({ montant_bareme: 63.6, frais: 8.2, total: 71.8 })
    const fy = makeFiscalYear({ mode: 'frais_reels' })
    expect(computeAll(data([t], { expenses, fiscalYears: [fy] })).get(t.id)).toMatchObject({ montant_bareme: 0, total: 8.2 })
  })

  it('km inconnus → 0 € et non compté ; trajets supprimés absents', () => {
    const t = makeTrip({ km_total: null, statut: 'brouillon' })
    const del = makeTrip({ deleted_at: '2026-09-16T00:00:00.000Z' })
    const m = computeAll(data([t, del]))
    expect(m.get(t.id)).toMatchObject({ montant_bareme: 0, compte: false })
    expect(m.has(del.id)).toBe(false)
  })
})

describe('cumulKm', () => {
  it('cumul du groupe jusqu’à une date, incluse ou non', () => {
    const d = data([
      makeTrip({ km_total: 100, date: '2026-09-01' }),
      makeTrip({ km_total: 50, date: '2026-09-20' }),
      makeTrip({ km_total: 30, date: '2026-10-02' }),
      makeTrip({ km_total: 999, date: '2026-09-05', nature: 'domicile_travail' }),
    ])
    expect(cumulKm(d, 'veh-A', 'swing_house', 2026, '2026-09-20', true)).toBe(150)
    expect(cumulKm(d, 'veh-A', 'swing_house', 2026, '2026-09-20', false)).toBe(100)
  })
})
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run : `npx vitest run src/domain/chain.test.ts`
Expected : FAIL — `Failed to resolve import "./chain"`.

- [ ] **Step 3 : Implémenter `src/domain/chain.ts`**

```ts
import { yearOf } from '../lib/dates'
import { round1, round2 } from '../lib/format'
import { baremeAmount, selectRateSet } from './bareme'
import { fiscalSettings, tripCounts } from './rules'
import type { Activite, BaremeRate, BaremeYear, FiscalYear, Trip, TripExpense, Vehicle } from './types'

export interface CalcData {
  trips: Trip[]
  expenses: TripExpense[]
  vehicles: Vehicle[]
  fiscalYears: FiscalYear[]
  baremeYears: BaremeYear[]
  rates: BaremeRate[]
}

export interface TripCalc {
  montant_bareme: number
  frais: number
  total: number
  compte: boolean // entre dans la chaîne du barème
  bareme_annee: number | null
  provisoire: boolean
}

export function groupKey(vehicleId: string, activite: Activite, annee: number): string {
  return `${vehicleId}|${activite}|${annee}`
}

const byDate = (a: Trip, b: Trip) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)

// Montant de chaque trajet. Chaîne par (véhicule, activité, année) :
// montant = round2(f(C + km)) − round2(f(C)), les trajets exportés (figés) formant la base C.
// La somme d'un groupe vaut donc toujours round2(f(total km)).
export function computeAll(data: CalcData): Map<string, TripCalc> {
  const out = new Map<string, TripCalc>()
  const vehicles = new Map(data.vehicles.filter((v) => !v.deleted_at).map((v) => [v.id, v]))
  const frais = new Map<string, number>()
  for (const e of data.expenses) {
    if (!e.deleted_at) frais.set(e.trip_id, (frais.get(e.trip_id) ?? 0) + e.montant)
  }

  const groups = new Map<string, Trip[]>()
  for (const t of data.trips) {
    if (t.deleted_at) continue
    const annee = yearOf(t.date)
    const set = selectRateSet(annee, data.baremeYears, data.rates)
    const settings = fiscalSettings(annee, t.activite, data.fiscalYears)
    const compte = tripCounts(t, settings) && t.km_total != null && t.vehicle_id != null && vehicles.has(t.vehicle_id)
    const f = round2(frais.get(t.id) ?? 0)
    const montant = t.statut === 'exporte' ? t.montant_bareme : 0
    out.set(t.id, {
      montant_bareme: montant,
      frais: f,
      total: round2(montant + f),
      compte,
      bareme_annee: set?.annee ?? null,
      provisoire: set?.provisoire ?? false,
    })
    if (compte) {
      const key = groupKey(t.vehicle_id!, t.activite, annee)
      groups.set(key, [...(groups.get(key) ?? []), t])
    }
  }

  for (const members of groups.values()) {
    const first = members[0]
    const set = selectRateSet(yearOf(first.date), data.baremeYears, data.rates)
    const vehicle = vehicles.get(first.vehicle_id!)!
    if (!set) continue
    try {
      const f = (D: number) => round2(baremeAmount(D, vehicle.cv, vehicle.energie, set))
      let C = members.filter((t) => t.statut === 'exporte').reduce((s, t) => s + t.km_total!, 0)
      for (const t of members.filter((m) => m.statut !== 'exporte').sort(byDate)) {
        const montant = round2(f(C + t.km_total!) - f(C))
        C += t.km_total!
        const calc = out.get(t.id)!
        out.set(t.id, { ...calc, montant_bareme: montant, total: round2(montant + calc.frais) })
      }
    } catch {
      // Barème incomplet pour ce CV : montants laissés à 0 (signalé dans Réglages).
    }
  }
  return out
}

// Km comptés d'un groupe jusqu'à une date (pour l'en-tête des exports).
export function cumulKm(
  data: CalcData,
  vehicleId: string,
  activite: Activite,
  annee: number,
  untilDate: string,
  inclusive: boolean,
): number {
  const settings = fiscalSettings(annee, activite, data.fiscalYears)
  const km = data.trips
    .filter(
      (t) =>
        t.vehicle_id === vehicleId &&
        t.activite === activite &&
        yearOf(t.date) === annee &&
        t.km_total != null &&
        (inclusive ? t.date <= untilDate : t.date < untilDate) &&
        tripCounts(t, settings),
    )
    .reduce((s, t) => s + t.km_total!, 0)
  return round1(km)
}
```

- [ ] **Step 4 : Lancer les tests**

Run : `npx vitest run src/domain/chain.test.ts`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/domain/chain.ts src/domain/chain.test.ts
git commit -m "feat: chaîne de calcul du barème (somme télescopique, montants figés)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 5 : Périmètre d'un export et données d'export

**Files :**
- Create : `src/export/select.ts`, `src/export/build.ts`
- Test : `src/export/select.test.ts`, `src/export/build.test.ts`

**Interfaces :**
- Consumes : `CalcData`, `TripCalc`, `computeAll`, `cumulKm` (Task 4) ; `fiscalSettings`, `isExcludedDomicileTravail` (Task 3) ; `lastDayOfMonth`, `firstDayOfMonth`, `monthOf`, `yearOf` (Task 1) ; `formatEuro`, `formatMoisLong`, `round1`, `round2` (Task 1) ; `BENEFICIAIRE` (Task 1).
- Produces :
  - `select.ts` : `latestExport(exports: ExportRecord[], activite: Activite, mois: string): ExportRecord | null`, `exportBlockReason(exports, activite, mois): string | null`, `nextVersion(exports, activite, mois): number`, `tripsForExport(trips: Trip[], exports: ExportRecord[], activite: Activite, mois: string): Trip[]`, `draftsForExport(trips: Trip[], activite: Activite, mois: string): Trip[]`, `tripsOfExport(trips: Trip[], exportId: string): Trip[]`
  - `build.ts` : `TITRES_EXPORT: Record<Activite, string>`, `interface LigneExport`, `interface VehiculeExport`, `interface ExportData`, `buildExportData(args: BuildArgs): ExportData`, `rpcTripsPayload(d: ExportData): { id: string; montant_bareme: number }[]`

- [ ] **Step 1 : Tests du périmètre (échec attendu)**

`src/export/select.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { makeExport, makeTrip } from '../test/fixtures'
import { draftsForExport, exportBlockReason, nextVersion, tripsForExport } from './select'

describe('tripsForExport', () => {
  const sept = makeTrip({ date: '2026-09-10' })
  const aout = makeTrip({ date: '2026-08-28' }) // rattrapage
  const oct = makeTrip({ date: '2026-10-01' })
  const brouillon = makeTrip({ date: '2026-09-12', statut: 'brouillon' })
  const lmnp = makeTrip({ date: '2026-09-11', activite: 'lmnp' })
  const deja = makeTrip({ date: '2026-09-02', statut: 'exporte', export_id: 'e-old' })
  const all = [sept, aout, oct, brouillon, lmnp, deja]

  it('validés non exportés de l’activité, datés jusqu’à la fin du mois, triés par date', () => {
    expect(tripsForExport(all, [], 'swing_house', '2026-09').map((t) => t.id)).toEqual([aout.id, sept.id])
  })
  it('rectificatif : reprend les trajets encore verrouillés de la version à rectifier', () => {
    const e = makeExport({ id: 'e-old', statut: 'a_rectifier' })
    expect(tripsForExport(all, [e], 'swing_house', '2026-09').map((t) => t.id)).toEqual([aout.id, deja.id, sept.id])
  })
  it('brouillons signalés à part', () => {
    expect(draftsForExport(all, 'swing_house', '2026-09').map((t) => t.id)).toEqual([brouillon.id])
  })
})

describe('versions', () => {
  it('bloque un mois déjà émis, autorise après réouverture', () => {
    const v1 = makeExport({ version: 1, statut: 'emis' })
    expect(exportBlockReason([v1], 'swing_house', '2026-09')).toMatch(/Déjà exporté/)
    expect(exportBlockReason([{ ...v1, statut: 'a_rectifier' }], 'swing_house', '2026-09')).toBeNull()
    expect(nextVersion([v1], 'swing_house', '2026-09')).toBe(2)
    expect(nextVersion([], 'lmnp', '2026-09')).toBe(1)
  })
})
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run : `npx vitest run src/export/select.test.ts`
Expected : FAIL — `Failed to resolve import "./select"`.

- [ ] **Step 3 : Implémenter `src/export/select.ts`**

```ts
import { lastDayOfMonth } from '../lib/dates'
import type { Activite, ExportRecord, Trip } from '../domain/types'

const byDate = (a: Trip, b: Trip) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)

export function latestExport(exports: ExportRecord[], activite: Activite, mois: string): ExportRecord | null {
  return (
    exports
      .filter((e) => !e.deleted_at && e.activite === activite && e.mois === mois)
      .sort((a, b) => b.version - a.version)[0] ?? null
  )
}

export function exportBlockReason(exports: ExportRecord[], activite: Activite, mois: string): string | null {
  const last = latestExport(exports, activite, mois)
  if (last?.statut === 'emis') {
    return `Déjà exporté (v${last.version}). Un trajet oublié partira au prochain export.`
  }
  return null
}

export function nextVersion(exports: ExportRecord[], activite: Activite, mois: string): number {
  return (latestExport(exports, activite, mois)?.version ?? 0) + 1
}

// Validés non exportés datés ≤ fin du mois (rattrapages compris) + trajets encore
// verrouillés de la version « à rectifier » le cas échéant.
export function tripsForExport(trips: Trip[], exports: ExportRecord[], activite: Activite, mois: string): Trip[] {
  const fin = lastDayOfMonth(mois)
  const last = latestExport(exports, activite, mois)
  const rectif = last?.statut === 'a_rectifier' ? last.id : null
  return trips
    .filter(
      (t) =>
        !t.deleted_at &&
        t.activite === activite &&
        ((t.statut === 'valide' && t.export_id == null && t.date <= fin) ||
          (rectif != null && t.statut === 'exporte' && t.export_id === rectif)),
    )
    .sort(byDate)
}

export function draftsForExport(trips: Trip[], activite: Activite, mois: string): Trip[] {
  const fin = lastDayOfMonth(mois)
  return trips.filter((t) => !t.deleted_at && t.activite === activite && t.statut === 'brouillon' && t.date <= fin).sort(byDate)
}

export function tripsOfExport(trips: Trip[], exportId: string): Trip[] {
  return trips.filter((t) => !t.deleted_at && t.export_id === exportId).sort(byDate)
}
```

- [ ] **Step 4 : Tests de construction (échec attendu)**

`src/export/build.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { computeAll, type CalcData } from '../domain/chain'
import { defaultBareme, makeExpense, makeTrip, makeVehicle } from '../test/fixtures'
import { buildExportData, rpcTripsPayload } from './build'

const { year, rates } = defaultBareme()
const v = makeVehicle({ id: 'veh-A', nom: 'Golf', immatriculation: 'AB-123-CD', cv: 5 })
const avant = makeTrip({ km_total: 200, date: '2026-07-01', statut: 'exporte', montant_bareme: 127.2, export_id: 'e7' })
const aout = makeTrip({ km_total: 100, date: '2026-08-30' })
const sept = makeTrip({ km_total: 50, date: '2026-09-10', motif: 'Visite fournisseur simulateurs à Annecy' })
const dt = makeTrip({ km_total: 30, date: '2026-09-11', nature: 'domicile_travail' })
const expenses = [makeExpense({ trip_id: sept.id, type: 'peage', montant: 4.6, note: 'A40' })]
const data: CalcData = { trips: [avant, aout, sept, dt], expenses, vehicles: [v], fiscalYears: [], baremeYears: [year], rates }
const calc = computeAll(data)
const d = buildExportData({
  activite: 'swing_house', mois: '2026-09', version: 1, selection: [aout, sept, dt], data, calc, genere_le: '2026-10-01',
})

describe('buildExportData', () => {
  it('sépare les lignes remboursables et le « pour mémoire » domicile–travail', () => {
    expect(d.lignes.map((l) => l.trip_id)).toEqual([aout.id, sept.id])
    expect(d.pourMemoire.map((l) => l.trip_id)).toEqual([dt.id])
    expect(d.pourMemoire[0].montant_bareme).toBe(0)
  })
  it('marque les rattrapages avec leur mois d’origine', () => {
    expect(d.lignes[0].rattrapage).toBe('août 2026')
    expect(d.lignes[1].rattrapage).toBeNull()
  })
  it('détaille les frais et calcule les totaux', () => {
    expect(d.lignes[1].frais_detail).toBe('Péage 4,60 € (A40)')
    expect(d.totaux).toEqual({ km: 150, bareme: 95.4, frais: 4.6, total: 100, nb_trajets: 2 })
  })
  it('en-tête : titre, véhicule et cumul annuel avant/après le mois', () => {
    expect(d.titre).toBe('Swing House SAS — Note de frais kilométriques')
    expect(d.vehicules).toEqual([
      { nom: 'Golf', immatriculation: 'AB-123-CD', cv: 5, energie: 'thermique', cumulAvant: 300, cumulApres: 350 },
    ])
    expect(d.bareme_annee).toBe(2026)
    expect(d.bareme_provisoire).toBe(false)
  })
  it('payload RPC : toutes les lignes, pour mémoire compris', () => {
    expect(rpcTripsPayload(d)).toEqual([
      { id: aout.id, montant_bareme: 63.6 },
      { id: sept.id, montant_bareme: 31.8 },
      { id: dt.id, montant_bareme: 0 },
    ])
  })
})
```

Note : `aout` 100 km → f(300) − f(200) = 190,80 − 127,20 = 63,60 ; `sept` 50 km → f(350) − f(300) = 222,60 − 190,80 = 31,80.

- [ ] **Step 5 : Lancer (échec attendu)**

Run : `npx vitest run src/export/build.test.ts`
Expected : FAIL — `Failed to resolve import "./build"`.

- [ ] **Step 6 : Implémenter `src/export/build.ts`**

```ts
import { BENEFICIAIRE } from '../config'
import { cumulKm, type CalcData, type TripCalc } from '../domain/chain'
import { fiscalSettings, isExcludedDomicileTravail } from '../domain/rules'
import { EXPENSE_LABEL, type Activite, type Energie, type ExportTotaux, type ModeFiscal, type Nature, type Trip } from '../domain/types'
import { firstDayOfMonth, lastDayOfMonth, monthOf, yearOf } from '../lib/dates'
import { formatEuro, formatMoisLong, round1, round2 } from '../lib/format'

export const TITRES_EXPORT: Record<Activite, string> = {
  swing_house: 'Swing House SAS — Note de frais kilométriques',
  lmnp: "LMNP Nid de l'Aiguille (EI) — Frais de déplacement",
}

export interface LigneExport {
  trip_id: string
  date: string
  motif: string
  depart: string
  arrivee: string
  km: number
  aller_retour: boolean
  km_route: number | null
  km_saisi: number | null
  justif_km: string | null
  montant_bareme: number
  frais: number
  frais_detail: string
  total: number
  rattrapage: string | null
  vehicule: string
  nature: Nature
}

export interface VehiculeExport {
  nom: string
  immatriculation: string
  cv: number
  energie: Energie
  cumulAvant: number
  cumulApres: number
}

export interface ExportData {
  activite: Activite
  mois: string
  version: number
  titre: string
  beneficiaire: string
  lignes: LigneExport[]
  pourMemoire: LigneExport[]
  totaux: ExportTotaux
  vehicules: VehiculeExport[]
  bareme_annee: number | null
  bareme_provisoire: boolean
  mode: ModeFiscal
  genere_le: string
}

export interface BuildArgs {
  activite: Activite
  mois: string
  version: number
  selection: Trip[] // résultat de tripsForExport ou tripsOfExport
  data: CalcData
  calc: Map<string, TripCalc>
  genere_le: string
}

export function buildExportData(a: BuildArgs): ExportData {
  const annee = yearOf(a.mois)
  const settings = fiscalSettings(annee, a.activite, a.data.fiscalYears)
  const vehicles = new Map(a.data.vehicles.map((v) => [v.id, v]))

  const toLigne = (t: Trip): LigneExport => {
    const c = a.calc.get(t.id)
    const v = t.vehicle_id ? vehicles.get(t.vehicle_id) : undefined
    const exps = a.data.expenses.filter((e) => !e.deleted_at && e.trip_id === t.id)
    const excluded = isExcludedDomicileTravail(t, fiscalSettings(yearOf(t.date), t.activite, a.data.fiscalYears))
    const montant = excluded ? 0 : (c?.montant_bareme ?? 0)
    const frais = c?.frais ?? 0
    return {
      trip_id: t.id,
      date: t.date,
      motif: t.motif.trim(),
      depart: t.depart_label,
      arrivee: t.arrivee_label,
      km: t.km_total ?? 0,
      aller_retour: t.aller_retour,
      km_route: t.km_route,
      km_saisi: t.km_saisi,
      justif_km: t.justif_km,
      montant_bareme: montant,
      frais,
      frais_detail: exps.map((e) => `${EXPENSE_LABEL[e.type]} ${formatEuro(e.montant)}${e.note ? ` (${e.note})` : ''}`).join(' · '),
      total: round2(montant + frais),
      rattrapage: monthOf(t.date) !== a.mois ? formatMoisLong(monthOf(t.date)) : null,
      vehicule: v ? `${v.nom} (${v.immatriculation}, ${v.cv} CV)` : '',
      nature: t.nature ?? 'pro',
    }
  }

  const lignes: LigneExport[] = []
  const pourMemoire: LigneExport[] = []
  for (const t of a.selection) {
    const excluded = isExcludedDomicileTravail(t, fiscalSettings(yearOf(t.date), t.activite, a.data.fiscalYears))
    ;(excluded ? pourMemoire : lignes).push(toLigne(t))
  }

  const bareme = round2(lignes.reduce((s, l) => s + l.montant_bareme, 0))
  const frais = round2(lignes.reduce((s, l) => s + l.frais, 0))
  const totaux: ExportTotaux = {
    km: round1(lignes.reduce((s, l) => s + l.km, 0)),
    bareme,
    frais,
    total: round2(bareme + frais),
    nb_trajets: lignes.length,
  }

  const vehicleIds = [...new Set(a.selection.filter((t) => !pourMemoire.some((p) => p.trip_id === t.id)).map((t) => t.vehicle_id))]
  const vehicules: VehiculeExport[] = vehicleIds.flatMap((id) => {
    const v = id ? vehicles.get(id) : undefined
    if (!v) return []
    return [{
      nom: v.nom,
      immatriculation: v.immatriculation,
      cv: v.cv,
      energie: v.energie,
      cumulAvant: cumulKm(a.data, v.id, a.activite, annee, firstDayOfMonth(a.mois), false),
      cumulApres: cumulKm(a.data, v.id, a.activite, annee, lastDayOfMonth(a.mois), true),
    }]
  })

  const calcs = lignes.map((l) => a.calc.get(l.trip_id)).filter((c): c is TripCalc => c != null && c.compte)
  return {
    activite: a.activite,
    mois: a.mois,
    version: a.version,
    titre: TITRES_EXPORT[a.activite],
    beneficiaire: BENEFICIAIRE,
    lignes,
    pourMemoire,
    totaux,
    vehicules,
    bareme_annee: calcs.find((c) => c.bareme_annee != null)?.bareme_annee ?? null,
    bareme_provisoire: calcs.some((c) => c.provisoire),
    mode: settings.mode,
    genere_le: a.genere_le,
  }
}

// Montants à figer côté serveur (toutes les lignes, pour mémoire compris).
export function rpcTripsPayload(d: ExportData): { id: string; montant_bareme: number }[] {
  return [...d.lignes, ...d.pourMemoire].map((l) => ({ id: l.trip_id, montant_bareme: l.montant_bareme }))
}
```

- [ ] **Step 7 : Lancer les tests**

Run : `npx vitest run src/export`
Expected : PASS (2 fichiers).

- [ ] **Step 8 : Commit**

```bash
git add src/export
git commit -m "feat: périmètre des exports (rattrapages, rectificatifs) et données d'export" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 6 : Fichiers d'export (CSV, PDF) et partage

**Files :**
- Create : `src/export/columns.ts`, `src/export/csv.ts`, `src/export/filenames.ts`, `src/export/pdf.ts`, `src/export/share.ts`
- Test : `src/export/csv.test.ts`, `src/export/pdf.test.ts`

**Interfaces :**
- Consumes : `ExportData`, `LigneExport` (Task 5) ; `ACTIVITE_LABEL` (Task 2) ; `decimalFr`, `formatDateCourte`, `formatEuro`, `formatKm`, `formatMoisLong` (Task 1).
- Produces :
  - `columns.ts` : `interface CsvColumn { header: string; value: (l: LigneExport, d: ExportData, pourMemoire: boolean) => string }`, `CSV_COLUMNS: CsvColumn[]`
  - `csv.ts` : `csvEscape(s: string): string`, `toCsv(d: ExportData, columns?: CsvColumn[]): string`
  - `filenames.ts` : `exportFileName(d: { activite: Activite; mois: string; version: number }, ext: 'pdf' | 'csv'): string`
  - `pdf.ts` : `pdfText(s: string): string`, `renderPdf(d: ExportData): Blob`
  - `share.ts` : `makeExportFiles(d: ExportData): File[]`, `shareOrDownload(files: File[], title: string): Promise<'shared' | 'downloaded' | 'cancelled'>`

- [ ] **Step 1 : Tests CSV + nom de fichier (échec attendu)**

`src/export/csv.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import type { ExportData, LigneExport } from './build'
import { csvEscape, toCsv } from './csv'
import { exportFileName } from './filenames'

const ligne = (o: Partial<LigneExport> = {}): LigneExport => ({
  trip_id: 't1', date: '2026-09-10', motif: 'Réunion ; fournisseur "TrackMan"', depart: 'Domicile', arrivee: 'Annecy',
  km: 84.5, aller_retour: true, km_route: 42.3, km_saisi: null, justif_km: null, montant_bareme: 53.74, frais: 4.6,
  frais_detail: 'Péage 4,60 € (A40)', total: 58.34, rattrapage: null, vehicule: 'Golf (AB-123-CD, 5 CV)', nature: 'pro', ...o,
})

const data = {
  activite: 'swing_house', mois: '2026-09', version: 1, lignes: [ligne()],
  pourMemoire: [ligne({ trip_id: 't2', motif: 'Trajet habituel du matin', nature: 'domicile_travail', montant_bareme: 0, frais: 0, frais_detail: '', total: 0 })],
} as unknown as ExportData

describe('csv', () => {
  it('échappe guillemets et points-virgules', () => {
    expect(csvEscape('a;b')).toBe('"a;b"')
    expect(csvEscape('dit "x"')).toBe('"dit ""x"""')
    expect(csvEscape('simple')).toBe('simple')
  })
  it('BOM UTF-8, séparateur ;, décimales à virgule, fins de ligne CRLF', () => {
    const csv = toCsv(data)
    expect(csv.startsWith('﻿Date;Activité;Motif;')).toBe(true)
    const rows = csv.slice(1).trimEnd().split('\r\n')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toContain('10/09/2026;Swing House;"Réunion ; fournisseur ""TrackMan""";Domicile;Annecy;Oui;84,5;')
    expect(rows[1]).toContain(';53,74;4,60;Péage 4,60 € (A40);58,34;Déplacement professionnel;')
    expect(rows[2]).toContain(';0,00;Domicile–travail (non remboursé);')
  })
  it('nom de fichier stable', () => {
    expect(exportFileName({ activite: 'swing_house', mois: '2026-09', version: 2 }, 'pdf')).toBe('carnet-swing-house-2026-09-v2.pdf')
    expect(exportFileName({ activite: 'lmnp', mois: '2026-09', version: 1 }, 'csv')).toBe('carnet-lmnp-2026-09-v1.csv')
  })
})
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run : `npx vitest run src/export/csv.test.ts`
Expected : FAIL — `Failed to resolve import "./csv"`.

- [ ] **Step 3 : Implémenter `columns.ts`, `csv.ts`, `filenames.ts`**

`src/export/columns.ts` :
```ts
import { ACTIVITE_LABEL } from '../domain/types'
import { decimalFr, formatDateCourte } from '../lib/format'
import type { ExportData, LigneExport } from './build'

export interface CsvColumn {
  header: string
  value: (l: LigneExport, d: ExportData, pourMemoire: boolean) => string
}

// Colonnes du CSV. SEUL fichier à modifier quand le comptable aura donné son format.
export const CSV_COLUMNS: CsvColumn[] = [
  { header: 'Date', value: (l) => formatDateCourte(l.date) },
  { header: 'Activité', value: (_l, d) => ACTIVITE_LABEL[d.activite] },
  { header: 'Motif', value: (l) => l.motif },
  { header: 'Départ', value: (l) => l.depart },
  { header: 'Arrivée', value: (l) => l.arrivee },
  { header: 'Aller-retour', value: (l) => (l.aller_retour ? 'Oui' : 'Non') },
  { header: 'Km', value: (l) => decimalFr(l.km, 1) },
  {
    header: 'Correction km',
    value: (l) =>
      l.km_saisi == null
        ? ''
        : `${decimalFr(l.km_saisi, 1)} au lieu de ${l.km_route == null ? '—' : decimalFr(l.km_route, 1)} : ${l.justif_km ?? ''}`,
  },
  { header: 'Véhicule', value: (l) => l.vehicule },
  { header: 'Barème (€)', value: (l) => decimalFr(l.montant_bareme, 2) },
  { header: 'Frais annexes (€)', value: (l) => decimalFr(l.frais, 2) },
  { header: 'Détail frais', value: (l) => l.frais_detail },
  { header: 'Total (€)', value: (l, _d, pm) => decimalFr(pm ? 0 : l.total, 2) },
  { header: 'Nature', value: (_l, _d, pm) => (pm ? 'Domicile–travail (non remboursé)' : 'Déplacement professionnel') },
  { header: 'Rattrapage', value: (l) => l.rattrapage ?? '' },
]
```

`src/export/csv.ts` :
```ts
import type { ExportData } from './build'
import { CSV_COLUMNS, type CsvColumn } from './columns'

export function csvEscape(s: string): string {
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// CSV pour Excel FR : BOM UTF-8, séparateur « ; », décimales à virgule, CRLF.
export function toCsv(d: ExportData, columns: CsvColumn[] = CSV_COLUMNS): string {
  const line = (cells: string[]) => cells.map(csvEscape).join(';')
  const rows = [line(columns.map((c) => c.header))]
  for (const l of d.lignes) rows.push(line(columns.map((c) => c.value(l, d, false))))
  for (const l of d.pourMemoire) rows.push(line(columns.map((c) => c.value(l, d, true))))
  return `﻿${rows.join('\r\n')}\r\n`
}
```

`src/export/filenames.ts` :
```ts
import type { Activite } from '../domain/types'

export function exportFileName(d: { activite: Activite; mois: string; version: number }, ext: 'pdf' | 'csv'): string {
  const act = d.activite === 'swing_house' ? 'swing-house' : 'lmnp'
  return `carnet-${act}-${d.mois}-v${d.version}.${ext}`
}
```

- [ ] **Step 4 : Lancer les tests CSV**

Run : `npx vitest run src/export/csv.test.ts`
Expected : PASS.

- [ ] **Step 5 : Test PDF (échec attendu)**

`src/export/pdf.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import type { ExportData, LigneExport } from './build'
import { pdfText, renderPdf } from './pdf'

const ligne: LigneExport = {
  trip_id: 't1', date: '2026-09-10', motif: 'Réunion fournisseur TrackMan à Annecy', depart: 'Domicile', arrivee: 'Annecy',
  km: 84.6, aller_retour: true, km_route: 42.3, km_saisi: null, justif_km: null, montant_bareme: 53.8, frais: 4.6,
  frais_detail: 'Péage 4,60 € (A40)', total: 58.4, rattrapage: 'août 2026', vehicule: 'Golf (AB-123-CD, 5 CV)', nature: 'pro',
}

const data: ExportData = {
  activite: 'swing_house', mois: '2026-09', version: 2, titre: 'Swing House SAS — Note de frais kilométriques',
  beneficiaire: 'Sam Pochat', lignes: Array.from({ length: 40 }, (_, i) => ({ ...ligne, trip_id: `t${i}` })),
  pourMemoire: [{ ...ligne, trip_id: 'dt', nature: 'domicile_travail', montant_bareme: 0, total: 0 }],
  totaux: { km: 3384, bareme: 2152, frais: 184, total: 2336, nb_trajets: 40 },
  vehicules: [{ nom: 'Golf', immatriculation: 'AB-123-CD', cv: 5, energie: 'thermique', cumulAvant: 1200, cumulApres: 4584 }],
  bareme_annee: 2026, bareme_provisoire: false, mode: 'bareme', genere_le: '2026-10-01T09:00:00.000Z',
}

describe('pdf', () => {
  it('pdfText remplace les caractères hors WinAnsi', () => {
    expect(pdfText('A → B € — x')).toBe('A > B € - x')
  })
  it('génère un PDF multipage', async () => {
    const blob = renderPdf(data)
    expect(blob.type).toBe('application/pdf')
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))
    expect(head).toBe('%PDF-')
    expect(blob.size).toBeGreaterThan(3000)
  })
})
```

- [ ] **Step 6 : Lancer (échec attendu)**

Run : `npx vitest run src/export/pdf.test.ts`
Expected : FAIL — `Failed to resolve import "./pdf"`.

- [ ] **Step 7 : Implémenter `src/export/pdf.ts`**

```ts
import { jsPDF } from 'jspdf'
import { autoTable, type UserOptions } from 'jspdf-autotable'
import { decimalFr, formatDateCourte, formatEuro, formatKm, formatMoisLong } from '../lib/format'
import type { ExportData, LigneExport } from './build'

// Helvetica (police standard PDF) = encodage WinAnsi : on remplace ce qu'elle ne sait pas afficher.
export function pdfText(s: string): string {
  return s
    .replace(/[  ]/g, ' ')
    .replace(/→/g, '>')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
}

const M = 14 // marge (mm)

// Style commun : noir sur blanc, filets fins, aucune couleur.
const BASE: Partial<UserOptions> = {
  theme: 'plain',
  styles: { font: 'helvetica', fontSize: 8.5, textColor: 0, cellPadding: 1.8, lineColor: 0, lineWidth: 0 },
  headStyles: { fontStyle: 'bold', lineWidth: { bottom: 0.3 } },
  bodyStyles: { lineWidth: { bottom: 0.1 } },
  footStyles: { fontStyle: 'bold', lineWidth: { top: 0.3 } },
  margin: { left: M, right: M, bottom: 16 },
}

const trajet = (l: LigneExport) => `${l.depart} - ${l.arrivee}${l.aller_retour ? ' (aller-retour)' : ''}`

export function renderPdf(d: ExportData): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const t = pdfText
  const H = doc.internal.pageSize.getHeight()
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(t(d.titre), M, 18)

  const entete = [
    `Bénéficiaire : ${d.beneficiaire}`,
    `Période : ${formatMoisLong(d.mois)}${d.version > 1 ? ` - version ${d.version}, annule et remplace la version ${d.version - 1}` : ''}`,
    ...d.vehicules.map(
      (v) =>
        `Véhicule : ${v.nom} - ${v.immatriculation} - ${v.cv} CV - ${v.energie === 'electrique' ? 'électrique' : 'thermique'}` +
        ` - cumul ${d.mois.slice(0, 4)} : ${formatKm(v.cumulAvant)} avant ce mois, ${formatKm(v.cumulApres)} en fin de mois`,
    ),
    d.mode === 'bareme'
      ? `Barème kilométrique ${d.bareme_annee ?? '-'}${d.bareme_provisoire ? " (provisoire : barème de l'année pas encore publié)" : ''}`
      : 'Mode frais réels : coût du véhicule traité hors de cet état ; seuls les frais annexes figurent ici.',
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  entete.forEach((s, i) => doc.text(t(s), M, 26 + i * 5))

  autoTable(doc, {
    ...BASE,
    startY: 26 + entete.length * 5 + 3,
    showFoot: 'lastPage',
    head: [['Date', 'Motif', 'Trajet', 'Km', 'Barème', 'Frais annexes', 'Total']],
    body: d.lignes.map((l) =>
      [
        formatDateCourte(l.date) + (l.rattrapage ? `\nrattrapage ${l.rattrapage}` : ''),
        l.motif + (l.km_saisi != null ? `\nKm corrigés : ${l.justif_km ?? ''}` : ''),
        trajet(l),
        decimalFr(l.km, 1),
        formatEuro(l.montant_bareme),
        l.frais_detail ? `${formatEuro(l.frais)}\n${l.frais_detail}` : '',
        formatEuro(l.total),
      ].map(t),
    ),
    foot: [
      [
        'Total',
        `${d.totaux.nb_trajets} trajet(s)`,
        '',
        decimalFr(d.totaux.km, 1),
        formatEuro(d.totaux.bareme),
        formatEuro(d.totaux.frais),
        formatEuro(d.totaux.total),
      ].map(t),
    ],
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 80 },
      2: { cellWidth: 70 },
      3: { cellWidth: 16, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 32, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
    },
  })

  let y = finalY() + 10
  if (d.pourMemoire.length > 0) {
    if (y > H - 40) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(t('Pour mémoire - trajets domicile-travail non remboursés'), M, y)
    autoTable(doc, {
      ...BASE,
      startY: y + 2,
      head: [['Date', 'Motif', 'Trajet', 'Km']],
      body: d.pourMemoire.map((l) => [formatDateCourte(l.date), l.motif, trajet(l), decimalFr(l.km, 1)].map(t)),
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 80 }, 2: { cellWidth: 70 }, 3: { cellWidth: 16, halign: 'right' } },
    })
    y = finalY() + 10
  }

  if (y > H - 30) {
    doc.addPage()
    y = 20
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(t(`Certifié exact, le ${formatDateCourte(d.genere_le.slice(0, 10))}.`), M, y)
  doc.text(t(d.beneficiaire), M, y + 6)

  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.text(t(`${d.titre} - ${formatMoisLong(d.mois)} - page ${i}/${n}`), M, H - 8)
  }
  return doc.output('blob')
}
```

- [ ] **Step 8 : Lancer les tests PDF**

Run : `npx vitest run src/export/pdf.test.ts`
Expected : PASS. Si `jspdf` échoue à s'importer en environnement node, ajouter en tête du fichier de test la ligne `// @vitest-environment jsdom`, installer `npm install -D jsdom@^30.0.1`, relancer.

- [ ] **Step 9 : Implémenter `src/export/share.ts` (navigateur uniquement, vérifié en Task 15)**

```ts
import type { ExportData } from './build'
import { toCsv } from './csv'
import { exportFileName } from './filenames'
import { renderPdf } from './pdf'

export function makeExportFiles(d: ExportData): File[] {
  return [
    new File([renderPdf(d)], exportFileName(d, 'pdf'), { type: 'application/pdf' }),
    new File([toCsv(d)], exportFileName(d, 'csv'), { type: 'text/csv;charset=utf-8' }),
  ]
}

// À appeler directement dans un gestionnaire de tap : iOS exige un geste utilisateur récent.
export async function shareOrDownload(files: File[], title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.share && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title })
      return 'shared'
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled'
      // Autre refus (ex. NotAllowedError) : repli sur le téléchargement.
    }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f)
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  return 'downloaded'
}
```

- [ ] **Step 10 : Vérifier la compilation**

Run : `npm test && npx tsc -b`
Expected : tous les tests PASS, aucune erreur TypeScript.

- [ ] **Step 11 : Commit**

```bash
git add src/export
git commit -m "feat: export CSV (colonnes centralisées), PDF sobre et partage iOS" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 7 : Backend Supabase (schéma, sécurité, verrous, RPC)

**Files :**
- Create : `supabase/migrations/0001_schema.sql`, `supabase/migrations/0002_securite.sql`, `supabase/migrations/0003_rpc.sql`, `supabase/tests/verification.sql`
- Create (non commité) : `.env.local`

**Interfaces :**
- Consumes : noms de colonnes des types (Task 2) — doivent correspondre exactement.
- Produces :
  - Tables `public.vehicles, fiscal_years, bareme_years, bareme_rates, places, trips, trip_expenses, exports, trip_events` (colonnes = interfaces de `types.ts` + `owner_id`)
  - RPC `export_month(p_activite text, p_mois text, p_version int, p_trips jsonb, p_totaux jsonb, p_bareme_annee int, p_bareme_provisoire boolean) returns exports` — `p_trips` = `[{ "id": uuid, "montant_bareme": number }]`
  - RPC `reopen_trip(p_trip_id uuid, p_motif text) returns void`
  - RPC `ping() returns int` (accessible sans connexion)
  - Codes d'erreur métier : `P0001` avec message en français

Écart assumé par rapport à la spec §11 : les RPC sont `security definer` (avec contrôle explicite de `auth.uid()`) pour que `exports` et `trip_events` ne soient **écrits que par les RPC** (le client n'a que la lecture). Plus strict, même intention.

- [ ] **Step 1 : `supabase/migrations/0001_schema.sql`**

```sql
-- Carnet de bord : schéma. Ids générés côté client (local-first), sauf exports/journal.
create extension if not exists btree_gist with schema extensions;

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create table public.places (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  adresse text not null default '',
  google_place_id text,
  lat double precision,
  lng double precision,
  role text check (role in ('domicile', 'swing_house', 'lmnp')),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.vehicles (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom text not null,
  immatriculation text not null default '',
  cv int not null check (cv between 1 and 50),
  energie text not null check (energie in ('thermique', 'electrique')),
  date_debut date not null,
  date_fin date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (date_fin is null or date_fin >= date_debut),
  -- Un seul véhicule actif à une date donnée (historique séquentiel).
  constraint vehicles_sans_chevauchement exclude using gist (
    owner_id with =,
    daterange(date_debut, date_fin, '[]') with &&
  ) where (deleted_at is null)
);

create table public.fiscal_years (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  annee int not null check (annee between 2000 and 2100),
  activite text not null check (activite in ('swing_house', 'lmnp')),
  mode text not null default 'bareme' check (mode in ('bareme', 'frais_reels')),
  inclure_domicile_travail boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index fiscal_years_unique on public.fiscal_years (owner_id, annee, activite) where deleted_at is null;

create table public.bareme_years (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  annee int not null,
  majoration_electrique numeric(5, 4) not null default 0.2,
  source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index bareme_years_unique on public.bareme_years (owner_id, annee) where deleted_at is null;

create table public.bareme_rates (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  annee int not null,
  cv_min int,
  cv_max int,
  km_min numeric(9, 1) not null,
  km_max numeric(9, 1),
  coef numeric(8, 4) not null,
  constante numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activite text not null check (activite in ('swing_house', 'lmnp')),
  mois text not null check (mois ~ '^\d{4}-\d{2}$'),
  version int not null check (version >= 1),
  statut text not null default 'emis' check (statut in ('emis', 'a_rectifier', 'remplace')),
  bareme_annee int,
  bareme_provisoire boolean not null default false,
  totaux jsonb not null,
  trip_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, activite, mois, version)
);

create table public.trips (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  activite text not null check (activite in ('swing_house', 'lmnp')),
  motif text not null default '',
  depart_place_id uuid references public.places (id),
  depart_label text not null default '',
  depart_adresse text not null default '',
  arrivee_place_id uuid references public.places (id),
  arrivee_label text not null default '',
  arrivee_adresse text not null default '',
  km_route numeric(7, 1),
  km_saisi numeric(7, 1),
  justif_km text,
  aller_retour boolean not null default false,
  km_total numeric(7, 1),
  vehicle_id uuid references public.vehicles (id),
  nature text check (nature in ('pro', 'domicile_travail')),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'valide', 'exporte')),
  brouillon_force boolean not null default false,
  doublon_confirme boolean not null default false,
  montant_bareme numeric(10, 2) not null default 0,
  export_id uuid references public.exports (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index trips_owner_date on public.trips (owner_id, date);

create table public.trip_expenses (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id),
  type text not null check (type in ('peage', 'parking', 'autre')),
  montant numeric(8, 2) not null check (montant > 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index trip_expenses_trip on public.trip_expenses (trip_id);

create table public.trip_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id),
  export_id uuid references public.exports (id),
  action text not null check (action in ('export', 'reopen')),
  motif text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- updated_at posé par le serveur (curseur de synchro).
do $$
declare t text;
begin
  foreach t in array array['places', 'vehicles', 'fiscal_years', 'bareme_years', 'bareme_rates',
                           'exports', 'trips', 'trip_expenses', 'trip_events'] loop
    execute format('create trigger set_updated_at before insert or update on public.%I
                    for each row execute function public.set_updated_at()', t);
    execute format('create index %I on public.%I (owner_id, updated_at)', t || '_sync', t);
  end loop;
end $$;
```

- [ ] **Step 2 : `supabase/migrations/0002_securite.sql`**

```sql
-- RLS : chaque ligne appartient à son propriétaire. exports/trip_events : lecture seule côté client.
do $$
declare t text;
begin
  foreach t in array array['places', 'vehicles', 'fiscal_years', 'bareme_years', 'bareme_rates',
                           'trips', 'trip_expenses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy proprietaire on public.%I for all to authenticated
                    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
  foreach t in array array['exports', 'trip_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy lecture_proprietaire on public.%I for select to authenticated
                    using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Verrou des trajets exportés. Seules export_month/reopen_trip lèvent le verrou (variable de transaction).
create or replace function public.trips_verrou() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('carnet.bypass_verrou', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.statut = 'exporte' then
    raise exception 'Trajet exporté : verrouillé (le rouvrir d''abord)' using errcode = 'P0001';
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (new.statut = 'exporte' or new.export_id is not null or new.montant_bareme <> 0) then
    raise exception 'Statut exporté réservé à l''export' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger trips_verrou before insert or update or delete on public.trips
  for each row execute function public.trips_verrou();

create or replace function public.expenses_verrou() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('carnet.bypass_verrou', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE')
     and exists (select 1 from public.trips where id = old.trip_id and statut = 'exporte') then
    raise exception 'Frais d''un trajet exporté : verrouillés' using errcode = 'P0001';
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and exists (select 1 from public.trips where id = new.trip_id and statut = 'exporte') then
    raise exception 'Frais d''un trajet exporté : verrouillés' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger expenses_verrou before insert or update or delete on public.trip_expenses
  for each row execute function public.expenses_verrou();

-- Choix fiscal figé dès qu'un trajet de l'année/activité est exporté.
create or replace function public.annee_exportee(p_owner uuid, p_annee int, p_activite text) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.trips t
    where t.owner_id = p_owner and t.activite = p_activite and t.statut = 'exporte'
      and t.deleted_at is null and extract(year from t.date)::int = p_annee
  )
$$;

create or replace function public.fiscal_years_verrou() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.mode = old.mode and new.annee = old.annee and new.activite = old.activite
       and new.inclure_domicile_travail = old.inclure_domicile_travail
       and new.deleted_at is not distinct from old.deleted_at then
      return new; -- simple ré-envoi sans changement
    end if;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    if public.annee_exportee(old.owner_id, old.annee, old.activite) then
      raise exception 'Choix fiscal verrouillé : un export existe déjà pour % / %', old.annee, old.activite
        using errcode = 'P0001';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if public.annee_exportee(new.owner_id, new.annee, new.activite) then
      raise exception 'Choix fiscal verrouillé : un export existe déjà pour % / %', new.annee, new.activite
        using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger fiscal_years_verrou before insert or update or delete on public.fiscal_years
  for each row execute function public.fiscal_years_verrou();
```

- [ ] **Step 3 : `supabase/migrations/0003_rpc.sql`**

```sql
-- Export d'un mois pour une activité : crée l'export, fige les montants, verrouille, journalise.
create or replace function public.export_month(
  p_activite text, p_mois text, p_version int, p_trips jsonb,
  p_totaux jsonb, p_bareme_annee int, p_bareme_provisoire boolean
) returns public.exports
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_last public.exports;
  v_new public.exports;
  v_ids uuid[];
  v_ok int;
begin
  if v_uid is null then
    raise exception 'Non authentifié' using errcode = 'P0001';
  end if;

  select * into v_last from public.exports
  where owner_id = v_uid and activite = p_activite and mois = p_mois and deleted_at is null
  order by version desc limit 1;

  if found and v_last.statut = 'emis' then
    raise exception 'Mois déjà exporté (v%)', v_last.version using errcode = 'P0001';
  end if;
  if coalesce(v_last.version, 0) + 1 <> p_version then
    raise exception 'Version attendue % (reçue %)', coalesce(v_last.version, 0) + 1, p_version using errcode = 'P0001';
  end if;

  select array_agg((e ->> 'id')::uuid) into v_ids from jsonb_array_elements(p_trips) e;
  if v_ids is null then
    raise exception 'Aucun trajet à exporter' using errcode = 'P0001';
  end if;

  select count(*) into v_ok from public.trips t
  where t.id = any (v_ids) and t.owner_id = v_uid and t.activite = p_activite and t.deleted_at is null
    and ((t.statut = 'valide' and t.export_id is null)
         or (v_last.id is not null and t.statut = 'exporte' and t.export_id = v_last.id));
  if v_ok <> array_length(v_ids, 1) then
    raise exception 'Trajets invalides ou pas encore synchronisés' using errcode = 'P0001';
  end if;

  insert into public.exports (owner_id, activite, mois, version, statut, bareme_annee, bareme_provisoire, totaux, trip_ids)
  values (v_uid, p_activite, p_mois, p_version, 'emis', p_bareme_annee, p_bareme_provisoire, p_totaux, v_ids)
  returning * into v_new;

  if v_last.id is not null then
    update public.exports set statut = 'remplace' where id = v_last.id;
  end if;

  perform set_config('carnet.bypass_verrou', 'on', true);
  update public.trips t
     set statut = 'exporte', export_id = v_new.id, montant_bareme = (e ->> 'montant_bareme')::numeric
    from jsonb_array_elements(p_trips) e
   where t.id = (e ->> 'id')::uuid;
  perform set_config('carnet.bypass_verrou', 'off', true);

  insert into public.trip_events (owner_id, trip_id, export_id, action)
  select v_uid, unnest(v_ids), v_new.id, 'export';

  return v_new;
end $$;

-- Réouverture tracée d'un trajet exporté.
create or replace function public.reopen_trip(p_trip_id uuid, p_motif text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_trip public.trips;
begin
  if v_uid is null then
    raise exception 'Non authentifié' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motif, ''))) < 5 then
    raise exception 'Motif de réouverture obligatoire' using errcode = 'P0001';
  end if;
  select * into v_trip from public.trips where id = p_trip_id and owner_id = v_uid and deleted_at is null;
  if not found or v_trip.statut <> 'exporte' then
    raise exception 'Trajet introuvable ou non exporté' using errcode = 'P0001';
  end if;

  perform set_config('carnet.bypass_verrou', 'on', true);
  update public.trips set statut = 'valide', export_id = null, montant_bareme = 0 where id = p_trip_id;
  perform set_config('carnet.bypass_verrou', 'off', true);

  update public.exports set statut = 'a_rectifier' where id = v_trip.export_id;
  insert into public.trip_events (owner_id, trip_id, export_id, action, motif)
  values (v_uid, p_trip_id, v_trip.export_id, 'reopen', trim(p_motif));
end $$;

-- Ping anti-pause (GitHub Action hebdomadaire).
create or replace function public.ping() returns int
language sql security invoker set search_path = '' as $$ select 1 $$;

revoke execute on function public.export_month(text, text, int, jsonb, jsonb, int, boolean) from public, anon;
revoke execute on function public.reopen_trip(uuid, text) from public, anon;
grant execute on function public.export_month(text, text, int, jsonb, jsonb, int, boolean) to authenticated;
grant execute on function public.reopen_trip(uuid, text) to authenticated;
grant execute on function public.ping() to anon, authenticated;
```

- [ ] **Step 4 : `supabase/tests/verification.sql`**

Script de recette : tout se passe dans un bloc qui se termine **toujours** par une exception, donc rien n'est conservé. Le message final liste les contrôles. Remplacer `__UID__` par l'id du compte de Sam.

```sql
do $$
declare
  v_uid uuid := '__UID__';
  v_autre uuid := gen_random_uuid();
  v_res text := '';
  v_exp public.exports;
  v_n int;
  veh uuid := gen_random_uuid();
  t1 uuid := gen_random_uuid();
  t2 uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.vehicles (id, nom, cv, energie, date_debut) values (veh, 'Test', 5, 'thermique', '2020-01-01');
  insert into public.trips (id, date, activite, motif, km_total, vehicle_id, statut)
  values (t1, '2026-09-10', 'swing_house', 'Recette verrou export', 10, veh, 'valide'),
         (t2, '2026-09-11', 'swing_house', 'Recette second trajet', 20, veh, 'valide');

  begin
    insert into public.trips (id, date, activite, statut) values (gen_random_uuid(), '2026-09-12', 'swing_house', 'exporte');
    v_res := v_res || ' KO:insert_exporte';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:insert_exporte_refuse'; end;

  v_exp := public.export_month('swing_house', '2026-09', 1, jsonb_build_array(jsonb_build_object('id', t1, 'montant_bareme', 6.36)),
                               '{"km":10,"bareme":6.36,"frais":0,"total":6.36,"nb_trajets":1}', 2026, false);
  v_res := v_res || ' ok:export_v' || v_exp.version;

  begin
    update public.trips set motif = 'Modification interdite' where id = t1;
    v_res := v_res || ' KO:update_verrou';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:update_refuse'; end;

  begin
    update public.trips set deleted_at = now() where id = t1;
    v_res := v_res || ' KO:suppression';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:suppression_refusee'; end;

  begin
    insert into public.trip_expenses (id, trip_id, type, montant) values (gen_random_uuid(), t1, 'peage', 3);
    v_res := v_res || ' KO:frais';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:frais_refuses'; end;

  begin
    perform public.export_month('swing_house', '2026-09', 2, jsonb_build_array(jsonb_build_object('id', t2, 'montant_bareme', 12.72)),
                                '{}', 2026, false);
    v_res := v_res || ' KO:double_export';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:double_export_refuse'; end;

  begin
    insert into public.fiscal_years (id, annee, activite, mode) values (gen_random_uuid(), 2026, 'swing_house', 'frais_reels');
    v_res := v_res || ' KO:fiscal';
  exception when sqlstate 'P0001' then v_res := v_res || ' ok:fiscal_verrouille'; end;

  perform public.reopen_trip(t1, 'Erreur de motif');
  select count(*) into v_n from public.trip_events where trip_id = t1;
  v_res := v_res || ' ok:reouverture_events=' || v_n;

  v_exp := public.export_month('swing_house', '2026-09', 2,
    jsonb_build_array(jsonb_build_object('id', t1, 'montant_bareme', 6.36), jsonb_build_object('id', t2, 'montant_bareme', 12.72)),
    '{"km":30,"bareme":19.08,"frais":0,"total":19.08,"nb_trajets":2}', 2026, false);
  select count(*) into v_n from public.exports where mois = '2026-09' and statut = 'remplace';
  v_res := v_res || ' ok:rectificatif_v' || v_exp.version || '_remplaces=' || v_n;

  perform set_config('request.jwt.claims', json_build_object('sub', v_autre, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.trips;
  v_res := v_res || ' ok:rls_autre_voit=' || v_n;

  raise exception 'RECETTE%', v_res;
end $$;
```

- [ ] **Step 5 : Créer le projet Supabase (avec confirmation de Sam)**

1. Outil MCP `get_cost` (`type: project`, `organization_id: bdwojjuyvbvrowmoixid`). **Annoncer le coût à Sam et attendre son accord.**
2. `confirm_cost` puis `create_project` (`name: carnet-de-bord`, `region: eu-west-3` (Paris), `organization_id: bdwojjuyvbvrowmoixid`).
3. `get_project` jusqu'à `status: ACTIVE_HEALTHY`.

- [ ] **Step 6 : Appliquer les migrations**

Outil MCP `apply_migration` trois fois, dans l'ordre, avec le contenu exact des fichiers : `name: schema` (0001), `name: securite` (0002), `name: rpc` (0003).
Expected : chaque appel renvoie un succès. Puis `list_tables` (schemas `["public"]`) → 9 tables, RLS activée partout.

- [ ] **Step 7 : Configurer l'authentification (action de Sam, guidée)**

Dans le tableau de bord Supabase du projet `carnet-de-bord` :
1. **Authentication → Sign In / Providers** : désactiver « Allow new users to sign up ».
2. **Authentication → Users → Add user → Create new user** : son email + un mot de passe fort, cocher « Auto Confirm User ».

Puis `execute_sql` : `select id, email from auth.users;` → noter l'`id` (UID de Sam).

- [ ] **Step 8 : Exécuter la recette**

Outil MCP `execute_sql` avec le contenu de `supabase/tests/verification.sql` (UID remplacé).
Expected : une **erreur** dont le message est exactement :
`RECETTE ok:insert_exporte_refuse ok:export_v1 ok:update_refuse ok:suppression_refusee ok:frais_refuses ok:double_export_refuse ok:fiscal_verrouille ok:reouverture_events=2 ok:rectificatif_v2_remplaces=1 ok:rls_autre_voit=0`
Tout « KO » = bug à corriger dans la migration concernée (nouvelle migration corrective, puis relancer).

- [ ] **Step 9 : Contrôle de sécurité**

Outil MCP `get_advisors` (`type: security`). Expected : aucune alerte de niveau ERROR. (Les alertes WARN sur `security definer` des deux RPC sont attendues et justifiées : contrôle explicite d'`auth.uid()`.)

- [ ] **Step 10 : Variables locales**

Outils MCP `get_project_url` et `get_publishable_keys`. Créer `.env.local` (ignoré par git) :
```
VITE_SUPABASE_URL=<url du projet>
VITE_SUPABASE_PUBLISHABLE_KEY=<clé publishable sb_publishable_…>
VITE_GOOGLE_MAPS_KEY=
```
(la clé Google est ajoutée en Task 10).

- [ ] **Step 11 : Commit**

```bash
git add supabase
git commit -m "feat(supabase): schéma, RLS, verrous d'export et RPC export/réouverture" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 8 : Base locale (Dexie) et écritures locales

**Files :**
- Create : `src/db/db.ts`, `src/db/repo.ts`
- Test : `src/db/repo.test.ts`

**Interfaces :**
- Consumes : types (Task 2), `nowISO` (Task 1).
- Produces :
  - `db.ts` : `interface LocalMeta { _dirty: 0 | 1; _rev: number }`, `type Local<T> = T & LocalMeta`, `SYNC_TABLES` (ordre de poussée : `places, vehicles, bareme_years, bareme_rates, fiscal_years, trips, trip_expenses`), `PULL_TABLES` (+ `exports, trip_events`), `type SyncTableName`, `type PullTableName`, `interface RowOf` (nom de table → type de ligne), `interface MetaRow { key: string; value: string }`, `class CarnetDB extends Dexie` (une table par nom + `meta`), instance `db`
  - `repo.ts` : `newId(): string`, `newRow<T extends BaseRow>(fields: Omit<T, keyof BaseRow>): T`, `saveRows<K extends SyncTableName>(db: CarnetDB, table: K, rows: RowOf[K][]): Promise<void>`, `saveRow<K extends SyncTableName>(db: CarnetDB, table: K, row: RowOf[K]): Promise<void>`, `softDelete<K extends SyncTableName>(db: CarnetDB, table: K, id: string): Promise<void>`, `stripLocal<T extends object>(row: T): Omit<T, '_dirty' | '_rev'>`, `countDirty(db: CarnetDB): Promise<number>`, `getMeta(db: CarnetDB, key: string): Promise<string | null>`, `setMeta(db: CarnetDB, key: string, value: string): Promise<void>`, `onLocalWrite(fn: () => void): () => void`

Règle : **toute écriture de l'UI passe par `saveRow`/`saveRows`/`softDelete`** (marque la ligne à pousser, incrémente `_rev`, prévient le moteur de synchro).

- [ ] **Step 1 : Tests (échec attendu)**

`src/db/repo.test.ts` :
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTrip, makeVehicle } from '../test/fixtures'
import { CarnetDB } from './db'
import { countDirty, getMeta, newRow, onLocalWrite, saveRow, setMeta, softDelete, stripLocal } from './repo'
import type { Vehicle } from '../domain/types'

let db: CarnetDB
beforeEach(() => {
  db = new CarnetDB(`test-${crypto.randomUUID()}`)
})

describe('repo', () => {
  it('newRow génère id et horodatages', () => {
    const v = newRow<Vehicle>({ nom: 'X', immatriculation: '', cv: 5, energie: 'thermique', date_debut: '2026-01-01', date_fin: null })
    expect(v.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(v.deleted_at).toBeNull()
    expect(v.created_at).toBe(v.updated_at)
  })

  it('saveRow marque la ligne à pousser et incrémente _rev', async () => {
    const v = makeVehicle()
    await saveRow(db, 'vehicles', v)
    expect(await db.vehicles.get(v.id)).toMatchObject({ _dirty: 1, _rev: 1 })
    await saveRow(db, 'vehicles', { ...v, nom: 'Renommée' })
    expect(await db.vehicles.get(v.id)).toMatchObject({ nom: 'Renommée', _dirty: 1, _rev: 2 })
  })

  it('softDelete pose deleted_at et reste à pousser', async () => {
    const t = makeTrip()
    await saveRow(db, 'trips', t)
    await db.trips.update(t.id, { _dirty: 0 })
    await softDelete(db, 'trips', t.id)
    const row = await db.trips.get(t.id)
    expect(row?.deleted_at).not.toBeNull()
    expect(row?._dirty).toBe(1)
  })

  it('countDirty compte les lignes en attente sur toutes les tables', async () => {
    await saveRow(db, 'vehicles', makeVehicle())
    await saveRow(db, 'trips', makeTrip())
    expect(await countDirty(db)).toBe(2)
  })

  it('stripLocal retire les champs locaux', () => {
    expect(stripLocal({ id: 'a', _dirty: 1, _rev: 3 })).toEqual({ id: 'a' })
  })

  it('prévient les abonnés à chaque écriture', async () => {
    const fn = vi.fn()
    const off = onLocalWrite(fn)
    await saveRow(db, 'vehicles', makeVehicle())
    off()
    await saveRow(db, 'vehicles', makeVehicle())
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('meta clé/valeur', async () => {
    expect(await getMeta(db, 'cursor:trips')).toBeNull()
    await setMeta(db, 'cursor:trips', '2026-09-15T10:00:00Z')
    expect(await getMeta(db, 'cursor:trips')).toBe('2026-09-15T10:00:00Z')
  })
})
```

- [ ] **Step 2 : Lancer (échec attendu)**

Run : `npx vitest run src/db`
Expected : FAIL — `Failed to resolve import "./db"`.

- [ ] **Step 3 : Implémenter `src/db/db.ts`**

```ts
import Dexie, { type EntityTable } from 'dexie'
import type {
  BaremeRate, BaremeYear, ExportRecord, FiscalYear, Place, Trip, TripEvent, TripExpense, Vehicle,
} from '../domain/types'

// Champs locaux : _dirty = à pousser vers Supabase ; _rev = compteur d'écritures locales.
export interface LocalMeta {
  _dirty: 0 | 1
  _rev: number
}
export type Local<T> = T & LocalMeta

// Ordre de poussée = ordre des clés étrangères.
export const SYNC_TABLES = ['places', 'vehicles', 'bareme_years', 'bareme_rates', 'fiscal_years', 'trips', 'trip_expenses'] as const
export const PULL_TABLES = [...SYNC_TABLES, 'exports', 'trip_events'] as const
export type SyncTableName = (typeof SYNC_TABLES)[number]
export type PullTableName = (typeof PULL_TABLES)[number]

export interface RowOf {
  places: Place
  vehicles: Vehicle
  bareme_years: BaremeYear
  bareme_rates: BaremeRate
  fiscal_years: FiscalYear
  trips: Trip
  trip_expenses: TripExpense
  exports: ExportRecord
  trip_events: TripEvent
}

export interface MetaRow {
  key: string
  value: string
}

export class CarnetDB extends Dexie {
  // « declare » : pas de champ initialisé qui écraserait les tables créées par Dexie.
  declare places: EntityTable<Local<Place>, 'id'>
  declare vehicles: EntityTable<Local<Vehicle>, 'id'>
  declare bareme_years: EntityTable<Local<BaremeYear>, 'id'>
  declare bareme_rates: EntityTable<Local<BaremeRate>, 'id'>
  declare fiscal_years: EntityTable<Local<FiscalYear>, 'id'>
  declare trips: EntityTable<Local<Trip>, 'id'>
  declare trip_expenses: EntityTable<Local<TripExpense>, 'id'>
  declare exports: EntityTable<Local<ExportRecord>, 'id'>
  declare trip_events: EntityTable<Local<TripEvent>, 'id'>
  declare meta: EntityTable<MetaRow, 'key'>

  constructor(name = 'carnet-de-bord') {
    super(name)
    this.version(1).stores({
      places: 'id, _dirty, role',
      vehicles: 'id, _dirty',
      bareme_years: 'id, _dirty, annee',
      bareme_rates: 'id, _dirty, annee',
      fiscal_years: 'id, _dirty',
      trips: 'id, _dirty, date, export_id',
      trip_expenses: 'id, _dirty, trip_id',
      exports: 'id, _dirty',
      trip_events: 'id, _dirty, trip_id',
      meta: 'key',
    })
  }
}

export const db = new CarnetDB()
```

- [ ] **Step 4 : Implémenter `src/db/repo.ts`**

```ts
import type { BaseRow } from '../domain/types'
import { nowISO } from '../lib/dates'
import { SYNC_TABLES, type CarnetDB, type Local, type RowOf, type SyncTableName } from './db'

const listeners = new Set<() => void>()

// Le moteur de synchro s'abonne ici pour pousser peu après chaque écriture.
export function onLocalWrite(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function newId(): string {
  return crypto.randomUUID()
}

export function newRow<T extends BaseRow>(fields: Omit<T, keyof BaseRow>): T {
  const now = nowISO()
  return { ...fields, id: newId(), created_at: now, updated_at: now, deleted_at: null } as T
}

export function stripLocal<T extends object>(row: T): Omit<T, '_dirty' | '_rev'> {
  const copy = { ...row } as Record<string, unknown>
  delete copy._dirty
  delete copy._rev
  return copy as Omit<T, '_dirty' | '_rev'>
}

export async function saveRows<K extends SyncTableName>(db: CarnetDB, table: K, rows: RowOf[K][]): Promise<void> {
  const tbl = db.table<Local<RowOf[K]>, string>(table)
  await db.transaction('rw', tbl, async () => {
    for (const row of rows) {
      const existing = await tbl.get(row.id)
      await tbl.put({ ...row, updated_at: nowISO(), _dirty: 1, _rev: (existing?._rev ?? 0) + 1 } as Local<RowOf[K]>)
    }
  })
  listeners.forEach((fn) => fn())
}

export function saveRow<K extends SyncTableName>(db: CarnetDB, table: K, row: RowOf[K]): Promise<void> {
  return saveRows(db, table, [row])
}

export async function softDelete<K extends SyncTableName>(db: CarnetDB, table: K, id: string): Promise<void> {
  const row = await db.table<Local<RowOf[K]>, string>(table).get(id)
  if (!row) return
  await saveRow(db, table, { ...stripLocal(row), deleted_at: nowISO() } as RowOf[K])
}

export async function countDirty(db: CarnetDB): Promise<number> {
  const counts = await Promise.all(SYNC_TABLES.map((t) => db.table(t).where('_dirty').equals(1).count()))
  return counts.reduce((a, b) => a + b, 0)
}

export async function getMeta(db: CarnetDB, key: string): Promise<string | null> {
  return (await db.meta.get(key))?.value ?? null
}

export async function setMeta(db: CarnetDB, key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}
```

- [ ] **Step 5 : Lancer les tests**

Run : `npx vitest run src/db && npx tsc -b`
Expected : PASS (7 tests), aucune erreur TypeScript.

- [ ] **Step 6 : Commit**

```bash
git add src/db
git commit -m "feat: base locale Dexie et écritures locales marquées pour la synchro" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 9 : Moteur de synchronisation (push / pull / orchestration)

**Files :**
- Create : `src/sync/remote.ts`, `src/sync/push.ts`, `src/sync/pull.ts`, `src/sync/engine.ts`
- Test : `src/sync/fake-remote.ts` (utilitaire de test), `src/sync/sync.test.ts`

**Interfaces :**
- Consumes : `CarnetDB`, `SYNC_TABLES`, `PULL_TABLES`, `Local` (Task 8) ; `stripLocal`, `saveRow`, `countDirty`, `getMeta`, `setMeta`, `onLocalWrite` (Task 8) ; `nowISO` (Task 1).
- Produces :
  - `remote.ts` : `type ServerRow = Record<string, unknown> & { id: string; updated_at: string }`, `interface UpsertResult { error: string | null; fatal: boolean }`, `interface RemoteApi { upsert(table: string, rows: Record<string, unknown>[]): Promise<UpsertResult>; fetchSince(table: string, cursor: string | null, limit: number): Promise<{ rows: ServerRow[]; error: string | null }>; fetchById(table: string, id: string): Promise<ServerRow | null> }`, `supabaseRemote(client: SupabaseClient): RemoteApi`, `class SyncError extends Error { fatal: boolean }`
  - `push.ts` : `interface Rejection { table: string; id: string; error: string }`, `interface PushResult { pushed: number; rejected: Rejection[] }`, `toServer(row: object): Record<string, unknown>`, `pushDirty(db: CarnetDB, remote: RemoteApi): Promise<PushResult>`
  - `pull.ts` : `pullAll(db: CarnetDB, remote: RemoteApi, pageSize?: number): Promise<number>`
  - `engine.ts` : `interface SyncState { status: 'idle' | 'syncing' | 'offline' | 'error'; pending: number; lastSync: string | null; message: string | null }`, `interface SyncEngine { syncNow(): Promise<void>; schedule(): void; start(): () => void; getState(): SyncState; subscribe(fn: (s: SyncState) => void): () => void }`, `createSyncEngine(opts: EngineOptions): SyncEngine` avec `EngineOptions = { db: CarnetDB; remote: RemoteApi; afterPull?: () => Promise<void>; isOnline?: () => boolean; intervalMs?: number }`

- [ ] **Step 1 : `src/sync/remote.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type ServerRow = Record<string, unknown> & { id: string; updated_at: string }

export interface UpsertResult {
  error: string | null
  fatal: boolean // réseau ou session : inutile d'insister ligne par ligne
}

export interface RemoteApi {
  upsert(table: string, rows: Record<string, unknown>[]): Promise<UpsertResult>
  fetchSince(table: string, cursor: string | null, limit: number): Promise<{ rows: ServerRow[]; error: string | null }>
  fetchById(table: string, id: string): Promise<ServerRow | null>
}

export class SyncError extends Error {
  fatal: boolean
  constructor(message: string, fatal: boolean) {
    super(message)
    this.fatal = fatal
  }
}

// Erreurs métier Postgres = code SQLSTATE (ex. P0001). Pas de code = réseau ; PGRST3xx = session.
const isFatal = (code: string | undefined) => !code || code.startsWith('PGRST3')

export function supabaseRemote(client: SupabaseClient): RemoteApi {
  return {
    async upsert(table, rows) {
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' })
      return error ? { error: error.message, fatal: isFatal(error.code) } : { error: null, fatal: false }
    },
    async fetchSince(table, cursor, limit) {
      let q = client.from(table).select('*').order('updated_at', { ascending: true }).limit(limit)
      if (cursor) q = q.gte('updated_at', cursor)
      const { data, error } = await q
      return { rows: (data ?? []) as ServerRow[], error: error?.message ?? null }
    },
    async fetchById(table, id) {
      const { data } = await client.from(table).select('*').eq('id', id).maybeSingle()
      return (data as ServerRow | null) ?? null
    },
  }
}
```

- [ ] **Step 2 : Serveur simulé pour les tests — `src/sync/fake-remote.ts`**

```ts
import type { RemoteApi, ServerRow } from './remote'

// Faux Supabase en mémoire : horodate chaque écriture, peut refuser des ids ou simuler une coupure.
export function fakeRemote() {
  const tables = new Map<string, Map<string, ServerRow>>()
  const rejectIds = new Set<string>()
  let offline = false
  let clock = 0
  const tick = () => new Date(Date.UTC(2026, 8, 15, 10, 0, 0, clock++)).toISOString()
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map())
    return tables.get(name)!
  }
  const api: RemoteApi = {
    async upsert(name, rows) {
      if (offline) return { error: 'Failed to fetch', fatal: true }
      if (rows.some((r) => rejectIds.has(r.id as string))) return { error: 'Trajet exporté : verrouillé', fatal: false }
      for (const r of rows) table(name).set(r.id as string, { ...(r as ServerRow), updated_at: tick() })
      return { error: null, fatal: false }
    },
    async fetchSince(name, cursor, limit) {
      if (offline) return { rows: [], error: 'Failed to fetch' }
      const rows = [...table(name).values()]
        .filter((r) => !cursor || r.updated_at >= cursor)
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
        .slice(0, limit)
      return { rows, error: null }
    },
    async fetchById(name, id) {
      return table(name).get(id) ?? null
    },
  }
  return {
    api,
    rejectIds,
    setOffline: (v: boolean) => {
      offline = v
    },
    put: (name: string, row: Record<string, unknown>) => table(name).set(row.id as string, { ...(row as ServerRow), updated_at: tick() }),
    get: (name: string, id: string) => table(name).get(id),
  }
}
```

- [ ] **Step 3 : Tests (échec attendu)**

`src/sync/sync.test.ts` :
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CarnetDB } from '../db/db'
import { countDirty, saveRow } from '../db/repo'
import { makeTrip, makeVehicle } from '../test/fixtures'
import { createSyncEngine } from './engine'
import { fakeRemote } from './fake-remote'
import { pullAll } from './pull'
import { pushDirty } from './push'
import { SyncError } from './remote'

let db: CarnetDB
beforeEach(() => {
  db = new CarnetDB(`test-${crypto.randomUUID()}`)
})

describe('pushDirty', () => {
  it('envoie les lignes à pousser sans champs locaux ni owner_id, puis les marque propres', async () => {
    const r = fakeRemote()
    const v = makeVehicle()
    await saveRow(db, 'vehicles', { ...v, owner_id: 'x' } as typeof v)
    const res = await pushDirty(db, r.api)
    expect(res).toEqual({ pushed: 1, rejected: [] })
    expect(r.get('vehicles', v.id)).not.toHaveProperty('_dirty')
    expect(r.get('vehicles', v.id)).not.toHaveProperty('owner_id')
    expect((await db.vehicles.get(v.id))?._dirty).toBe(0)
  })

  it('une écriture locale pendant l’envoi garde la ligne à pousser', async () => {
    const r = fakeRemote()
    const v = makeVehicle()
    await saveRow(db, 'vehicles', v)
    const upsert = r.api.upsert
    r.api.upsert = async (t, rows) => {
      await saveRow(db, 'vehicles', { ...v, nom: 'Modifiée pendant l’envoi' })
      return upsert(t, rows)
    }
    await pushDirty(db, r.api)
    expect(await db.vehicles.get(v.id)).toMatchObject({ _dirty: 1, _rev: 2 })
  })

  it('refus serveur : la version serveur remplace la locale et le refus est signalé', async () => {
    const r = fakeRemote()
    const t = makeTrip({ statut: 'exporte', motif: 'Motif verrouillé côté serveur' })
    r.put('trips', t)
    r.rejectIds.add(t.id)
    await saveRow(db, 'trips', { ...t, statut: 'valide', motif: 'Tentative de modification locale' })
    const res = await pushDirty(db, r.api)
    expect(res.rejected).toHaveLength(1)
    expect(await db.trips.get(t.id)).toMatchObject({ motif: 'Motif verrouillé côté serveur', _dirty: 0 })
  })

  it('coupure réseau : SyncError fatale, les lignes restent à pousser', async () => {
    const r = fakeRemote()
    r.setOffline(true)
    await saveRow(db, 'vehicles', makeVehicle())
    await expect(pushDirty(db, r.api)).rejects.toBeInstanceOf(SyncError)
    expect(await countDirty(db)).toBe(1)
  })
})

describe('pullAll', () => {
  it('importe les lignes serveur, pagine et mémorise le curseur', async () => {
    const r = fakeRemote()
    for (let i = 0; i < 3; i++) r.put('trips', makeTrip())
    expect(await pullAll(db, r.api, 2)).toBeGreaterThanOrEqual(3)
    expect(await db.trips.count()).toBe(3)
    expect((await db.meta.get('cursor:trips'))?.value).toBeTruthy()
  })

  it('n’écrase pas une ligne locale encore à pousser', async () => {
    const r = fakeRemote()
    const t = makeTrip({ motif: 'Version serveur du motif' })
    r.put('trips', t)
    await saveRow(db, 'trips', { ...t, motif: 'Version locale plus récente' })
    await pullAll(db, r.api)
    expect((await db.trips.get(t.id))?.motif).toBe('Version locale plus récente')
  })
})

describe('createSyncEngine', () => {
  it('pousse, tire, appelle afterPull et publie l’état', async () => {
    const r = fakeRemote()
    const afterPull = vi.fn(async () => {})
    const engine = createSyncEngine({ db, remote: r.api, afterPull, isOnline: () => true })
    await saveRow(db, 'vehicles', makeVehicle())
    await engine.syncNow()
    expect(afterPull).toHaveBeenCalledOnce()
    expect(engine.getState()).toMatchObject({ status: 'idle', pending: 0, message: null })
    expect(engine.getState().lastSync).not.toBeNull()
  })

  it('hors ligne : ne contacte pas le serveur', async () => {
    const r = fakeRemote()
    const spy = vi.spyOn(r.api, 'upsert')
    const engine = createSyncEngine({ db, remote: r.api, isOnline: () => false })
    await saveRow(db, 'vehicles', makeVehicle())
    await engine.syncNow()
    expect(spy).not.toHaveBeenCalled()
    expect(engine.getState()).toMatchObject({ status: 'offline', pending: 1 })
  })
})
```

- [ ] **Step 4 : Lancer (échec attendu)**

Run : `npx vitest run src/sync`
Expected : FAIL — `Failed to resolve import "./engine"`.

- [ ] **Step 5 : `src/sync/push.ts`**

```ts
import { SYNC_TABLES, type CarnetDB, type Local } from '../db/db'
import { SyncError, type RemoteApi, type ServerRow } from './remote'

export interface Rejection {
  table: string
  id: string
  error: string
}

export interface PushResult {
  pushed: number
  rejected: Rejection[]
}

type AnyLocal = Local<{ id: string }>

// Ce qui part au serveur : ni champs locaux, ni owner_id (posé par défaut = auth.uid()).
export function toServer(row: object): Record<string, unknown> {
  const copy = { ...row } as Record<string, unknown>
  delete copy._dirty
  delete copy._rev
  delete copy.owner_id
  return copy
}

// Ne marque propre que si la ligne n'a pas été réécrite localement pendant l'envoi.
async function markClean(db: CarnetDB, table: string, rows: AnyLocal[]) {
  const tbl = db.table<AnyLocal, string>(table)
  await db.transaction('rw', tbl, async () => {
    for (const row of rows) {
      const cur = await tbl.get(row.id)
      if (cur && cur._rev === row._rev) await tbl.update(row.id, { _dirty: 0 })
    }
  })
}

export async function pushDirty(db: CarnetDB, remote: RemoteApi): Promise<PushResult> {
  const result: PushResult = { pushed: 0, rejected: [] }
  for (const table of SYNC_TABLES) {
    const tbl = db.table<AnyLocal, string>(table)
    const dirty = await tbl.where('_dirty').equals(1).toArray()
    if (dirty.length === 0) continue

    const batch = await remote.upsert(table, dirty.map(toServer))
    if (!batch.error) {
      await markClean(db, table, dirty)
      result.pushed += dirty.length
      continue
    }
    if (batch.fatal) throw new SyncError(batch.error, true)

    // Lot refusé : on isole la ou les lignes fautives.
    for (const row of dirty) {
      const one = await remote.upsert(table, [toServer(row)])
      if (!one.error) {
        await markClean(db, table, [row])
        result.pushed++
        continue
      }
      if (one.fatal) throw new SyncError(one.error, true)
      const server: ServerRow | null = await remote.fetchById(table, row.id)
      if (server) await tbl.put({ ...server, _dirty: 0, _rev: row._rev } as AnyLocal)
      result.rejected.push({ table, id: row.id, error: one.error })
    }
  }
  return result
}
```

- [ ] **Step 6 : `src/sync/pull.ts`**

```ts
import { PULL_TABLES, type CarnetDB, type Local } from '../db/db'
import { getMeta, setMeta } from '../db/repo'
import { SyncError, type RemoteApi } from './remote'

type AnyLocal = Local<{ id: string }>

// Tire les lignes modifiées depuis le dernier curseur (updated_at serveur), table par table.
export async function pullAll(db: CarnetDB, remote: RemoteApi, pageSize = 1000): Promise<number> {
  let count = 0
  for (const table of PULL_TABLES) {
    const key = `cursor:${table}`
    let cursor = await getMeta(db, key)
    for (;;) {
      const { rows, error } = await remote.fetchSince(table, cursor, pageSize)
      if (error) throw new SyncError(error, true)
      const tbl = db.table<AnyLocal, string>(table)
      await db.transaction('rw', tbl, async () => {
        for (const row of rows) {
          const local = await tbl.get(row.id)
          if (local?._dirty === 1) continue // la version locale partira au prochain push
          await tbl.put({ ...row, _dirty: 0, _rev: local?._rev ?? 0 } as AnyLocal)
        }
      })
      count += rows.length
      const last = rows.at(-1)?.updated_at
      const avance = last != null && last !== cursor
      if (last != null) {
        cursor = last
        await setMeta(db, key, cursor)
      }
      if (rows.length < pageSize || !avance) break
    }
  }
  return count
}
```

- [ ] **Step 7 : `src/sync/engine.ts`**

```ts
import type { CarnetDB } from '../db/db'
import { countDirty, onLocalWrite } from '../db/repo'
import { nowISO } from '../lib/dates'
import { pullAll } from './pull'
import { pushDirty } from './push'
import { SyncError, type RemoteApi } from './remote'

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error'
  pending: number
  lastSync: string | null
  message: string | null
}

export interface SyncEngine {
  syncNow(): Promise<void>
  schedule(): void
  start(): () => void
  getState(): SyncState
  subscribe(fn: (s: SyncState) => void): () => void
}

export interface EngineOptions {
  db: CarnetDB
  remote: RemoteApi
  afterPull?: () => Promise<void> // amorçage du barème, calcul des km en attente…
  isOnline?: () => boolean
  intervalMs?: number
}

export function createSyncEngine(opts: EngineOptions): SyncEngine {
  const isOnline = opts.isOnline ?? (() => navigator.onLine)
  let state: SyncState = { status: 'idle', pending: 0, lastSync: null, message: null }
  const subs = new Set<(s: SyncState) => void>()
  let running: Promise<void> | null = null
  let rerun = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const set = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch }
    subs.forEach((fn) => fn(state))
  }

  async function run() {
    if (!isOnline()) {
      set({ status: 'offline', pending: await countDirty(opts.db) })
      return
    }
    set({ status: 'syncing' })
    try {
      const pushed = await pushDirty(opts.db, opts.remote)
      await pullAll(opts.db, opts.remote)
      await opts.afterPull?.()
      if ((await countDirty(opts.db)) > 0) await pushDirty(opts.db, opts.remote)
      const n = pushed.rejected.length
      set({
        status: 'idle',
        lastSync: nowISO(),
        message: n > 0 ? `${n} modification(s) refusée(s) par le serveur (trajet exporté ?)` : null,
      })
    } catch (e) {
      const fatal = e instanceof SyncError && e.fatal
      set({ status: fatal ? 'offline' : 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ pending: await countDirty(opts.db) })
    }
  }

  function syncNow(): Promise<void> {
    if (running) {
      rerun = true
      return running
    }
    running = (async () => {
      do {
        rerun = false
        await run()
      } while (rerun)
      running = null
    })()
    return running
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(() => void syncNow(), 2000)
  }

  function start() {
    const onOnline = () => void syncNow()
    const onOffline = () => set({ status: 'offline' })
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const interval = setInterval(() => void syncNow(), opts.intervalMs ?? 60_000)
    const off = onLocalWrite(schedule)
    void syncNow()
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(interval)
      clearTimeout(timer)
      off()
    }
  }

  return { syncNow, schedule, start, getState: () => state, subscribe: (fn) => (subs.add(fn), () => void subs.delete(fn)) }
}
```

- [ ] **Step 8 : Lancer les tests**

Run : `npx vitest run src/sync && npx tsc -b`
Expected : PASS (8 tests), aucune erreur TypeScript.

- [ ] **Step 9 : Commit**

```bash
git add src/sync
git commit -m "feat: synchro local-first (outbox, pull par curseur, refus serveur, hors ligne)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 10 : Google Maps (autocomplete, itinéraire) + calcul différé des km

**Files :**
- Create : `src/geo/maps.ts`, `src/geo/pending.ts`
- Test : `src/geo/pending.test.ts`
- Modify : `.env.local` (clé Google, non commitée)

**Interfaces :**
- Consumes : `env.mapsKey`, `LOCATION_BIAS` (Task 1) ; `round1` (Task 1) ; `kmTotal`, `computeStatut` (Task 3) ; `CarnetDB` (Task 8) ; `saveRow`, `stripLocal` (Task 8).
- Produces :
  - `maps.ts` : `mapsConfigured(): boolean`, `interface LatLng { lat: number; lng: number }`, `interface Suggestion { id: string; principal: string; secondaire: string }`, `interface ResolvedPlace { google_place_id: string; label: string; adresse: string; lat: number; lng: number }`, `interface AutocompleteSession { suggest(input: string): Promise<Suggestion[]>; resolve(id: string): Promise<ResolvedPlace> }`, `createAutocompleteSession(): AutocompleteSession`, `computeRouteKm(from: LatLng, to: LatLng): Promise<number>`
  - `pending.ts` : `type KmComputer = (from: LatLng, to: LatLng) => Promise<number>`, `resolvePendingKm(db: CarnetDB, computeKm: KmComputer): Promise<number>` (nombre de trajets complétés)

- [ ] **Step 1 : Clé Google Maps (action de Sam, guidée — annoncer avant)**

1. https://console.cloud.google.com → créer le projet « carnet-de-bord » → **Facturation** : associer un compte de facturation (carte bancaire).
2. **API et services → Bibliothèque** : activer **Maps JavaScript API**, **Places API (New)**, **Routes API**.
3. **Identifiants → Créer une clé API**. Restrictions :
   - Applications : **Sites web** → `https://swinghousechx.github.io/*`, `http://localhost:*`
   - API : uniquement les trois ci-dessus.
4. **Quotas** (page de chaque API) : plafond de requêtes par jour, par ex. 200 pour Routes et 500 pour Places — impossible de dépasser le quota gratuit.
5. Coller la clé dans `.env.local` : `VITE_GOOGLE_MAPS_KEY=AIza…`

- [ ] **Step 2 : Test du calcul différé (échec attendu)**

`src/geo/pending.test.ts` :
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CarnetDB } from '../db/db'
import { saveRow } from '../db/repo'
import { makePlace, makeTrip, makeVehicle } from '../test/fixtures'
import { resolvePendingKm } from './pending'

let db: CarnetDB
beforeEach(async () => {
  db = new CarnetDB(`test-${crypto.randomUUID()}`)
  await saveRow(db, 'vehicles', makeVehicle({ id: 'veh-A' }))
  await saveRow(db, 'places', makePlace({ id: 'p-dom', lat: 45.93, lng: 6.75 }))
  await saveRow(db, 'places', makePlace({ id: 'p-client', lat: 45.92, lng: 6.87 }))
})

const pending = (o = {}) =>
  makeTrip({ km_route: null, km_total: null, statut: 'brouillon', aller_retour: true, ...o })

describe('resolvePendingKm', () => {
  it('calcule les km en attente et revalide le trajet', async () => {
    const t = pending()
    await saveRow(db, 'trips', t)
    const compute = vi.fn(async () => 12.3)
    expect(await resolvePendingKm(db, compute)).toBe(1)
    expect(compute).toHaveBeenCalledWith({ lat: 45.93, lng: 6.75 }, { lat: 45.92, lng: 6.87 })
    expect(await db.trips.get(t.id)).toMatchObject({ km_route: 12.3, km_total: 24.6, statut: 'valide', _dirty: 1 })
  })

  it('ignore les trajets exportés, déjà calculés, corrigés à la main ou sans coordonnées', async () => {
    await saveRow(db, 'places', makePlace({ id: 'p-sans', lat: null, lng: null }))
    await saveRow(db, 'trips', pending({ statut: 'exporte' }))
    await saveRow(db, 'trips', pending({ km_route: 5, km_total: 10 }))
    await saveRow(db, 'trips', pending({ km_saisi: 8, km_total: 16 }))
    await saveRow(db, 'trips', pending({ arrivee_place_id: 'p-sans' }))
    const compute = vi.fn(async () => 1)
    expect(await resolvePendingKm(db, compute)).toBe(0)
    expect(compute).not.toHaveBeenCalled()
  })

  it('une erreur d’itinéraire laisse le trajet en brouillon', async () => {
    const t = pending()
    await saveRow(db, 'trips', t)
    expect(await resolvePendingKm(db, async () => { throw new Error('quota') })).toBe(0)
    expect((await db.trips.get(t.id))?.km_route).toBeNull()
  })
})
```

- [ ] **Step 3 : Lancer (échec attendu)**

Run : `npx vitest run src/geo`
Expected : FAIL — `Failed to resolve import "./pending"`.

- [ ] **Step 4 : `src/geo/maps.ts`**

```ts
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { LOCATION_BIAS } from '../config'
import { env } from '../env'
import { round1 } from '../lib/format'

export interface LatLng {
  lat: number
  lng: number
}

export interface Suggestion {
  id: string
  principal: string
  secondaire: string
}

export interface ResolvedPlace {
  google_place_id: string
  label: string
  adresse: string
  lat: number
  lng: number
}

export interface AutocompleteSession {
  suggest(input: string): Promise<Suggestion[]>
  resolve(id: string): Promise<ResolvedPlace>
}

// Types minimaux : on ne dépend que de ce qu'on utilise (robuste aux versions de @types/google.maps).
interface FText {
  text: string
}
interface PlaceObj {
  id: string
  displayName: string | null
  formattedAddress: string | null
  location: { lat(): number; lng(): number } | null
  fetchFields(o: { fields: string[] }): Promise<unknown>
}
interface Prediction {
  placeId: string
  text: FText
  mainText: FText | null
  secondaryText: FText | null
  toPlace(): PlaceObj
}
interface PlacesLib {
  AutocompleteSessionToken: new () => object
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(req: Record<string, unknown>): Promise<{ suggestions: { placePrediction: Prediction | null }[] }>
  }
}
interface RoutesLib {
  Route: { computeRoutes(req: Record<string, unknown>): Promise<{ routes?: { distanceMeters?: number }[] }> }
}
type LibName = Parameters<typeof importLibrary>[0]

let initialised = false
function ensureInit() {
  if (!env.mapsKey) throw new Error('Clé Google Maps manquante')
  if (!initialised) {
    setOptions({ key: env.mapsKey, v: 'weekly', language: 'fr', region: 'FR' })
    initialised = true
  }
}

export function mapsConfigured(): boolean {
  return Boolean(env.mapsKey)
}

// Une session = une recherche + une sélection (regroupées pour la facturation Google).
export function createAutocompleteSession(): AutocompleteSession {
  let token: object | null = null
  const predictions = new Map<string, Prediction>()
  return {
    async suggest(input) {
      if (input.trim().length < 3) return []
      ensureInit()
      const lib = (await importLibrary('places' as LibName)) as unknown as PlacesLib
      token ??= new lib.AutocompleteSessionToken()
      const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: token,
        language: 'fr',
        region: 'fr',
        includedRegionCodes: ['fr', 'ch', 'it'],
        locationBias: LOCATION_BIAS,
      })
      predictions.clear()
      return suggestions.flatMap((s) => {
        const p = s.placePrediction
        if (!p) return []
        predictions.set(p.placeId, p)
        return [{ id: p.placeId, principal: p.mainText?.text ?? p.text.text, secondaire: p.secondaryText?.text ?? '' }]
      })
    },
    async resolve(id) {
      const p = predictions.get(id)
      if (!p) throw new Error('Suggestion expirée, relance la recherche')
      const place = p.toPlace()
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
      token = null
      if (!place.location) throw new Error('Lieu sans coordonnées')
      return {
        google_place_id: place.id,
        label: place.displayName ?? p.text.text,
        adresse: place.formattedAddress ?? p.text.text,
        lat: place.location.lat(),
        lng: place.location.lng(),
      }
    },
  }
}

// Itinéraire routier standard (sans trafic), distance aller en km à 0,1 près.
export async function computeRouteKm(from: LatLng, to: LatLng): Promise<number> {
  ensureInit()
  const { Route } = (await importLibrary('routes' as LibName)) as unknown as RoutesLib
  const { routes } = await Route.computeRoutes({
    origin: from,
    destination: to,
    travelMode: 'DRIVING',
    routingPreference: 'TRAFFIC_UNAWARE',
    fields: ['distanceMeters'],
    language: 'fr',
    region: 'fr',
  })
  const meters = routes?.[0]?.distanceMeters
  if (meters == null) throw new Error('Itinéraire introuvable')
  return round1(meters / 1000)
}
```

- [ ] **Step 5 : `src/geo/pending.ts`**

```ts
import type { CarnetDB } from '../db/db'
import { saveRow, stripLocal } from '../db/repo'
import { computeStatut, kmTotal } from '../domain/rules'
import type { Trip } from '../domain/types'
import type { LatLng } from './maps'

export type KmComputer = (from: LatLng, to: LatLng) => Promise<number>

// Trajets saisis hors ligne : calcule les km au retour du réseau, puis revalide.
export async function resolvePendingKm(db: CarnetDB, computeKm: KmComputer): Promise<number> {
  const [trips, places, vehicles] = await Promise.all([db.trips.toArray(), db.places.toArray(), db.vehicles.toArray()])
  const byId = new Map(places.map((p) => [p.id, p]))
  let done = 0
  for (const t of trips) {
    if (t.deleted_at || t.statut === 'exporte' || t.km_route != null || t.km_saisi != null) continue
    const a = t.depart_place_id ? byId.get(t.depart_place_id) : undefined
    const b = t.arrivee_place_id ? byId.get(t.arrivee_place_id) : undefined
    if (a?.lat == null || a.lng == null || b?.lat == null || b.lng == null) continue
    try {
      const km = await computeKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng })
      const next: Trip = { ...stripLocal(t), km_route: km, km_total: kmTotal(km, null, t.aller_retour) }
      next.statut = computeStatut(next, { vehicles, places })
      await saveRow(db, 'trips', next)
      done++
    } catch {
      // Réseau ou quota : on réessaiera à la prochaine synchro.
    }
  }
  return done
}
```

- [ ] **Step 6 : Lancer les tests**

Run : `npx vitest run src/geo && npx tsc -b`
Expected : PASS (3 tests), aucune erreur TypeScript. (`maps.ts` est vérifié dans le navigateur en Task 13.)

- [ ] **Step 7 : Commit**

```bash
git add src/geo
git commit -m "feat: Google Maps (Places New, Routes) et calcul différé des km" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 11 : Coquille de l'app (connexion, synchro, kit UI style iOS, navigation)

**Files :**
- Create : `src/lib/parse.ts`, `src/app/supabase.ts`, `src/app/seed.ts`, `src/app/sync.ts`, `src/hooks/useData.ts`, `src/hooks/useSyncState.ts`
- Create : `src/ui/icons.tsx`, `src/ui/NavBar.tsx`, `src/ui/List.tsx`, `src/ui/Sheet.tsx`, `src/ui/Segmented.tsx`, `src/ui/Toggle.tsx`, `src/ui/ActionSheet.tsx`, `src/ui/Chip.tsx`, `src/ui/Banner.tsx`, `src/ui/TabBar.tsx`, `src/ui/Field.tsx`, `src/ui/Button.tsx`, `src/ui/ActivityDot.tsx`, `src/ui/SyncBadge.tsx`
- Create : `src/screens/Login.tsx` + écrans provisoires `src/screens/Home.tsx`, `Recap.tsx`, `Settings.tsx`, `TripSheet.tsx`, `VehicleSheet.tsx`, `BaremeSheet.tsx` (remplacés en Tasks 12 à 15)
- Create : `.claude/launch.json`
- Modify : `src/App.tsx` (remplacement complet), `src/index.css` (ajout en fin de fichier)
- Test : `src/lib/parse.test.ts`, `src/app/seed.test.ts`

**Interfaces :**
- Consumes : tout ce qui précède.
- Produces :
  - `parse.ts` : `parseDecimal(s: string): number | null`
  - `app/supabase.ts` : `supabase: SupabaseClient | null`
  - `app/seed.ts` : `ensureBaremeSeed(db: CarnetDB): Promise<boolean>`
  - `app/sync.ts` : `syncEngine: SyncEngine | null`
  - `hooks/useData.ts` : `interface AppData extends CalcData { places: Place[]; exports: ExportRecord[] }` (lignes supprimées exclues), `useData(): { data: AppData; calc: Map<string, TripCalc> } | undefined`
  - `hooks/useSyncState.ts` : `useSyncState(): SyncState`
  - UI : `IconHome, IconChart, IconGear, IconPlus, IconChevron, IconLock, IconPin, IconSearch` (`{ className?: string }`) ; `LargeTitle({ title, subtitle?, right? })`, `NavButton({ children, onClick, disabled?, bold?, label? })` ; `Section({ header?, footer?, children })`, `Row({ label, value?, detail?, onClick?, chevron?, tone?, accessory?, leading? })` ; `Sheet({ open, title, onCancel, onConfirm?, confirmLabel?, confirmDisabled?, children })` ; `Segmented<T>({ value, options, onChange })` ; `Toggle({ checked, onChange, label })` ; `ActionSheet({ open, title?, message?, actions, onCancel, children? })` + `interface SheetAction { label; onClick; tone?; bold? }` ; `Chip({ label, selected?, onClick, leading? })` ; `Banner({ children, onClick? })` ; `type Tab = 'home' | 'recap' | 'settings'`, `TabBar({ tab, onChange })` ; `TextRow({ label, value, onChange, placeholder?, type?, inputMode?, autoComplete?, autoFocus? })`, `TextAreaRow({ value, onChange, placeholder? })` ; `PrimaryButton({ children, onClick?, disabled?, type?, tone? })` ; `ActivityDot({ activite })` ; `SyncBadge()`
  - Props définitives des écrans : `HomeProps { data: AppData; onOpenTrip: (id?: string) => void; onGoto: (t: Tab) => void }`, `RecapProps { data: AppData; calc: Map<string, TripCalc>; onOpenTrip: (id: string) => void }`, `SettingsProps { data: AppData; onOpenVehicle: (id?: string) => void; onOpenBareme: (annee: number) => void }`, `TripSheetProps { data: AppData; calc: Map<string, TripCalc>; tripId?: string; prefill?: Partial<Trip>; onClose: () => void; onNext: (prefill: Partial<Trip>) => void }`, `VehicleSheetProps { data: AppData; vehicleId?: string; onClose: () => void }`, `BaremeSheetProps { data: AppData; annee: number; onClose: () => void }`

- [ ] **Step 1 : Tests (échec attendu)**

`src/lib/parse.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { parseDecimal } from './parse'

describe('parseDecimal', () => {
  it('accepte virgule ou point, refuse le vide et le texte', () => {
    expect(parseDecimal('12,5')).toBe(12.5)
    expect(parseDecimal(' 7.25 ')).toBe(7.25)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
  })
})
```

`src/app/seed.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { CarnetDB } from '../db/db'
import { ensureBaremeSeed } from './seed'

describe('ensureBaremeSeed', () => {
  it('pré-remplit le barème 2026 une seule fois', async () => {
    const db = new CarnetDB(`test-${crypto.randomUUID()}`)
    expect(await ensureBaremeSeed(db)).toBe(true)
    expect(await ensureBaremeSeed(db)).toBe(false)
    expect(await db.bareme_years.count()).toBe(1)
    expect(await db.bareme_rates.count()).toBe(15)
    expect((await db.bareme_rates.toArray()).every((r) => r._dirty === 1)).toBe(true)
  })
})
```

Run : `npx vitest run src/lib/parse.test.ts src/app/seed.test.ts` → FAIL (imports introuvables).

- [ ] **Step 2 : `src/lib/parse.ts` et `src/app/seed.ts`**

`src/lib/parse.ts` :
```ts
// Saisie numérique FR : « 12,5 » ou « 12.5 ».
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
```

`src/app/seed.ts` :
```ts
import type { CarnetDB } from '../db/db'
import { saveRow, saveRows } from '../db/repo'
import {
  buildBaremeRows, DEFAULT_BAREME_ANNEE, DEFAULT_BAREME_SOURCE, DEFAULT_MAJORATION_ELECTRIQUE, DEFAULT_RATES,
} from '../domain/default-bareme'

// Appelé après un pull réussi : n'amorce que si ni le serveur ni le local n'ont de barème.
export async function ensureBaremeSeed(db: CarnetDB): Promise<boolean> {
  const years = (await db.bareme_years.toArray()).filter((y) => !y.deleted_at)
  if (years.length > 0) return false
  const { year, rates } = buildBaremeRows(DEFAULT_BAREME_ANNEE, DEFAULT_MAJORATION_ELECTRIQUE, DEFAULT_BAREME_SOURCE, DEFAULT_RATES)
  await saveRow(db, 'bareme_years', year)
  await saveRows(db, 'bareme_rates', rates)
  return true
}
```

Run : `npx vitest run src/lib/parse.test.ts src/app/seed.test.ts` → PASS.

- [ ] **Step 3 : Client Supabase, moteur de synchro, hooks**

`src/app/supabase.ts` :
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../env'

export const supabase: SupabaseClient | null =
  env.supabaseUrl && env.supabaseKey
    ? createClient(env.supabaseUrl, env.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'carnet-de-bord-auth' },
      })
    : null
```

`src/app/sync.ts` :
```ts
import { SYNC_INTERVAL_MS } from '../config'
import { db } from '../db/db'
import { computeRouteKm, mapsConfigured } from '../geo/maps'
import { resolvePendingKm } from '../geo/pending'
import { createSyncEngine, type SyncEngine } from '../sync/engine'
import { supabaseRemote } from '../sync/remote'
import { ensureBaremeSeed } from './seed'
import { supabase } from './supabase'

export const syncEngine: SyncEngine | null = supabase
  ? createSyncEngine({
      db,
      remote: supabaseRemote(supabase),
      intervalMs: SYNC_INTERVAL_MS,
      afterPull: async () => {
        await ensureBaremeSeed(db)
        if (mapsConfigured()) await resolvePendingKm(db, computeRouteKm)
      },
    })
  : null
```

`src/hooks/useData.ts` :
```ts
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../db/db'
import { computeAll, type CalcData, type TripCalc } from '../domain/chain'
import type { ExportRecord, Place } from '../domain/types'

export interface AppData extends CalcData {
  places: Place[]
  exports: ExportRecord[]
}

const alive = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at)

// Toutes les données (petites : un utilisateur) + calculs, recalculés à chaque écriture locale.
export function useData(): { data: AppData; calc: Map<string, TripCalc> } | undefined {
  const data = useLiveQuery(async (): Promise<AppData> => {
    const [trips, expenses, vehicles, fiscalYears, baremeYears, rates, places, exports] = await Promise.all([
      db.trips.toArray(),
      db.trip_expenses.toArray(),
      db.vehicles.toArray(),
      db.fiscal_years.toArray(),
      db.bareme_years.toArray(),
      db.bareme_rates.toArray(),
      db.places.toArray(),
      db.exports.toArray(),
    ])
    return {
      trips: alive(trips),
      expenses: alive(expenses),
      vehicles: alive(vehicles),
      fiscalYears: alive(fiscalYears),
      baremeYears: alive(baremeYears),
      rates: alive(rates),
      places: alive(places),
      exports: alive(exports),
    }
  }, [])
  const calc = useMemo(() => (data ? computeAll(data) : undefined), [data])
  return data && calc ? { data, calc } : undefined
}
```

`src/hooks/useSyncState.ts` :
```ts
import { useEffect, useState } from 'react'
import { syncEngine } from '../app/sync'
import type { SyncState } from '../sync/engine'

const NON_CONFIGURE: SyncState = { status: 'offline', pending: 0, lastSync: null, message: 'Synchro non configurée' }

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(() => syncEngine?.getState() ?? NON_CONFIGURE)
  useEffect(() => syncEngine?.subscribe(setState), [])
  return state
}
```

- [ ] **Step 4 : Kit UI — séparateurs iOS dans `src/index.css` (ajouter en fin de fichier)**

```css
/* Listes groupées : séparateur fin décalé de 16 px, comme sur iOS. */
.ios-list > * + * {
  position: relative;
}
.ios-list > * + *::before {
  content: '';
  position: absolute;
  top: 0;
  left: 16px;
  right: 0;
  border-top: 0.5px solid var(--sep);
  pointer-events: none;
}
```

- [ ] **Step 5 : Kit UI — composants**

`src/ui/icons.tsx` :
```tsx
// Icônes à trait fin (esprit SF Symbols), sans dépendance.
type P = { className?: string }
const svg = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const IconHome = ({ className = 'size-6' }: P) => (
  <svg {...svg} className={className}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
)
export const IconChart = ({ className = 'size-6' }: P) => (
  <svg {...svg} className={className}><path d="M4 20V11M10 20V4M16 20v-8M21 20H3" /></svg>
)
export const IconGear = ({ className = 'size-6' }: P) => (
  <svg {...svg} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
  </svg>
)
export const IconPlus = ({ className = 'size-6' }: P) => (
  <svg {...svg} className={className}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconChevron = ({ className = 'size-4' }: P) => (
  <svg {...svg} className={className}><path d="m9 6 6 6-6 6" /></svg>
)
export const IconLock = ({ className = 'size-4' }: P) => (
  <svg {...svg} className={className}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
)
export const IconPin = ({ className = 'size-5' }: P) => (
  <svg {...svg} className={className}><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
)
export const IconSearch = ({ className = 'size-5' }: P) => (
  <svg {...svg} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)
```

`src/ui/NavBar.tsx` :
```tsx
import type { ReactNode } from 'react'

export function LargeTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="px-4 pt-[calc(env(safe-area-inset-top)+4px)] pb-3">
      <div className="flex h-11 items-center justify-end gap-3">{right}</div>
      <h1 className="text-[34px] leading-[41px] font-bold">{title}</h1>
      {subtitle && <p className="text-[15px] text-label2 first-letter:uppercase">{subtitle}</p>}
    </header>
  )
}

export function NavButton(props: { children: ReactNode; onClick: () => void; disabled?: boolean; bold?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      className={`flex min-h-11 min-w-11 items-center justify-center text-[17px] text-accent disabled:text-label3 ${props.bold ? 'font-semibold' : ''}`}
    >
      {props.children}
    </button>
  )
}
```

`src/ui/List.tsx` :
```tsx
import type { ReactNode } from 'react'
import { IconChevron } from './icons'

export function Section({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-4 mb-8">
      {header && <h2 className="px-4 pb-1.5 text-[13px] text-label2 uppercase">{header}</h2>}
      <div className="ios-list overflow-hidden rounded-[10px] bg-cell">{children}</div>
      {footer && <div className="px-4 pt-1.5 text-[13px] text-label2">{footer}</div>}
    </section>
  )
}

export interface RowProps {
  label: ReactNode
  value?: ReactNode
  detail?: ReactNode
  onClick?: () => void
  chevron?: boolean
  tone?: 'default' | 'accent' | 'destructive'
  accessory?: ReactNode
  leading?: ReactNode
}

export function Row({ label, value, detail, onClick, chevron, tone = 'default', accessory, leading }: RowProps) {
  const color = tone === 'accent' ? 'text-accent' : tone === 'destructive' ? 'text-red' : ''
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1 py-2.5">
        <div className={`truncate ${color}`}>{label}</div>
        {detail && <div className="truncate text-[15px] text-label2">{detail}</div>}
      </div>
      {value != null && <div className="shrink-0 text-label2 tabular">{value}</div>}
      {accessory}
      {chevron && <IconChevron className="size-4 shrink-0 text-label3" />}
    </>
  )
  const cls = 'flex min-h-11 w-full items-center gap-3 px-4 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} active:bg-fill`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
```

`src/ui/Sheet.tsx` :
```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { NavButton } from './NavBar'

export interface SheetProps {
  open: boolean
  title: string
  onCancel: () => void
  onConfirm?: () => void
  confirmLabel?: string
  confirmDisabled?: boolean
  children: ReactNode
}

// Feuille modale iOS : monte du bas, « Annuler » à gauche, action principale à droite.
export function Sheet({ open, title, onCancel, onConfirm, confirmLabel = 'OK', confirmDisabled, children }: SheetProps) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!open) return setShown(false)
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40">
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`} onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] bottom-0 flex flex-col rounded-t-[12px] bg-bg transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${shown ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <header className="flex h-14 shrink-0 items-center justify-between px-4">
          <NavButton onClick={onCancel}>Annuler</NavButton>
          <h2 className="truncate px-2 text-[17px] font-semibold">{title}</h2>
          {onConfirm ? (
            <NavButton onClick={onConfirm} disabled={confirmDisabled} bold>
              {confirmLabel}
            </NavButton>
          ) : (
            <span className="min-w-11" />
          )}
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+24px)]">{children}</div>
      </div>
    </div>
  )
}
```

`src/ui/Segmented.tsx` :
```tsx
// value = null : aucune option sélectionnée (question sans réponse).
export function Segmented<T extends string>(props: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="flex rounded-[9px] bg-fill p-0.5">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          onClick={() => props.onChange(o.value)}
          className={`h-8 flex-1 rounded-[7px] text-[13px] font-medium transition-colors duration-200 ${o.value === props.value ? 'bg-cell shadow-[0_3px_8px_rgba(0,0,0,0.12)]' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
```

`src/ui/Toggle.tsx` :
```tsx
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-green' : 'bg-fill'}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15)] transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}
```

`src/ui/ActionSheet.tsx` :
```tsx
import type { ReactNode } from 'react'

export interface SheetAction {
  label: string
  onClick: () => void
  tone?: 'default' | 'destructive'
  bold?: boolean
}

// Feuille d'action iOS pour les confirmations (export, réouverture, suppression).
export function ActionSheet(props: {
  open: boolean
  title?: string
  message?: string
  actions: SheetAction[]
  onCancel: () => void
  children?: ReactNode
}) {
  if (!props.open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 px-2 pb-[calc(env(safe-area-inset-bottom)+8px)]" onClick={props.onCancel}>
      <div className="w-full space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="ios-list overflow-hidden rounded-[14px] bg-cell text-center">
          {(props.title || props.message || props.children) && (
            <div className="space-y-1 px-4 py-3">
              {props.title && <p className="text-[13px] font-semibold text-label2">{props.title}</p>}
              {props.message && <p className="text-[13px] text-label2">{props.message}</p>}
              {props.children}
            </div>
          )}
          {props.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className={`block h-14 w-full text-[20px] active:bg-fill ${a.tone === 'destructive' ? 'text-red' : 'text-accent'} ${a.bold ? 'font-semibold' : ''}`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={props.onCancel} className="h-14 w-full rounded-[14px] bg-cell text-[20px] font-semibold text-accent active:bg-fill">
          Annuler
        </button>
      </div>
    </div>
  )
}
```

`src/ui/Chip.tsx` :
```tsx
import type { ReactNode } from 'react'

export function Chip({ label, selected, onClick, leading }: { label: string; selected?: boolean; onClick: () => void; leading?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] ${selected ? 'bg-accent text-white' : 'bg-cell active:bg-fill'}`}
    >
      {leading}
      {label}
    </button>
  )
}
```

`src/ui/Banner.tsx` :
```tsx
import type { ReactNode } from 'react'
import { IconChevron } from './icons'

export function Banner({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <div className="mx-4 mb-6">
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-[10px] bg-cell px-4 py-3 text-left text-[15px] active:bg-fill">
        <span className="size-2 shrink-0 rounded-full bg-orange" />
        <span className="flex-1">{children}</span>
        <IconChevron className="size-4 text-label3" />
      </button>
    </div>
  )
}
```

`src/ui/TabBar.tsx` :
```tsx
import type { ReactNode } from 'react'
import { IconChart, IconGear, IconHome } from './icons'

export type Tab = 'home' | 'recap' | 'settings'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Trajets', icon: <IconHome /> },
  { id: 'recap', label: 'Récap', icon: <IconChart /> },
  { id: 'settings', label: 'Réglages', icon: <IconGear /> },
]

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t-[0.5px] border-sep bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="flex h-[49px]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${tab === t.id ? 'text-accent' : 'text-label2'}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
```

`src/ui/Field.tsx` :
```tsx
import type { HTMLAttributes } from 'react'

export function TextRow(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
  autoFocus?: boolean
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 px-4">
      <span className="shrink-0">{props.label}</span>
      <input
        className="min-w-0 flex-1 bg-transparent py-2.5 text-right outline-none placeholder:text-label3"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        autoComplete={props.autoComplete}
        autoFocus={props.autoFocus}
      />
    </label>
  )
}

export function TextAreaRow(props: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      rows={2}
      className="block w-full resize-none bg-transparent px-4 py-2.5 outline-none placeholder:text-label3"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
    />
  )
}
```

`src/ui/Button.tsx` :
```tsx
import type { ReactNode } from 'react'

export function PrimaryButton(props: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  tone?: 'accent' | 'plain'
}) {
  const tone = props.tone === 'plain' ? 'bg-cell text-accent' : 'bg-accent text-white'
  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`h-[50px] w-full rounded-[12px] text-[17px] font-semibold active:opacity-80 disabled:opacity-40 ${tone}`}
    >
      {props.children}
    </button>
  )
}
```

`src/ui/ActivityDot.tsx` :
```tsx
import type { Activite } from '../domain/types'

export function ActivityDot({ activite }: { activite: Activite }) {
  return <span aria-hidden="true" className={`inline-block size-2.5 shrink-0 rounded-full ${activite === 'swing_house' ? 'bg-indigo' : 'bg-green'}`} />
}
```

`src/ui/SyncBadge.tsx` :
```tsx
import { useSyncState } from '../hooks/useSyncState'

export function SyncBadge() {
  const s = useSyncState()
  const text =
    s.status === 'syncing' ? 'Synchro…'
    : s.status === 'offline' ? 'Hors ligne'
    : s.status === 'error' ? 'Erreur de synchro'
    : s.pending > 0 ? `${s.pending} en attente`
    : null
  if (!text) return null
  return <span className={`text-[13px] ${s.status === 'error' ? 'text-red' : 'text-label2'}`}>{text}</span>
}
```

- [ ] **Step 6 : Écran de connexion `src/screens/Login.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import { supabase } from '../app/supabase'
import { PrimaryButton } from '../ui/Button'
import { TextRow } from '../ui/Field'
import { Section } from '../ui/List'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) setError(navigator.onLine ? 'Email ou mot de passe incorrect.' : 'Connexion impossible hors ligne.')
  }

  return (
    <main className="min-h-full bg-bg pt-[calc(env(safe-area-inset-top)+72px)]">
      <h1 className="px-8 text-center text-[28px] font-bold">Carnet de bord</h1>
      <p className="px-8 pt-2 pb-8 text-center text-[15px] text-label2">Une seule connexion : l’app reste connectée ensuite.</p>
      <form onSubmit={submit}>
        <Section footer={error && <span className="text-red">{error}</span>}>
          <TextRow label="Email" value={email} onChange={setEmail} type="email" autoComplete="username" />
          <TextRow label="Mot de passe" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
        </Section>
        <div className="px-4">
          <PrimaryButton type="submit" disabled={busy || !email || !password}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </PrimaryButton>
        </div>
      </form>
    </main>
  )
}
```

- [ ] **Step 7 : Écrans provisoires (signatures définitives, contenu remplacé ensuite)**

`src/screens/Home.tsx` :
```tsx
import type { AppData } from '../hooks/useData'
import { LargeTitle } from '../ui/NavBar'
import type { Tab } from '../ui/TabBar'

export interface HomeProps {
  data: AppData
  onOpenTrip: (id?: string) => void
  onGoto: (t: Tab) => void
}

export default function Home(_props: HomeProps) {
  return <LargeTitle title="Trajets" />
}
```

`src/screens/Recap.tsx` :
```tsx
import type { TripCalc } from '../domain/chain'
import type { AppData } from '../hooks/useData'
import { LargeTitle } from '../ui/NavBar'

export interface RecapProps {
  data: AppData
  calc: Map<string, TripCalc>
  onOpenTrip: (id: string) => void
}

export default function Recap(_props: RecapProps) {
  return <LargeTitle title="Récap" />
}
```

`src/screens/Settings.tsx` :
```tsx
import type { AppData } from '../hooks/useData'
import { LargeTitle } from '../ui/NavBar'

export interface SettingsProps {
  data: AppData
  onOpenVehicle: (id?: string) => void
  onOpenBareme: (annee: number) => void
}

export default function Settings(_props: SettingsProps) {
  return <LargeTitle title="Réglages" />
}
```

`src/screens/TripSheet.tsx` :
```tsx
import type { TripCalc } from '../domain/chain'
import type { Trip } from '../domain/types'
import type { AppData } from '../hooks/useData'
import { Sheet } from '../ui/Sheet'

export interface TripSheetProps {
  data: AppData
  calc: Map<string, TripCalc>
  tripId?: string
  prefill?: Partial<Trip>
  onClose: () => void
  onNext: (prefill: Partial<Trip>) => void
}

export default function TripSheet({ onClose }: TripSheetProps) {
  return <Sheet open title="Trajet" onCancel={onClose}>{null}</Sheet>
}
```

`src/screens/VehicleSheet.tsx` :
```tsx
import type { AppData } from '../hooks/useData'
import { Sheet } from '../ui/Sheet'

export interface VehicleSheetProps {
  data: AppData
  vehicleId?: string
  onClose: () => void
}

export default function VehicleSheet({ onClose }: VehicleSheetProps) {
  return <Sheet open title="Véhicule" onCancel={onClose}>{null}</Sheet>
}
```

`src/screens/BaremeSheet.tsx` :
```tsx
import type { AppData } from '../hooks/useData'
import { Sheet } from '../ui/Sheet'

export interface BaremeSheetProps {
  data: AppData
  annee: number
  onClose: () => void
}

export default function BaremeSheet({ onClose }: BaremeSheetProps) {
  return <Sheet open title="Barème" onCancel={onClose}>{null}</Sheet>
}
```

- [ ] **Step 8 : `src/App.tsx` (remplacement complet — version définitive)**

```tsx
import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from './app/supabase'
import { syncEngine } from './app/sync'
import type { Trip } from './domain/types'
import { useData } from './hooks/useData'
import BaremeSheet from './screens/BaremeSheet'
import Home from './screens/Home'
import Login from './screens/Login'
import Recap from './screens/Recap'
import Settings from './screens/Settings'
import TripSheet from './screens/TripSheet'
import VehicleSheet from './screens/VehicleSheet'
import { TabBar, type Tab } from './ui/TabBar'

export type SheetState =
  | { kind: 'trip'; nonce: number; tripId?: string; prefill?: Partial<Trip> }
  | { kind: 'vehicle'; vehicleId?: string }
  | { kind: 'bareme'; annee: number }
  | null

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('home')
  const [sheet, setSheet] = useState<SheetState>(null)
  const loaded = useData()

  useEffect(() => {
    void navigator.storage?.persist?.()
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session && syncEngine) return syncEngine.start()
  }, [session])

  if (!supabase) {
    return (
      <main className="min-h-full bg-bg px-8 pt-24 text-center text-[15px] text-label2">
        Configuration manquante : variables VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.
      </main>
    )
  }
  if (session === undefined || !loaded) return <div className="min-h-full bg-bg" />
  if (!session) return <Login />

  const { data, calc } = loaded
  const openTrip = (tripId?: string, prefill?: Partial<Trip>) => setSheet({ kind: 'trip', nonce: Date.now(), tripId, prefill })

  return (
    <div className="min-h-full bg-bg pb-[calc(env(safe-area-inset-bottom)+72px)]">
      {tab === 'home' && <Home data={data} onOpenTrip={(id) => openTrip(id)} onGoto={setTab} />}
      {tab === 'recap' && <Recap data={data} calc={calc} onOpenTrip={(id) => openTrip(id)} />}
      {tab === 'settings' && (
        <Settings
          data={data}
          onOpenVehicle={(id) => setSheet({ kind: 'vehicle', vehicleId: id })}
          onOpenBareme={(annee) => setSheet({ kind: 'bareme', annee })}
        />
      )}
      <TabBar tab={tab} onChange={setTab} />
      {sheet?.kind === 'trip' && (
        <TripSheet
          key={sheet.nonce}
          data={data}
          calc={calc}
          tripId={sheet.tripId}
          prefill={sheet.prefill}
          onClose={() => setSheet(null)}
          onNext={(prefill) => openTrip(undefined, prefill)}
        />
      )}
      {sheet?.kind === 'vehicle' && <VehicleSheet data={data} vehicleId={sheet.vehicleId} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'bareme' && <BaremeSheet data={data} annee={sheet.annee} onClose={() => setSheet(null)} />}
    </div>
  )
}
```

- [ ] **Step 9 : `.claude/launch.json` (aperçu local)**

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "carnet", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

- [ ] **Step 10 : Vérifier**

Run : `npm test && npm run build` → tous les tests PASS, build OK.
Puis aperçu : `preview_start` (`name: carnet`), `resize_window` preset `mobile`, capture d'écran : écran de connexion centré, style iOS. **Sam se connecte lui-même** dans l'aperçu (ne jamais saisir son mot de passe à sa place). Après connexion : titre « Trajets » + barre d'onglets ; `read_console_messages` (onlyErrors) → aucune erreur ; dans Supabase (`execute_sql` : `select count(*) from bareme_rates;`) → 15 (amorçage poussé). Remettre `resize_window` preset `desktop`.

- [ ] **Step 11 : Commit**

```bash
git add -A
git commit -m "feat: coquille de l'app (connexion, synchro, kit UI iOS, navigation)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 12 : Réglages (véhicules, choix fiscal, favoris, barème, synchro, compte)

**Files :**
- Create : `src/screens/PlacePicker.tsx`, `src/app/vehicles.ts`
- Modify (remplacement complet des provisoires) : `src/screens/Settings.tsx`, `src/screens/VehicleSheet.tsx`, `src/screens/BaremeSheet.tsx`
- Test : `src/app/vehicles.test.ts`

**Interfaces :**
- Consumes : kit UI + hooks (Task 11) ; `createAutocompleteSession`, `mapsConfigured` (Task 10) ; `saveRow`, `saveRows`, `softDelete`, `newRow`, `stripLocal` (Task 8) ; `resolveVehicle`, `computeStatut` (Task 3) ; `buildBaremeRows` (Task 2) ; `syncEngine`, `supabase` (Task 11).
- Produces :
  - `PlacePicker.tsx` : `PlacePicker(props: { open: boolean; title: string; places: Place[]; onPick: (p: Place) => void; onCancel: () => void })` (défaut)
  - `app/vehicles.ts` : `dayBefore(date: string): string`, `overlaps(a: { date_debut: string; date_fin: string | null }, b: { date_debut: string; date_fin: string | null }): boolean`, `tripsToReassign(trips: Trip[], vehicles: Vehicle[], places: Place[]): Trip[]` (trajets non exportés dont le véhicule déduit de la date a changé, avec `vehicle_id` et `statut` recalculés)

- [ ] **Step 1 : Tests des règles véhicules (échec attendu)**

`src/app/vehicles.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { makeTrip, makeVehicle } from '../test/fixtures'
import { dayBefore, overlaps, tripsToReassign } from './vehicles'

describe('véhicules', () => {
  it('dayBefore gère les changements de mois et d’année', () => {
    expect(dayBefore('2026-12-15')).toBe('2026-12-14')
    expect(dayBefore('2027-01-01')).toBe('2026-12-31')
    expect(dayBefore('2028-03-01')).toBe('2028-02-29')
  })
  it('overlaps : périodes bornes incluses, fin vide = en cours', () => {
    expect(overlaps({ date_debut: '2020-01-01', date_fin: null }, { date_debut: '2026-12-15', date_fin: null })).toBe(true)
    expect(overlaps({ date_debut: '2020-01-01', date_fin: '2026-12-14' }, { date_debut: '2026-12-15', date_fin: null })).toBe(false)
    expect(overlaps({ date_debut: '2020-01-01', date_fin: '2026-12-15' }, { date_debut: '2026-12-15', date_fin: null })).toBe(true)
  })
  it('réaffecte les trajets non exportés au véhicule actif à leur date', () => {
    const a = makeVehicle({ id: 'veh-A', date_fin: '2026-12-14' })
    const b = makeVehicle({ id: 'veh-B', date_debut: '2026-12-15' })
    const avant = makeTrip({ date: '2026-12-10', vehicle_id: 'veh-A' })
    const apres = makeTrip({ date: '2026-12-20', vehicle_id: 'veh-A' })
    const exporte = makeTrip({ date: '2026-12-21', vehicle_id: 'veh-A', statut: 'exporte' })
    const res = tripsToReassign([avant, apres, exporte], [a, b], [])
    expect(res.map((t) => [t.id, t.vehicle_id])).toEqual([[apres.id, 'veh-B']])
  })
})
```

Run : `npx vitest run src/app/vehicles.test.ts` → FAIL (import introuvable).

- [ ] **Step 2 : `src/app/vehicles.ts`**

```ts
import { computeStatut, resolveVehicle } from '../domain/rules'
import type { Place, Trip, Vehicle } from '../domain/types'
import { todayISO } from '../lib/dates'

export function dayBefore(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() - 1)
  return todayISO(d)
}

type Periode = { date_debut: string; date_fin: string | null }

export function overlaps(a: Periode, b: Periode): boolean {
  const finA = a.date_fin ?? '9999-12-31'
  const finB = b.date_fin ?? '9999-12-31'
  return a.date_debut <= finB && b.date_debut <= finA
}

// Après une modification des véhicules : trajets non exportés à rattacher à un autre véhicule.
export function tripsToReassign(trips: Trip[], vehicles: Vehicle[], places: Place[]): Trip[] {
  return trips.flatMap((t) => {
    if (t.statut === 'exporte' || t.deleted_at) return []
    const id = resolveVehicle(t.date, vehicles)?.id ?? null
    if (id === t.vehicle_id) return []
    const next = { ...t, vehicle_id: id }
    return [{ ...next, statut: computeStatut(next, { vehicles, places }) }]
  })
}
```

Run : `npx vitest run src/app/vehicles.test.ts` → PASS.

- [ ] **Step 3 : `src/screens/PlacePicker.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { db } from '../db/db'
import { newRow, saveRow } from '../db/repo'
import { ROLE_LABEL, type Place, type PlaceRole } from '../domain/types'
import { createAutocompleteSession, mapsConfigured, type Suggestion } from '../geo/maps'
import { nowISO } from '../lib/dates'
import { IconPin, IconSearch } from '../ui/icons'
import { Row, Section } from '../ui/List'
import { Sheet } from '../ui/Sheet'

const ROLE_ORDER: PlaceRole[] = ['domicile', 'swing_house', 'lmnp']

export default function PlacePicker(props: {
  open: boolean
  title: string
  places: Place[]
  onPick: (p: Place) => void
  onCancel: () => void
}) {
  const session = useMemo(() => createAutocompleteSession(), [])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Suggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const online = navigator.onLine
  const canSearch = mapsConfigured() && online

  useEffect(() => {
    if (!canSearch || query.trim().length < 3) return setResults([])
    const id = setTimeout(() => {
      session.suggest(query).then(setResults, (e: Error) => setError(e.message))
    }, 250)
    return () => clearTimeout(id)
  }, [query, canSearch, session])

  const favoris = ROLE_ORDER.flatMap((r) => props.places.filter((p) => p.role === r))
  const recents = props.places
    .filter((p) => !p.role)
    .sort((a, b) => (b.last_used_at ?? '').localeCompare(a.last_used_at ?? ''))
    .slice(0, 8)

  async function pickSuggestion(s: Suggestion) {
    try {
      const r = await session.resolve(s.id)
      const existing = props.places.find((p) => p.google_place_id === r.google_place_id)
      if (existing) return props.onPick(existing)
      const place = newRow<Place>({ ...r, role: null, last_used_at: nowISO() })
      await saveRow(db, 'places', place)
      props.onPick(place)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const placeRow = (p: Place) => (
    <Row
      key={p.id}
      leading={<IconPin className="size-5 text-label2" />}
      label={p.role ? ROLE_LABEL[p.role] : p.label}
      detail={p.adresse}
      onClick={() => props.onPick(p)}
    />
  )

  return (
    <Sheet open={props.open} title={props.title} onCancel={props.onCancel}>
      <div className="mx-4 mb-6 flex h-9 items-center gap-2 rounded-[10px] bg-fill px-2.5 text-label2">
        <IconSearch className="size-4" />
        <input
          className="min-w-0 flex-1 bg-transparent text-label outline-none placeholder:text-label2"
          placeholder={canSearch ? 'Rechercher une adresse' : 'Recherche indisponible'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!canSearch}
          autoFocus={canSearch}
        />
      </div>
      {!online && <p className="mx-8 mb-6 text-[13px] text-label2">Hors ligne : seuls les favoris et les lieux récents sont disponibles.</p>}
      {online && !mapsConfigured() && <p className="mx-8 mb-6 text-[13px] text-label2">Clé Google Maps absente.</p>}
      {error && <p className="mx-8 mb-6 text-[13px] text-red">{error}</p>}
      {results.length > 0 ? (
        <Section header="Résultats">
          {results.map((s) => (
            <Row key={s.id} leading={<IconPin className="size-5 text-label2" />} label={s.principal} detail={s.secondaire} onClick={() => void pickSuggestion(s)} />
          ))}
        </Section>
      ) : (
        <>
          {favoris.length > 0 && <Section header="Favoris">{favoris.map(placeRow)}</Section>}
          {recents.length > 0 && <Section header="Récents">{recents.map(placeRow)}</Section>}
        </>
      )}
    </Sheet>
  )
}
```

- [ ] **Step 4 : `src/screens/VehicleSheet.tsx` (remplacement complet)**

```tsx
import { useState } from 'react'
import { dayBefore, overlaps, tripsToReassign } from '../app/vehicles'
import { db } from '../db/db'
import { newRow, saveRow, saveRows, softDelete } from '../db/repo'
import type { Energie, Vehicle } from '../domain/types'
import { todayISO } from '../lib/dates'
import { formatDateCourte } from '../lib/format'
import type { AppData } from '../hooks/useData'
import { TextRow } from '../ui/Field'
import { Row, Section } from '../ui/List'
import { Segmented } from '../ui/Segmented'
import { Sheet } from '../ui/Sheet'

export interface VehicleSheetProps {
  data: AppData
  vehicleId?: string
  onClose: () => void
}

export default function VehicleSheet({ data, vehicleId, onClose }: VehicleSheetProps) {
  const existing = data.vehicles.find((v) => v.id === vehicleId)
  const [nom, setNom] = useState(existing?.nom ?? '')
  const [immat, setImmat] = useState(existing?.immatriculation ?? '')
  const [cv, setCv] = useState(existing ? String(existing.cv) : '')
  const [energie, setEnergie] = useState<Energie>(existing?.energie ?? 'thermique')
  const [debut, setDebut] = useState(existing?.date_debut ?? todayISO())
  const [fin, setFin] = useState(existing?.date_fin ?? '')
  const [error, setError] = useState<string | null>(null)

  const cvNum = Number(cv)
  const others = data.vehicles.filter((v) => v.id !== vehicleId)
  // Nouveau véhicule : l'actuel (sans date de fin, plus ancien) est clôturé la veille automatiquement.
  const aCloturer = !existing ? others.find((v) => v.date_fin == null && v.date_debut < debut) : undefined
  const nbTrajets = existing ? data.trips.filter((t) => t.vehicle_id === existing.id).length : 0

  async function save() {
    if (!nom.trim() || !Number.isInteger(cvNum) || cvNum < 1 || cvNum > 50) return setError('Nom et puissance fiscale (1 à 50 CV) obligatoires.')
    if (fin && fin < debut) return setError('La date de fin précède la date de début.')
    const clotures = aCloturer ? [{ ...aCloturer, date_fin: dayBefore(debut) }] : []
    const period = { date_debut: debut, date_fin: fin || null }
    const autres = others.map((v) => clotures.find((c) => c.id === v.id) ?? v)
    const conflit = autres.find((v) => overlaps(v, period))
    if (conflit) return setError(`Chevauche la période de « ${conflit.nom} ».`)

    const fields = { nom: nom.trim(), immatriculation: immat.trim(), cv: cvNum, energie, ...period }
    const vehicle: Vehicle = existing ? { ...existing, ...fields } : newRow<Vehicle>(fields)
    if (clotures.length) await saveRows(db, 'vehicles', clotures)
    await saveRow(db, 'vehicles', vehicle)
    const vehicles = [...autres, vehicle]
    const reassign = tripsToReassign(data.trips, vehicles, data.places)
    if (reassign.length) await saveRows(db, 'trips', reassign)
    onClose()
  }

  async function remove() {
    if (!existing || nbTrajets > 0) return
    await softDelete(db, 'vehicles', existing.id)
    onClose()
  }

  return (
    <Sheet open title={existing ? 'Véhicule' : 'Nouveau véhicule'} onCancel={onClose} onConfirm={() => void save()} confirmLabel="Enregistrer">
      <Section footer={error && <span className="text-red">{error}</span>}>
        <TextRow label="Nom" value={nom} onChange={setNom} placeholder="Ex. Golf" />
        <TextRow label="Immatriculation" value={immat} onChange={setImmat} placeholder="AB-123-CD" />
        <TextRow label="Puissance (CV)" value={cv} onChange={setCv} inputMode="numeric" placeholder="5" />
        <div className="px-4 py-2">
          <Segmented value={energie} onChange={setEnergie} options={[{ value: 'thermique', label: 'Thermique / hybride' }, { value: 'electrique', label: 'Électrique' }]} />
        </div>
      </Section>
      <Section
        header="Période d’utilisation"
        footer={aCloturer ? `« ${aCloturer.nom} » sera clôturé le ${formatDateCourte(dayBefore(debut))}.` : 'Date de fin vide = véhicule actuel.'}
      >
        <TextRow label="Début" value={debut} onChange={setDebut} type="date" />
        <TextRow label="Fin" value={fin} onChange={setFin} type="date" />
      </Section>
      {existing && (
        <Section footer={nbTrajets > 0 ? `Utilisé par ${nbTrajets} trajet(s) : suppression impossible.` : undefined}>
          <Row label="Supprimer le véhicule" tone={nbTrajets > 0 ? 'default' : 'destructive'} onClick={nbTrajets > 0 ? undefined : () => void remove()} />
        </Section>
      )}
    </Sheet>
  )
}
```

- [ ] **Step 5 : `src/screens/BaremeSheet.tsx` (remplacement complet)**

```tsx
import { useState } from 'react'
import { db } from '../db/db'
import { saveRow, saveRows } from '../db/repo'
import { buildBaremeRows, DEFAULT_RATES } from '../domain/default-bareme'
import type { BaremeRate, BaremeYear } from '../domain/types'
import { decimalFr } from '../lib/format'
import { parseDecimal } from '../lib/parse'
import type { AppData } from '../hooks/useData'
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
  const built = buildBaremeRows(annee, prev?.majoration_electrique ?? 0.2, '', seeds.map(({ cv_min, cv_max, km_min, km_max, coef, constante }) => ({ cv_min, cv_max, km_min, km_max, coef, constante })))
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
              <input className="w-16 rounded-md bg-fill px-2 py-1 text-right tabular outline-none" inputMode="decimal" value={values[r.id].coef} onChange={(e) => set(r.id, 'coef', e.target.value)} aria-label={`Coefficient ${g.label} ${trancheLabel(r)}`} />
              {r.constante !== 0 || (r.km_min > 0 && r.km_max != null) ? (
                <>
                  <span className="text-label2">+</span>
                  <input className="w-16 rounded-md bg-fill px-2 py-1 text-right tabular outline-none" inputMode="decimal" value={values[r.id].constante} onChange={(e) => set(r.id, 'constante', e.target.value)} aria-label={`Constante ${g.label} ${trancheLabel(r)}`} />
                </>
              ) : null}
            </div>
          ))}
        </Section>
      ))}
    </Sheet>
  )
}
```

- [ ] **Step 6 : `src/screens/Settings.tsx` (remplacement complet)**

```tsx
import { useEffect, useState } from 'react'
import { supabase } from '../app/supabase'
import { syncEngine } from '../app/sync'
import { db } from '../db/db'
import { newRow, saveRow, saveRows } from '../db/repo'
import { selectRateSet } from '../domain/bareme'
import { fiscalSettings } from '../domain/rules'
import { ACTIVITES, ACTIVITE_LABEL, ROLE_LABEL, type Activite, type FiscalYear, type ModeFiscal, type Place, type PlaceRole } from '../domain/types'
import { todayISO, yearOf } from '../lib/dates'
import { formatDateCourte } from '../lib/format'
import type { AppData } from '../hooks/useData'
import { useSyncState } from '../hooks/useSyncState'
import { ActionSheet } from '../ui/ActionSheet'
import { Row, Section } from '../ui/List'
import { LargeTitle } from '../ui/NavBar'
import { Segmented } from '../ui/Segmented'
import { Toggle } from '../ui/Toggle'
import PlacePicker from './PlacePicker'

export interface SettingsProps {
  data: AppData
  onOpenVehicle: (id?: string) => void
  onOpenBareme: (annee: number) => void
}

const ROLES: PlaceRole[] = ['domicile', 'swing_house', 'lmnp']

export default function Settings({ data, onOpenVehicle, onOpenBareme }: SettingsProps) {
  const sync = useSyncState()
  const courante = yearOf(todayISO())
  const [annee, setAnnee] = useState(courante)
  const [pickRole, setPickRole] = useState<PlaceRole | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [logout, setLogout] = useState(false)

  useEffect(() => {
    void supabase?.auth.getSession().then(({ data: d }) => setEmail(d.session?.user.email ?? null))
  }, [])

  const verrouille = (a: Activite) => data.trips.some((t) => t.activite === a && t.statut === 'exporte' && yearOf(t.date) === annee)

  async function setFiscal(a: Activite, patch: Partial<Pick<FiscalYear, 'mode' | 'inclure_domicile_travail'>>) {
    const row = data.fiscalYears.find((f) => f.annee === annee && f.activite === a)
    const base = row ?? newRow<FiscalYear>({ annee, activite: a, ...fiscalSettings(annee, a, []) })
    await saveRow(db, 'fiscal_years', { ...base, ...patch })
  }

  async function assignRole(role: PlaceRole, place: Place) {
    const clear = data.places.filter((p) => p.role === role && p.id !== place.id).map((p) => ({ ...p, role: null }))
    await saveRows(db, 'places', [...clear, { ...place, role }])
    setPickRole(null)
  }

  const rateSet = selectRateSet(courante, data.baremeYears, data.rates)
  const annees = [...data.baremeYears].sort((a, b) => b.annee - a.annee)
  const prochaine = (annees[0]?.annee ?? courante - 1) + 1
  const etat =
    sync.status === 'syncing' ? 'Synchro…' : sync.status === 'offline' ? 'Hors ligne' : sync.status === 'error' ? 'Erreur' : sync.pending > 0 ? `${sync.pending} en attente` : 'À jour'

  return (
    <>
      <LargeTitle title="Réglages" />

      <Section header="Véhicules" footer="Chaque trajet garde le véhicule actif à sa date.">
        {data.vehicles
          .slice()
          .sort((a, b) => b.date_debut.localeCompare(a.date_debut))
          .map((v) => (
            <Row
              key={v.id}
              label={v.nom}
              detail={`${v.immatriculation || 'Sans immatriculation'} · ${v.cv} CV · ${v.energie === 'electrique' ? 'électrique' : 'thermique'}`}
              value={v.date_fin ? `${formatDateCourte(v.date_debut)} → ${formatDateCourte(v.date_fin)}` : `depuis ${formatDateCourte(v.date_debut)}`}
              onClick={() => onOpenVehicle(v.id)}
              chevron
            />
          ))}
        <Row label="Ajouter un véhicule" tone="accent" onClick={() => onOpenVehicle()} />
      </Section>

      <Section header="Lieux favoris">
        {ROLES.map((r) => {
          const p = data.places.find((x) => x.role === r)
          return <Row key={r} label={ROLE_LABEL[r]} detail={p ? p.adresse : 'À définir'} onClick={() => setPickRole(r)} chevron />
        })}
      </Section>

      <div className="mx-4 mb-2">
        <Segmented
          value={String(annee)}
          onChange={(v) => setAnnee(Number(v))}
          options={[courante - 1, courante, courante + 1].map((y) => ({ value: String(y), label: String(y) }))}
        />
      </div>
      <Section
        header={`Choix fiscal ${annee}`}
        footer="Le mode s’applique à tous les véhicules de l’année. Domicile–travail : exclu par défaut, à valider avec le comptable. Verrouillé dès le premier export de l’année."
      >
        {ACTIVITES.map((a) => {
          const s = fiscalSettings(annee, a, data.fiscalYears)
          const lock = verrouille(a)
          return (
            <div key={a} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between">
                <span>{ACTIVITE_LABEL[a]}</span>
                {lock && <span className="text-[13px] text-label2">Verrouillé</span>}
              </div>
              <div className={lock ? 'pointer-events-none opacity-40' : ''}>
                <Segmented<ModeFiscal>
                  value={s.mode}
                  onChange={(mode) => void setFiscal(a, { mode })}
                  options={[{ value: 'bareme', label: 'Barème km' }, { value: 'frais_reels', label: 'Frais réels' }]}
                />
              </div>
              {a === 'swing_house' && (
                <div className={`flex items-center justify-between ${lock ? 'pointer-events-none opacity-40' : ''}`}>
                  <span className="text-[15px]">Inclure domicile–travail</span>
                  <Toggle label="Inclure domicile–travail" checked={s.inclure_domicile_travail} onChange={(v) => void setFiscal(a, { inclure_domicile_travail: v })} />
                </div>
              )}
            </div>
          )
        })}
      </Section>

      <Section
        header="Barème kilométrique"
        footer={rateSet?.provisoire ? `Barème ${courante} absent : le barème ${rateSet.annee} est appliqué à titre provisoire.` : undefined}
      >
        {annees.map((y) => (
          <Row key={y.id} label={`Barème ${y.annee}`} detail={y.source || undefined} onClick={() => onOpenBareme(y.annee)} chevron />
        ))}
        <Row label={`Ajouter le barème ${prochaine}`} tone="accent" onClick={() => onOpenBareme(prochaine)} />
      </Section>

      <Section header="Synchronisation" footer={sync.message ?? (sync.lastSync ? `Dernière synchro : ${new Date(sync.lastSync).toLocaleString('fr-FR')}` : undefined)}>
        <Row label="État" value={etat} />
        <Row label="Synchroniser maintenant" tone="accent" onClick={() => void syncEngine?.syncNow()} />
      </Section>

      <Section header="Compte">
        <Row label={email ?? '—'} />
        <Row label="Se déconnecter" tone="destructive" onClick={() => setLogout(true)} />
      </Section>

      {pickRole && (
        <PlacePicker
          open
          title={ROLE_LABEL[pickRole]}
          places={data.places}
          onPick={(p) => void assignRole(pickRole, p)}
          onCancel={() => setPickRole(null)}
        />
      )}
      <ActionSheet
        open={logout}
        title="Se déconnecter ?"
        message={sync.pending > 0 ? `${sync.pending} modification(s) pas encore synchronisée(s) : elles restent sur ce téléphone.` : undefined}
        actions={[{ label: 'Se déconnecter', tone: 'destructive', onClick: () => void supabase?.auth.signOut().then(() => setLogout(false)) }]}
        onCancel={() => setLogout(false)}
      />
    </>
  )
}
```

- [ ] **Step 7 : Vérifier dans l'aperçu**

Run : `npm test && npx tsc -b` → PASS, aucune erreur.
Aperçu (`preview_start` `carnet`, preset `mobile`) : onglet Réglages →
1. « Ajouter un véhicule » : Golf, 5 CV, début 01/01/2020 → Enregistrer → la ligne apparaît « depuis 01/01/2020 ».
2. Lieux favoris → Domicile → rechercher « Servoz » → choisir → la ligne affiche l'adresse (vérifie Places API). Idem Swing House et Appartement LMNP (adresses données par Sam).
3. Choix fiscal : basculer « Frais réels » puis revenir « Barème km » ; interrupteur domicile–travail.
4. Barème 2026 → valeurs 0,636 / 0,357 + 1 395 / 0,427 pour 5 CV ; Annuler.
5. `read_console_messages` (onlyErrors) → aucune erreur. Capture d'écran de l'écran Réglages. Remettre preset `desktop`.

- [ ] **Step 8 : Commit**

```bash
git add -A
git commit -m "feat: écran Réglages (véhicules, choix fiscal, favoris, barème, synchro, compte)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 13 : Saisie d'un trajet (ajout, modification, étape suivante, réouverture)

**Files :**
- Create : `src/app/tripForm.ts`
- Modify (remplacement complet du provisoire) : `src/screens/TripSheet.tsx`
- Test : `src/app/tripForm.test.ts`

**Interfaces :**
- Consumes : `AppData` (Task 11) ; kit UI (Task 11) ; `PlacePicker` (Task 12) ; `ROLE_LABEL` (Task 2) ; règles (Task 3) ; `computeRouteKm`, `mapsConfigured` (Task 10) ; repo (Task 8) ; `supabase`, `syncEngine` (Task 11) ; `parseDecimal` (Task 11).
- Produces : `tripForm.ts` : `emptyTrip(data: AppData, today: string, prefill?: Partial<Trip>): Trip`, `recentMotifs(trips: Trip[], excludeId: string, limit?: number): string[]`, `finalizeTrip(f: Trip, data: AppData): Trip` (km total, véhicule, nature, statut recalculés), `nextStepPrefill(t: Trip): Partial<Trip>`

- [ ] **Step 1 : Tests (échec attendu)**

`src/app/tripForm.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import type { AppData } from '../hooks/useData'
import { makePlace, makeTrip, makeVehicle } from '../test/fixtures'
import { emptyTrip, finalizeTrip, nextStepPrefill, recentMotifs } from './tripForm'

const dom = makePlace({ id: 'p-dom', role: 'domicile', adresse: '74310 Servoz' })
const sh = makePlace({ id: 'p-sh', role: 'swing_house', adresse: 'Chamonix' })
const data = (o: Partial<AppData> = {}): AppData => ({
  trips: [], expenses: [], vehicles: [makeVehicle({ id: 'veh-A' })], fiscalYears: [], baremeYears: [], rates: [],
  places: [dom, sh], exports: [], ...o,
})

describe('tripForm', () => {
  it('nouveau trajet : date du jour, départ Domicile, dernière activité utilisée', () => {
    const d = data({ trips: [makeTrip({ activite: 'lmnp', created_at: '2026-09-14T08:00:00.000Z' })] })
    const t = emptyTrip(d, '2026-09-15')
    expect(t).toMatchObject({ date: '2026-09-15', activite: 'lmnp', depart_place_id: 'p-dom', depart_label: 'Domicile', depart_adresse: '74310 Servoz', statut: 'brouillon' })
  })
  it('le pré-remplissage « étape suivante » part de l’arrivée précédente', () => {
    const prev = makeTrip({ arrivee_place_id: 'p-sh', arrivee_label: 'Swing House', arrivee_adresse: 'Chamonix', date: '2026-09-15', activite: 'swing_house' })
    const t = emptyTrip(data(), '2026-09-16', nextStepPrefill(prev))
    expect(t).toMatchObject({ date: '2026-09-15', activite: 'swing_house', depart_place_id: 'p-sh', depart_label: 'Swing House', arrivee_place_id: null })
  })
  it('finalizeTrip : véhicule, km total, nature et statut', () => {
    const f = makeTrip({ depart_place_id: 'p-dom', arrivee_place_id: 'p-sh', km_route: 14.2, aller_retour: true, vehicle_id: null, nature: null, statut: 'brouillon' })
    const t = finalizeTrip(f, data())
    expect(t).toMatchObject({ vehicle_id: 'veh-A', km_total: 28.4, nature: null, statut: 'brouillon' })
    expect(finalizeTrip({ ...f, nature: 'domicile_travail' }, data()).statut).toBe('valide')
    expect(finalizeTrip({ ...f, arrivee_place_id: 'p-client' }, data()).nature).toBe('pro')
  })
  it('motifs récents distincts, du plus récent au plus ancien', () => {
    const trips = [
      makeTrip({ motif: 'Réunion comptable annuelle', created_at: '2026-09-01T00:00:00.000Z' }),
      makeTrip({ motif: 'Livraison matériel TrackMan', created_at: '2026-09-10T00:00:00.000Z' }),
      makeTrip({ motif: 'Réunion comptable annuelle', created_at: '2026-09-12T00:00:00.000Z' }),
    ]
    expect(recentMotifs(trips, 'x')).toEqual(['Réunion comptable annuelle', 'Livraison matériel TrackMan'])
  })
})
```

Run : `npx vitest run src/app/tripForm.test.ts` → FAIL (import introuvable).

- [ ] **Step 2 : `src/app/tripForm.ts`**

```ts
import { newRow } from '../db/repo'
import { computeStatut, isDomicileTravailCandidate, kmTotal, resolveVehicle, roleOf } from '../domain/rules'
import { ROLE_LABEL, type Trip } from '../domain/types'
import type { AppData } from '../hooks/useData'

export function emptyTrip(data: AppData, today: string, prefill: Partial<Trip> = {}): Trip {
  const dom = data.places.find((p) => p.role === 'domicile')
  const last = [...data.trips].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const trip = newRow<Trip>({
    date: today,
    activite: last?.activite ?? 'swing_house',
    motif: '',
    depart_place_id: dom?.id ?? null,
    depart_label: dom ? ROLE_LABEL.domicile : '',
    depart_adresse: dom?.adresse ?? '',
    arrivee_place_id: null,
    arrivee_label: '',
    arrivee_adresse: '',
    km_route: null,
    km_saisi: null,
    justif_km: null,
    aller_retour: false,
    km_total: null,
    vehicle_id: null,
    nature: null,
    statut: 'brouillon',
    brouillon_force: false,
    doublon_confirme: false,
    montant_bareme: 0,
    export_id: null,
  })
  return { ...trip, ...prefill }
}

export function nextStepPrefill(t: Trip): Partial<Trip> {
  return {
    date: t.date,
    activite: t.activite,
    depart_place_id: t.arrivee_place_id,
    depart_label: t.arrivee_label,
    depart_adresse: t.arrivee_adresse,
  }
}

export function recentMotifs(trips: Trip[], excludeId: string, limit = 6): string[] {
  const sorted = trips.filter((t) => t.id !== excludeId && t.motif.trim()).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return [...new Set(sorted.map((t) => t.motif.trim()))].slice(0, limit)
}

// Champs dérivés recalculés à l'enregistrement.
export function finalizeTrip(f: Trip, data: AppData): Trip {
  const candidat = isDomicileTravailCandidate(f.activite, roleOf(f.depart_place_id, data.places), roleOf(f.arrivee_place_id, data.places))
  const next: Trip = {
    ...f,
    motif: f.motif.trim(),
    justif_km: f.km_saisi == null ? null : f.justif_km?.trim() || null,
    km_total: kmTotal(f.km_route, f.km_saisi, f.aller_retour),
    vehicle_id: resolveVehicle(f.date, data.vehicles)?.id ?? null,
    nature: candidat ? f.nature : 'pro',
  }
  return { ...next, statut: computeStatut(next, { vehicles: data.vehicles, places: data.places }) }
}
```

Run : `npx vitest run src/app/tripForm.test.ts` → PASS.

- [ ] **Step 3 : `src/screens/TripSheet.tsx` (remplacement complet)**

```tsx
import { useEffect, useState } from 'react'
import { supabase } from '../app/supabase'
import { syncEngine } from '../app/sync'
import { emptyTrip, finalizeTrip, nextStepPrefill, recentMotifs } from '../app/tripForm'
import { db } from '../db/db'
import { newRow, saveRow, saveRows, softDelete } from '../db/repo'
import type { TripCalc } from '../domain/chain'
import { findDuplicate, isDomicileTravailCandidate, missingReasons, resolveVehicle, roleOf, validateMotif } from '../domain/rules'
import { ACTIVITE_LABEL, EXPENSE_LABEL, ROLE_LABEL, type Activite, type ExpenseType, type Nature, type Place, type Trip, type TripExpense } from '../domain/types'
import { computeRouteKm, mapsConfigured } from '../geo/maps'
import type { AppData } from '../hooks/useData'
import { nowISO, todayISO } from '../lib/dates'
import { decimalFr, formatKm } from '../lib/format'
import { parseDecimal } from '../lib/parse'
import { ActionSheet } from '../ui/ActionSheet'
import { PrimaryButton } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { TextAreaRow, TextRow } from '../ui/Field'
import { Row, Section } from '../ui/List'
import { Segmented } from '../ui/Segmented'
import { Sheet } from '../ui/Sheet'
import { Toggle } from '../ui/Toggle'
import PlacePicker from './PlacePicker'

export interface TripSheetProps {
  data: AppData
  calc: Map<string, TripCalc>
  tripId?: string
  prefill?: Partial<Trip>
  onClose: () => void
  onNext: (prefill: Partial<Trip>) => void
}

type KmState = 'idle' | 'calcul' | 'attente' | 'erreur'

export default function TripSheet({ data, tripId, prefill, onClose, onNext }: TripSheetProps) {
  const existing = tripId ? data.trips.find((t) => t.id === tripId) : undefined
  const locked = existing?.statut === 'exporte'
  const [f, setF] = useState<Trip>(() => existing ?? emptyTrip(data, todayISO(), prefill))
  const [expenses, setExpenses] = useState<TripExpense[]>(() => data.expenses.filter((e) => e.trip_id === f.id))
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(expenses.map((e) => [e.id, decimalFr(e.montant, 2)])),
  )
  const [removed, setRemoved] = useState<string[]>([])
  const [picker, setPicker] = useState<'depart' | 'arrivee' | null>(null)
  const [kmState, setKmState] = useState<KmState>('idle')
  const [retry, setRetry] = useState(0)
  const [kmSaisi, setKmSaisi] = useState(f.km_saisi != null ? decimalFr(f.km_saisi, 1) : '')
  const [corriger, setCorriger] = useState(f.km_saisi != null)
  const [motifTouche, setMotifTouche] = useState(false)
  const [askDoublon, setAskDoublon] = useState<{ force: boolean } | null>(null)
  const [askDelete, setAskDelete] = useState(false)
  const [askReopen, setAskReopen] = useState(false)
  const [reopenMotif, setReopenMotif] = useState('')
  const [saved, setSaved] = useState<Trip | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<Trip>) => setF((x) => ({ ...x, ...patch }))
  const placeById = (id: string | null) => data.places.find((p) => p.id === id)

  // Distance automatique dès que départ et arrivée sont connus.
  useEffect(() => {
    if (locked || f.km_route != null) return
    const a = placeById(f.depart_place_id)
    const b = placeById(f.arrivee_place_id)
    if (!a || !b) return
    if (!navigator.onLine || !mapsConfigured() || a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
      setKmState('attente')
      return
    }
    let cancelled = false
    setKmState('calcul')
    computeRouteKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }).then(
      (km) => {
        if (cancelled) return
        set({ km_route: km })
        setKmState('idle')
      },
      () => !cancelled && setKmState('erreur'),
    )
    return () => {
      cancelled = true
    }
  }, [f.depart_place_id, f.arrivee_place_id, f.km_route, retry, locked])

  function pickPlace(p: Place, cote: 'depart' | 'arrivee') {
    const label = p.role ? ROLE_LABEL[p.role] : p.label
    if (cote === 'depart') set({ depart_place_id: p.id, depart_label: label, depart_adresse: p.adresse, km_route: null })
    else set({ arrivee_place_id: p.id, arrivee_label: label, arrivee_adresse: p.adresse, km_route: null })
    setPicker(null)
  }

  const draft = finalizeTrip({ ...f, km_saisi: corriger ? parseDecimal(kmSaisi) : null }, data)
  const reasons = missingReasons(draft, { vehicles: data.vehicles, places: data.places })
  const candidat = isDomicileTravailCandidate(f.activite, roleOf(f.depart_place_id, data.places), roleOf(f.arrivee_place_id, data.places))
  const vehicle = resolveVehicle(f.date, data.vehicles)
  const motifError = motifTouche ? validateMotif(f.motif) : null
  const suggestions = recentMotifs(data.trips, f.id).filter((m) => m !== f.motif)
  const quickPlaces = [
    ...data.places.filter((p) => p.role),
    ...data.places.filter((p) => !p.role).sort((a, b) => (b.last_used_at ?? '').localeCompare(a.last_used_at ?? '')).slice(0, 4),
  ].filter((p) => p.id !== f.depart_place_id)

  async function save(force: boolean, doublonOk = false) {
    setError(null)
    if (!doublonOk && !f.doublon_confirme && findDuplicate(draft, data.trips)) {
      setAskDoublon({ force })
      return
    }
    const trip = finalizeTrip({ ...draft, brouillon_force: force, doublon_confirme: f.doublon_confirme || doublonOk }, data)
    await saveRow(db, 'trips', trip)
    const valid = expenses.flatMap((e) => {
      const montant = parseDecimal(amounts[e.id] ?? '')
      return montant != null && montant > 0 ? [{ ...e, trip_id: trip.id, montant }] : []
    })
    if (valid.length) await saveRows(db, 'trip_expenses', valid)
    for (const id of removed) await softDelete(db, 'trip_expenses', id)
    const used = data.places.filter((p) => p.id === trip.depart_place_id || p.id === trip.arrivee_place_id)
    if (used.length) await saveRows(db, 'places', used.map((p) => ({ ...p, last_used_at: nowISO() })))
    if (existing) onClose()
    else setSaved(trip)
  }

  async function remove() {
    if (!existing) return
    for (const e of expenses) await softDelete(db, 'trip_expenses', e.id)
    await softDelete(db, 'trips', existing.id)
    onClose()
  }

  async function reopen() {
    if (!supabase || !existing) return
    const { error: err } = await supabase.rpc('reopen_trip', { p_trip_id: existing.id, p_motif: reopenMotif })
    if (err) {
      setError(navigator.onLine ? err.message : 'Réouverture impossible hors ligne.')
      setAskReopen(false)
      return
    }
    await syncEngine?.syncNow()
    onClose()
  }

  function addExpense(type: ExpenseType) {
    const e = newRow<TripExpense>({ trip_id: f.id, type, montant: 0, note: '' })
    setExpenses((xs) => [...xs, e])
    setAmounts((a) => ({ ...a, [e.id]: '' }))
  }

  if (saved) {
    const r = missingReasons(saved, { vehicles: data.vehicles, places: data.places })
    return (
      <Sheet open title="Trajet enregistré" onCancel={onClose}>
        <Section footer={saved.statut === 'brouillon' ? `Brouillon : ${r.join(' · ') || 'à finir plus tard'}.` : 'Trajet validé.'}>
          <Row label={saved.motif || 'Sans motif'} detail={`${saved.depart_label} → ${saved.arrivee_label}`} value={formatKm(saved.km_total)} />
        </Section>
        <div className="space-y-3 px-4">
          <PrimaryButton onClick={() => onNext(nextStepPrefill(saved))}>Étape suivante</PrimaryButton>
          <PrimaryButton tone="plain" onClick={onClose}>Terminé</PrimaryButton>
        </div>
      </Sheet>
    )
  }

  const kmValue =
    kmState === 'calcul' ? 'Calcul…'
    : kmState === 'attente' && draft.km_total == null ? 'Au retour du réseau'
    : kmState === 'erreur' && draft.km_total == null ? 'Échec du calcul'
    : formatKm(draft.km_total)

  return (
    <Sheet
      open
      title={locked ? 'Trajet exporté' : existing ? 'Modifier le trajet' : 'Nouveau trajet'}
      onCancel={onClose}
      onConfirm={locked ? undefined : () => void save(false)}
      confirmLabel={existing ? 'Enregistrer' : 'Ajouter'}
    >
      <fieldset disabled={locked} className="contents">
        <div className="mx-4 mb-6">
          <Segmented<Activite>
            value={f.activite}
            onChange={(activite) => set({ activite })}
            options={[{ value: 'swing_house', label: ACTIVITE_LABEL.swing_house }, { value: 'lmnp', label: ACTIVITE_LABEL.lmnp }]}
          />
        </div>

        <Section>
          <TextRow label="Date" value={f.date} onChange={(date) => set({ date })} type="date" />
          <Row label="Départ" value={f.depart_label || 'Choisir'} detail={f.depart_adresse || undefined} onClick={locked ? undefined : () => setPicker('depart')} chevron={!locked} />
          <Row label="Arrivée" value={f.arrivee_label || 'Choisir'} detail={f.arrivee_adresse || undefined} onClick={locked ? undefined : () => setPicker('arrivee')} chevron={!locked} />
        </Section>
        {!locked && !f.arrivee_place_id && quickPlaces.length > 0 && (
          <div className="-mt-5 mb-6 flex gap-2 overflow-x-auto px-4 pb-1">
            {quickPlaces.map((p) => (
              <Chip key={p.id} label={p.role ? ROLE_LABEL[p.role] : p.label} onClick={() => pickPlace(p, 'arrivee')} />
            ))}
          </div>
        )}

        {candidat && (
          <Section
            header="Nature du trajet"
            footer={f.nature === 'domicile_travail' ? 'Enregistré mais exclu de la note Swing House (réglage annuel).' : 'Domicile ↔ Swing House : trajet habituel ou vrai déplacement pro ?'}
          >
            <div className="px-4 py-2">
              <Segmented<Nature>
                value={f.nature}
                onChange={(nature) => set({ nature })}
                options={[{ value: 'domicile_travail', label: 'Domicile–travail' }, { value: 'pro', label: 'Déplacement pro' }]}
              />
            </div>
          </Section>
        )}

        <Section footer={corriger ? 'Le détour doit correspondre à un trajet réellement effectué.' : undefined}>
          <Row label="Distance" value={kmValue} detail={f.km_route != null ? `Itinéraire Google : ${formatKm(f.km_route)} aller` : undefined} />
          {kmState === 'erreur' && <Row label="Recalculer la distance" tone="accent" onClick={() => setRetry((n) => n + 1)} />}
          <Row label="Aller-retour" accessory={<Toggle label="Aller-retour" checked={f.aller_retour} onChange={(aller_retour) => set({ aller_retour })} />} />
          <Row label="Corriger les km" accessory={<Toggle label="Corriger les km" checked={corriger} onChange={setCorriger} />} />
          {corriger && <TextRow label="Km aller réels" value={kmSaisi} onChange={setKmSaisi} inputMode="decimal" placeholder="0,0" />}
          {corriger && <TextAreaRow value={f.justif_km ?? ''} onChange={(justif_km) => set({ justif_km })} placeholder="Justification (ex. détour dépose matériel chez…)" />}
        </Section>

        <Section header="Motif" footer={motifError && <span className="text-red">{motifError}</span>}>
          <TextAreaRow value={f.motif} onChange={(motif) => { set({ motif }); setMotifTouche(true) }} placeholder="Qui, quoi, où (ex. Rendez-vous fournisseur TrackMan à Annecy)" />
        </Section>
        {!locked && suggestions.length > 0 && (
          <div className="-mt-5 mb-6 flex gap-2 overflow-x-auto px-4 pb-1">
            {suggestions.map((m) => (
              <Chip key={m} label={m} onClick={() => { set({ motif: m }); setMotifTouche(true) }} />
            ))}
          </div>
        )}

        <Section header="Véhicule">
          <Row label={vehicle ? vehicle.nom : 'Aucun véhicule à cette date'} value={vehicle ? `${vehicle.cv} CV` : undefined} tone={vehicle ? 'default' : 'destructive'} />
        </Section>

        <Section header="Frais annexes" footer="Péages et parkings s’ajoutent au barème. Garder le justificatif.">
          {expenses.map((e) => (
            <div key={e.id} className="space-y-1 px-4 py-2">
              <div className="flex items-center gap-3">
                <span className="flex-1">{EXPENSE_LABEL[e.type]}</span>
                <input
                  className="w-24 rounded-md bg-fill px-2 py-1 text-right tabular outline-none"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amounts[e.id] ?? ''}
                  onChange={(ev) => setAmounts((a) => ({ ...a, [e.id]: ev.target.value }))}
                  aria-label={`Montant ${EXPENSE_LABEL[e.type]}`}
                />
                <span className="text-label2">€</span>
                {!locked && (
                  <button type="button" className="text-[15px] text-red" onClick={() => { setExpenses((xs) => xs.filter((x) => x.id !== e.id)); if (data.expenses.some((x) => x.id === e.id)) setRemoved((r) => [...r, e.id]) }}>
                    Retirer
                  </button>
                )}
              </div>
              <input
                className="w-full bg-transparent text-[15px] outline-none placeholder:text-label3"
                placeholder="Note (ex. A40 sortie Sallanches)"
                value={e.note}
                onChange={(ev) => setExpenses((xs) => xs.map((x) => (x.id === e.id ? { ...x, note: ev.target.value } : x)))}
              />
            </div>
          ))}
          {!locked && (
            <div className="flex gap-2 px-4 py-2">
              {(['peage', 'parking', 'autre'] as ExpenseType[]).map((t) => (
                <Chip key={t} label={`+ ${EXPENSE_LABEL[t]}`} onClick={() => addExpense(t)} />
              ))}
            </div>
          )}
        </Section>
      </fieldset>

      {!locked && reasons.length > 0 && <p className="mx-8 -mt-4 mb-6 text-[13px] text-orange">À compléter : {reasons.join(' · ')}</p>}
      {error && <p className="mx-8 mb-6 text-[13px] text-red">{error}</p>}

      {!locked && (
        <div className="mb-8 px-4">
          <PrimaryButton tone="plain" onClick={() => void save(true)}>Finir plus tard</PrimaryButton>
        </div>
      )}
      {existing && !locked && (
        <Section>
          <Row label="Supprimer le trajet" tone="destructive" onClick={() => setAskDelete(true)} />
        </Section>
      )}
      {locked && (
        <Section footer="Trajet verrouillé depuis son export. La réouverture est tracée et l’export concerné passera « à rectifier ».">
          <Row label="Rouvrir le trajet…" tone="destructive" onClick={() => setAskReopen(true)} />
        </Section>
      )}

      {picker && <PlacePicker open title={picker === 'depart' ? 'Départ' : 'Arrivée'} places={data.places} onPick={(p) => pickPlace(p, picker)} onCancel={() => setPicker(null)} />}
      <ActionSheet
        open={askDoublon != null}
        title="Trajet identique déjà saisi"
        message="Même date, même départ, même arrivée. C’est bien un deuxième trajet ?"
        actions={[{ label: 'Oui, c’est un autre trajet', bold: true, onClick: () => { const force = askDoublon?.force ?? false; setAskDoublon(null); void save(force, true) } }]}
        onCancel={() => setAskDoublon(null)}
      />
      <ActionSheet
        open={askDelete}
        title="Supprimer ce trajet ?"
        actions={[{ label: 'Supprimer', tone: 'destructive', onClick: () => void remove() }]}
        onCancel={() => setAskDelete(false)}
      />
      <ActionSheet
        open={askReopen}
        title="Rouvrir le trajet"
        message="Motif obligatoire, conservé dans le journal."
        actions={[{ label: 'Rouvrir', tone: 'destructive', onClick: () => void (reopenMotif.trim().length >= 5 ? reopen() : setError('Motif de réouverture : 5 caractères minimum.')) }]}
        onCancel={() => setAskReopen(false)}
      >
        <input
          className="mt-2 w-full rounded-md bg-fill px-3 py-2 text-[15px] outline-none"
          placeholder="Ex. erreur de date"
          value={reopenMotif}
          onChange={(e) => setReopenMotif(e.target.value)}
        />
      </ActionSheet>
    </Sheet>
  )
}
```

- [ ] **Step 4 : Vérifier dans l'aperçu (parcours < 20 s)**

Run : `npm test && npx tsc -b` → PASS.
Aperçu mobile, onglet Trajets → « + » :
1. Activité Swing House pré-sélectionnée, départ « Domicile », date du jour.
2. Chip « Swing House » en arrivée → question « Nature du trajet » apparaît ; choisir « Déplacement pro » ; distance calculée automatiquement (≈ km Servoz → Chamonix, vérifie Routes API).
3. Motif « Livraison matériel TrackMan » → Ajouter → écran « Trajet enregistré » → « Étape suivante » : départ = Swing House.
4. Arrivée = Appartement LMNP, activité LMNP, motif « Remise des clés locataires Nid de l’Aiguille » → Ajouter → Terminé.
5. Refaire exactement le trajet 1 → l'alerte « Trajet identique déjà saisi » s'affiche.
6. Motif « rdv » → message « Motif trop court » ; « Finir plus tard » → trajet en Brouillon sur l'accueil.
7. Hors ligne simulé (`javascript_tool` : impossible de couper le réseau de l'aperçu → vérifier le chemin via le test unitaire `pending.test.ts` ; sur iPhone en mode Avion en Task 16).
8. `read_console_messages` (onlyErrors) → aucune erreur. Captures d'écran des étapes 2 et 3.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "feat: saisie d'un trajet (favoris, km auto, domicile–travail, doublon, frais, étape suivante, réouverture)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 14 : Accueil (trajets du mois, km, sans aucun montant)

**Files :**
- Create : `src/app/home.ts`
- Modify (remplacement complet du provisoire) : `src/screens/Home.tsx`
- Test : `src/app/home.test.ts`

**Interfaces :**
- Consumes : `AppData` (Task 11) ; kit UI (Task 11) ; `ACTIVITES`, `ACTIVITE_LABEL` (Task 2) ; dates/format (Task 1).
- Produces : `home.ts` : `interface HomeSummary { mois: string; parActivite: Record<Activite, { nb: number; km: number }>; brouillons: number; jours: [string, Trip[]][]; nonExportes: Activite[]; aConfigurer: boolean }`, `homeSummary(data: AppData, today: string): HomeSummary`

- [ ] **Step 1 : Test (échec attendu)**

`src/app/home.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import type { AppData } from '../hooks/useData'
import { makePlace, makeTrip, makeVehicle } from '../test/fixtures'
import { homeSummary } from './home'

const base = (trips: AppData['trips'], extra: Partial<AppData> = {}): AppData => ({
  trips, expenses: [], vehicles: [makeVehicle()], fiscalYears: [], baremeYears: [], rates: [],
  places: [makePlace({ role: 'domicile' })], exports: [], ...extra,
})

describe('homeSummary', () => {
  it('km et nombre de trajets du mois par activité, jours du plus récent au plus ancien', () => {
    const s = homeSummary(
      base([
        makeTrip({ date: '2026-09-02', km_total: 20 }),
        makeTrip({ date: '2026-09-10', km_total: 12.5, activite: 'lmnp' }),
        makeTrip({ date: '2026-09-10', km_total: 30 }),
        makeTrip({ date: '2026-08-30', km_total: 99 }),
      ]),
      '2026-09-15',
    )
    expect(s.parActivite).toEqual({ swing_house: { nb: 2, km: 50 }, lmnp: { nb: 1, km: 12.5 } })
    expect(s.jours.map(([d]) => d)).toEqual(['2026-09-10', '2026-09-02'])
  })
  it('signale le mois précédent non exporté, les brouillons et la configuration manquante', () => {
    const s = homeSummary(
      base([makeTrip({ date: '2026-08-30' }), makeTrip({ date: '2026-09-01', statut: 'brouillon' })], { vehicles: [] }),
      '2026-09-15',
    )
    expect(s.nonExportes).toEqual(['swing_house'])
    expect(s.brouillons).toBe(1)
    expect(s.aConfigurer).toBe(true)
  })
})
```

Run : `npx vitest run src/app/home.test.ts` → FAIL (import introuvable).

- [ ] **Step 2 : `src/app/home.ts`**

```ts
import { ACTIVITES, type Activite, type Trip } from '../domain/types'
import type { AppData } from '../hooks/useData'
import { lastDayOfMonth, monthOf, prevMonth } from '../lib/dates'
import { round1 } from '../lib/format'

export interface HomeSummary {
  mois: string
  parActivite: Record<Activite, { nb: number; km: number }>
  brouillons: number
  jours: [string, Trip[]][]
  nonExportes: Activite[]
  aConfigurer: boolean
}

// Données de l'accueil : volontairement sans aucun montant en euros.
export function homeSummary(data: AppData, today: string): HomeSummary {
  const mois = monthOf(today)
  const duMois = data.trips
    .filter((t) => monthOf(t.date) === mois)
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
  const parActivite = Object.fromEntries(
    ACTIVITES.map((a) => {
      const list = duMois.filter((t) => t.activite === a)
      return [a, { nb: list.length, km: round1(list.reduce((s, t) => s + (t.km_total ?? 0), 0)) }]
    }),
  ) as HomeSummary['parActivite']
  const jours = new Map<string, Trip[]>()
  for (const t of duMois) jours.set(t.date, [...(jours.get(t.date) ?? []), t])
  const finPrecedent = lastDayOfMonth(prevMonth(mois))
  return {
    mois,
    parActivite,
    brouillons: data.trips.filter((t) => t.statut === 'brouillon').length,
    jours: [...jours.entries()],
    nonExportes: ACTIVITES.filter((a) => data.trips.some((t) => t.activite === a && t.statut !== 'exporte' && t.date <= finPrecedent)),
    aConfigurer: data.vehicles.length === 0 || !data.places.some((p) => p.role === 'domicile'),
  }
}
```

Run : `npx vitest run src/app/home.test.ts` → PASS.

- [ ] **Step 3 : `src/screens/Home.tsx` (remplacement complet)**

```tsx
import { homeSummary } from '../app/home'
import { ACTIVITES, ACTIVITE_LABEL, type Trip } from '../domain/types'
import type { AppData } from '../hooks/useData'
import { prevMonth, todayISO } from '../lib/dates'
import { formatJour, formatKm, formatMoisLong } from '../lib/format'
import { ActivityDot } from '../ui/ActivityDot'
import { Banner } from '../ui/Banner'
import { IconLock, IconPlus } from '../ui/icons'
import { Row, Section } from '../ui/List'
import { LargeTitle, NavButton } from '../ui/NavBar'
import { SyncBadge } from '../ui/SyncBadge'
import type { Tab } from '../ui/TabBar'

export interface HomeProps {
  data: AppData
  onOpenTrip: (id?: string) => void
  onGoto: (t: Tab) => void
}

function statusValue(t: Trip) {
  if (t.statut === 'brouillon') return <span className="text-orange">Brouillon</span>
  if (t.statut === 'exporte')
    return (
      <span className="inline-flex items-center gap-1">
        {formatKm(t.km_total)}
        <IconLock className="size-3.5" />
      </span>
    )
  return formatKm(t.km_total)
}

export default function Home({ data, onOpenTrip, onGoto }: HomeProps) {
  const s = homeSummary(data, todayISO())
  return (
    <>
      <LargeTitle
        title="Trajets"
        subtitle={formatMoisLong(s.mois)}
        right={
          <>
            <SyncBadge />
            <NavButton onClick={() => onOpenTrip()} label="Nouveau trajet">
              <IconPlus />
            </NavButton>
          </>
        }
      />
      {s.aConfigurer && <Banner onClick={() => onGoto('settings')}>Renseigner le véhicule et le domicile</Banner>}
      {s.nonExportes.length > 0 && (
        <Banner onClick={() => onGoto('recap')}>
          {formatMoisLong(prevMonth(s.mois))} pas encore exporté : {s.nonExportes.map((a) => ACTIVITE_LABEL[a]).join(', ')}
        </Banner>
      )}
      <Section footer={s.brouillons > 0 ? `${s.brouillons} brouillon(s) à compléter.` : undefined}>
        {ACTIVITES.map((a) => (
          <Row
            key={a}
            leading={<ActivityDot activite={a} />}
            label={ACTIVITE_LABEL[a]}
            detail={`${s.parActivite[a].nb} trajet(s)`}
            value={formatKm(s.parActivite[a].km)}
          />
        ))}
      </Section>
      {s.jours.map(([date, trips]) => (
        <Section key={date} header={formatJour(date)}>
          {trips.map((t) => (
            <Row
              key={t.id}
              leading={<ActivityDot activite={t.activite} />}
              label={t.motif || 'Sans motif'}
              detail={`${t.depart_label} → ${t.arrivee_label}${t.aller_retour ? ' · aller-retour' : ''}`}
              value={statusValue(t)}
              onClick={() => onOpenTrip(t.id)}
              chevron
            />
          ))}
        </Section>
      ))}
      {s.jours.length === 0 && <p className="px-8 pt-6 text-center text-[15px] text-label2">Aucun trajet ce mois-ci. Touche + pour en ajouter un.</p>}
    </>
  )
}
```

- [ ] **Step 4 : Vérifier**

Run : `npm test && npx tsc -b` → PASS.
Aperçu mobile : onglet Trajets → bandeau « Renseigner… » si la config manque, sinon deux lignes Swing House / LMNP avec km ; `get_page_text` ne contient **aucun « € »**. Capture d'écran.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "feat: accueil (trajets et km du mois, bandeaux, aucun montant)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 15 : Récap mensuel et export (verrouillage, partage, historique, rectificatif)

**Files :**
- Create : `src/app/exportFlow.ts`
- Modify (remplacement complet du provisoire) : `src/screens/Recap.tsx`
- Test : `src/app/exportFlow.test.ts`

**Interfaces :**
- Consumes : `tripsForExport`, `draftsForExport`, `exportBlockReason`, `nextVersion`, `tripsOfExport` (Task 5) ; `buildExportData`, `rpcTripsPayload`, `ExportData` (Task 5) ; `makeExportFiles`, `shareOrDownload` (Task 6) ; `AppData` (Task 11) ; `supabase`, `syncEngine` (Task 11) ; kit UI (Task 11).
- Produces : `exportFlow.ts` : `interface PreparedExport { data: ExportData; payload: { id: string; montant_bareme: number }[] }`, `interface ExportPreview { prepared: PreparedExport | null; blocked: string | null; drafts: Trip[] }`, `prepareExport(app: AppData, calc: Map<string, TripCalc>, activite: Activite, mois: string, genereLe: string): ExportPreview`, `runExport(client: SupabaseClient, p: PreparedExport): Promise<{ id: string; version: number }>`, `rebuildExport(app: AppData, calc: Map<string, TripCalc>, rec: ExportRecord): ExportData`, `defaultRecapMonth(app: AppData, today: string): string`

- [ ] **Step 1 : Tests (échec attendu)**

`src/app/exportFlow.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { computeAll } from '../domain/chain'
import type { AppData } from '../hooks/useData'
import { defaultBareme, makeExport, makeTrip, makeVehicle } from '../test/fixtures'
import { defaultRecapMonth, prepareExport, rebuildExport } from './exportFlow'

const { year, rates } = defaultBareme()
const app = (o: Partial<AppData> = {}): AppData => ({
  trips: [], expenses: [], vehicles: [makeVehicle({ id: 'veh-A' })], fiscalYears: [], baremeYears: [year], rates,
  places: [], exports: [], ...o,
})

describe('prepareExport', () => {
  it('prépare la version 1 avec les montants à figer', () => {
    const t = makeTrip({ date: '2026-09-10', km_total: 100 })
    const a = app({ trips: [t, makeTrip({ date: '2026-09-11', statut: 'brouillon' })] })
    const p = prepareExport(a, computeAll(a), 'swing_house', '2026-09', '2026-10-01T08:00:00.000Z')
    expect(p.blocked).toBeNull()
    expect(p.drafts).toHaveLength(1)
    expect(p.prepared?.data.version).toBe(1)
    expect(p.prepared?.payload).toEqual([{ id: t.id, montant_bareme: 63.6 }])
  })
  it('bloque un mois déjà émis ; rien à exporter → message', () => {
    const a = app({ exports: [makeExport({ statut: 'emis' })] })
    expect(prepareExport(a, computeAll(a), 'swing_house', '2026-09', 'x').blocked).toMatch(/Déjà exporté/)
    const vide = app()
    expect(prepareExport(vide, computeAll(vide), 'lmnp', '2026-09', 'x')).toMatchObject({ prepared: null, blocked: 'Aucun trajet validé à exporter.' })
  })
})

describe('rebuildExport', () => {
  it('reconstruit un export émis à partir des trajets figés', () => {
    const e = makeExport({ id: 'e1', version: 1, created_at: '2026-10-01T08:00:00.000Z' })
    const t = makeTrip({ date: '2026-09-10', km_total: 100, statut: 'exporte', export_id: 'e1', montant_bareme: 63.6 })
    const a = app({ trips: [t], exports: [e] })
    const d = rebuildExport(a, computeAll(a), e)
    expect(d.version).toBe(1)
    expect(d.totaux.total).toBe(63.6)
    expect(d.genere_le).toBe('2026-10-01T08:00:00.000Z')
  })
})

describe('defaultRecapMonth', () => {
  it('mois précédent s’il reste des trajets non exportés, sinon mois courant', () => {
    expect(defaultRecapMonth(app({ trips: [makeTrip({ date: '2026-08-20' })] }), '2026-09-15')).toBe('2026-08')
    expect(defaultRecapMonth(app(), '2026-09-15')).toBe('2026-09')
  })
})
```

Run : `npx vitest run src/app/exportFlow.test.ts` → FAIL (import introuvable).

- [ ] **Step 2 : `src/app/exportFlow.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TripCalc } from '../domain/chain'
import type { Activite, ExportRecord, Trip } from '../domain/types'
import { buildExportData, rpcTripsPayload, type ExportData } from '../export/build'
import { draftsForExport, exportBlockReason, nextVersion, tripsForExport, tripsOfExport } from '../export/select'
import type { AppData } from '../hooks/useData'
import { lastDayOfMonth, monthOf, prevMonth } from '../lib/dates'

export interface PreparedExport {
  data: ExportData
  payload: { id: string; montant_bareme: number }[]
}

export interface ExportPreview {
  prepared: PreparedExport | null
  blocked: string | null
  drafts: Trip[]
}

export function prepareExport(app: AppData, calc: Map<string, TripCalc>, activite: Activite, mois: string, genereLe: string): ExportPreview {
  const drafts = draftsForExport(app.trips, activite, mois)
  const blocked = exportBlockReason(app.exports, activite, mois)
  if (blocked) return { prepared: null, blocked, drafts }
  const selection = tripsForExport(app.trips, app.exports, activite, mois)
  if (selection.length === 0) return { prepared: null, blocked: 'Aucun trajet validé à exporter.', drafts }
  const data = buildExportData({
    activite, mois, version: nextVersion(app.exports, activite, mois), selection, data: app, calc, genere_le: genereLe,
  })
  return { prepared: { data, payload: rpcTripsPayload(data) }, blocked: null, drafts }
}

// Verrouillage côté serveur (transactionnel) : nécessite le réseau.
export async function runExport(client: SupabaseClient, p: PreparedExport): Promise<{ id: string; version: number }> {
  const { data, error } = await client.rpc('export_month', {
    p_activite: p.data.activite,
    p_mois: p.data.mois,
    p_version: p.data.version,
    p_trips: p.payload,
    p_totaux: p.data.totaux,
    p_bareme_annee: p.data.bareme_annee,
    p_bareme_provisoire: p.data.bareme_provisoire,
  })
  if (error) throw new Error(error.message)
  const rec = data as { id: string; version: number }
  return { id: rec.id, version: rec.version }
}

// Re-partage d'un export émis : mêmes trajets figés, même version, même date.
export function rebuildExport(app: AppData, calc: Map<string, TripCalc>, rec: ExportRecord): ExportData {
  return buildExportData({
    activite: rec.activite, mois: rec.mois, version: rec.version, selection: tripsOfExport(app.trips, rec.id),
    data: app, calc, genere_le: rec.created_at,
  })
}

export function defaultRecapMonth(app: AppData, today: string): string {
  const prev = prevMonth(monthOf(today))
  const reste = app.trips.some((t) => t.statut !== 'exporte' && t.date <= lastDayOfMonth(prev))
  return reste ? prev : monthOf(today)
}
```

Run : `npx vitest run src/app/exportFlow.test.ts` → PASS.

- [ ] **Step 3 : `src/screens/Recap.tsx` (remplacement complet)**

```tsx
import { useState } from 'react'
import { defaultRecapMonth, prepareExport, rebuildExport, runExport, type PreparedExport } from '../app/exportFlow'
import { supabase } from '../app/supabase'
import { syncEngine } from '../app/sync'
import type { TripCalc } from '../domain/chain'
import { ACTIVITES, ACTIVITE_LABEL, type Activite, type ExportRecord, type ExportStatut } from '../domain/types'
import type { ExportData } from '../export/build'
import { makeExportFiles, shareOrDownload } from '../export/share'
import type { AppData } from '../hooks/useData'
import { nextMonth, nowISO, prevMonth, todayISO } from '../lib/dates'
import { formatDateCourte, formatEuro, formatKm, formatMoisLong, round2 } from '../lib/format'
import { ActionSheet } from '../ui/ActionSheet'
import { ActivityDot } from '../ui/ActivityDot'
import { PrimaryButton } from '../ui/Button'
import { IconChevron } from '../ui/icons'
import { Row, Section } from '../ui/List'
import { LargeTitle, NavButton } from '../ui/NavBar'

export interface RecapProps {
  data: AppData
  calc: Map<string, TripCalc>
  onOpenTrip: (id: string) => void
}

const STATUT_LABEL: Record<ExportStatut, string> = { emis: 'Émis', a_rectifier: 'À rectifier', remplace: 'Remplacé' }
const TOTAL_LABEL: Record<Activite, string> = { swing_house: 'À te verser', lmnp: 'Charge déductible' }

export default function Recap({ data, calc, onOpenTrip }: RecapProps) {
  const [mois, setMois] = useState(() => defaultRecapMonth(data, todayISO()))
  const [open, setOpen] = useState<Activite | null>(null)
  const [confirm, setConfirm] = useState<{ activite: Activite; prepared: PreparedExport; drafts: number } | null>(null)
  const [ready, setReady] = useState<{ files: File[]; title: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previews = Object.fromEntries(ACTIVITES.map((a) => [a, prepareExport(data, calc, a, mois, nowISO())])) as Record<Activite, ReturnType<typeof prepareExport>>
  const emis = (a: Activite) =>
    data.exports.filter((e) => e.activite === a && e.mois === mois && e.statut === 'emis').sort((x, y) => y.version - x.version)[0]

  // Totaux affichés : export émis s'il existe, sinon aperçu de ce qui serait exporté.
  const totals = (a: Activite) => {
    const e = emis(a)
    if (e) return e.totaux
    return previews[a].prepared?.data.totaux ?? { km: 0, bareme: 0, frais: 0, total: 0, nb_trajets: 0 }
  }
  const global = round2(ACTIVITES.reduce((s, a) => s + totals(a).total, 0))

  function share(d: ExportData) {
    setReady({ files: makeExportFiles(d), title: `${ACTIVITE_LABEL[d.activite]} — ${formatMoisLong(d.mois)} (v${d.version})` })
  }

  async function doExport() {
    if (!confirm || !supabase) return
    const { prepared } = confirm
    setConfirm(null)
    setBusy(true)
    setError(null)
    try {
      await syncEngine?.syncNow() // pousse d'abord les trajets en attente
      await runExport(supabase, prepared)
      await syncEngine?.syncNow() // récupère les trajets verrouillés et l'export
      share(prepared.data)
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : 'Export impossible hors ligne.')
    } finally {
      setBusy(false)
    }
  }

  const historique = [...data.exports].sort((a, b) => b.mois.localeCompare(a.mois) || b.version - a.version)

  return (
    <>
      <LargeTitle
        title="Récap"
        subtitle={formatMoisLong(mois)}
        right={
          <>
            <NavButton onClick={() => setMois(prevMonth(mois))} label="Mois précédent">
              <IconChevron className="size-5 rotate-180" />
            </NavButton>
            <NavButton onClick={() => setMois(nextMonth(mois))} label="Mois suivant">
              <IconChevron className="size-5" />
            </NavButton>
          </>
        }
      />

      {ACTIVITES.map((a) => {
        const p = previews[a]
        const t = totals(a)
        const e = emis(a)
        const trajets = e ? data.trips.filter((x) => x.export_id === e.id) : p.prepared ? [...p.prepared.data.lignes, ...p.prepared.data.pourMemoire].map((l) => data.trips.find((x) => x.id === l.trip_id)!).filter(Boolean) : []
        const rattrapages = p.prepared?.data.lignes.filter((l) => l.rattrapage).length ?? 0
        return (
          <div key={a}>
            <Section
              header={
                <span className="inline-flex items-center gap-2">
                  <ActivityDot activite={a} />
                  {ACTIVITE_LABEL[a]}
                </span>
              }
              footer={
                e
                  ? `Exporté le ${formatDateCourte(e.created_at.slice(0, 10))} (v${e.version}), trajets verrouillés.`
                  : [
                      p.prepared?.data.version && p.prepared.data.version > 1 ? `Rectificatif : version ${p.prepared.data.version}.` : '',
                      rattrapages ? `${rattrapages} rattrapage(s) de mois antérieurs inclus.` : '',
                      p.prepared?.data.bareme_provisoire ? 'Barème provisoire.' : '',
                    ].filter(Boolean).join(' ') || undefined
              }
            >
              <Row label="Trajets" value={t.nb_trajets} />
              <Row label="Distance" value={formatKm(t.km)} />
              <Row label="Barème kilométrique" value={formatEuro(t.bareme)} />
              <Row label="Péages, parkings" value={formatEuro(t.frais)} />
              <Row label={<span className="font-semibold">{TOTAL_LABEL[a]}</span>} value={<span className="font-semibold text-label">{formatEuro(t.total)}</span>} />
              {p.drafts.length > 0 && !e && (
                <Row label={<span className="text-orange">{p.drafts.length} brouillon(s) à compléter</span>} onClick={() => onOpenTrip(p.drafts[0].id)} chevron />
              )}
              {trajets.length > 0 && <Row label={open === a ? 'Masquer les trajets' : `Voir les ${trajets.length} trajet(s)`} tone="accent" onClick={() => setOpen(open === a ? null : a)} />}
              {open === a &&
                trajets.map((x) => (
                  <Row
                    key={x.id}
                    label={x.motif}
                    detail={`${formatDateCourte(x.date)} · ${formatKm(x.km_total)}${x.nature === 'domicile_travail' ? ' · domicile–travail' : ''}`}
                    value={formatEuro(calc.get(x.id)?.total ?? 0)}
                    onClick={() => onOpenTrip(x.id)}
                    chevron
                  />
                ))}
            </Section>
            <div className="-mt-4 mb-8 px-4">
              {e ? (
                <PrimaryButton tone="plain" onClick={() => share(rebuildExport(data, calc, e))}>
                  Re-partager les fichiers
                </PrimaryButton>
              ) : (
                <PrimaryButton
                  disabled={busy || !p.prepared}
                  onClick={() => p.prepared && setConfirm({ activite: a, prepared: p.prepared, drafts: p.drafts.length })}
                >
                  {p.prepared ? `Exporter ${ACTIVITE_LABEL[a]} — ${formatMoisLong(mois)}` : (p.blocked ?? 'Rien à exporter')}
                </PrimaryButton>
              )}
            </div>
          </div>
        )
      })}

      <Section footer={error && <span className="text-red">{error}</span>}>
        <Row label={<span className="font-semibold">Total global</span>} value={<span className="font-semibold text-label">{formatEuro(global)}</span>} />
      </Section>

      {historique.length > 0 && (
        <Section header="Exports">
          {historique.map((e: ExportRecord) => (
            <Row
              key={e.id}
              label={`${ACTIVITE_LABEL[e.activite]} — ${formatMoisLong(e.mois)}`}
              detail={`v${e.version} · ${STATUT_LABEL[e.statut]} · ${formatDateCourte(e.created_at.slice(0, 10))}`}
              value={formatEuro(e.totaux.total)}
              onClick={e.statut === 'emis' ? () => share(rebuildExport(data, calc, e)) : undefined}
            />
          ))}
        </Section>
      )}

      <ActionSheet
        open={confirm != null}
        title={confirm ? `Exporter ${ACTIVITE_LABEL[confirm.activite]} — ${formatMoisLong(mois)}` : undefined}
        message={
          confirm
            ? `${confirm.prepared.payload.length} trajet(s) seront verrouillés.` +
              (confirm.drafts > 0 ? ` ${confirm.drafts} brouillon(s) partiront au prochain export (rattrapage).` : '')
            : undefined
        }
        actions={[
          ...(confirm && confirm.drafts > 0
            ? [{ label: 'Compléter d’abord', bold: true, onClick: () => { const d = previews[confirm.activite].drafts[0]; setConfirm(null); onOpenTrip(d.id) } }]
            : []),
          { label: confirm && confirm.drafts > 0 ? 'Exporter quand même' : 'Exporter et verrouiller', bold: !confirm?.drafts, onClick: () => void doExport() },
        ]}
        onCancel={() => setConfirm(null)}
      />
      <ActionSheet
        open={ready != null}
        title={ready?.title}
        message={ready?.files.map((f) => f.name).join(' · ')}
        actions={[
          {
            label: 'Partager PDF + CSV',
            bold: true,
            // Tap direct : iOS n'ouvre la feuille de partage que sur un geste récent.
            onClick: () => {
              if (ready) void shareOrDownload(ready.files, ready.title).then(() => setReady(null))
            },
          },
        ]}
        onCancel={() => setReady(null)}
      />
    </>
  )
}
```

- [ ] **Step 4 : Vérifier dans l'aperçu**

Run : `npm test && npx tsc -b` → PASS.
Aperçu mobile, onglet Récap (mois contenant les trajets saisis en Task 13) :
1. Carte Swing House : trajets, km, barème, frais, « À te verser » ; carte LMNP : « Charge déductible » ; « Total global ».
2. « Voir les trajets » liste chaque trajet avec son montant.
3. « Exporter Swing House — … » → feuille « N trajet(s) seront verrouillés » → « Exporter et verrouiller » → feuille « Partager PDF + CSV » → tap : fichiers téléchargés (repli bureau). `execute_sql` : `select statut, count(*) from trips group by statut;` → trajets SH en `exporte`.
4. La carte affiche « Exporté le … (v1) » et le bouton « Re-partager les fichiers » ; un nouveau clic sur Exporter n'est plus proposé.
5. Ouvrir un trajet exporté (cadenas) → « Rouvrir le trajet… » → motif « Erreur de motif » → Rouvrir → retour Récap : carte en « Rectificatif : version 2 », historique « v1 · À rectifier ». Exporter → v2 émise, v1 « Remplacé ».
6. `read_console_messages` (onlyErrors) → aucune erreur. Captures d'écran des étapes 1 et 5.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "feat: récap mensuel et export (verrouillage, partage iOS, historique, rectificatif)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 16 : PWA installable, déploiement GitHub Pages, anti-pause, mise en service et recette

**Files :**
- Create : `scripts/generate-icons.mjs`, `public/icon.svg`, `public/favicon.svg`, `.github/workflows/deploy.yml`, `.github/workflows/keepalive.yml`, `docs/mise-en-service.md`, `README.md`
- Modify : `vite.config.ts` (plugin PWA), `package.json` (script build)

**Interfaces :**
- Consumes : toute l'application.
- Produces : app installable (`manifest.webmanifest`, service worker), URL publique `https://swinghousechx.github.io/carnet-de-bord/`.

- [ ] **Step 1 : Icônes — `scripts/generate-icons.mjs`**

Pictogramme simple : épingle blanche sur fond bleu système. Reprend l'encodeur PNG sans dépendance de coach-sportif.

```js
// Génère les icônes PNG de la PWA : épingle blanche sur fond bleu #007AFF, sans dépendance.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(OUT, { recursive: true })

const BG = [0, 122, 255]
const FG = [255, 255, 255]

function pointInPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inRoundedRect(x, y, s, r) {
  if (x < 0 || y < 0 || x > s || y > s) return false
  const cx = Math.min(Math.max(x, r), s - r)
  const cy = Math.min(Math.max(y, r), s - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

// Épingle (repère 512) : tête = anneau centré (256, 216), pointe en (256, 420).
function inPin(x, y) {
  const d = Math.hypot(x - 256, y - 216)
  if (d <= 112) return d > 44
  return pointInPolygon(x, y, [[160, 262], [352, 262], [256, 420]])
}

function colorAt(x, y, variant) {
  let sx = x
  let sy = y
  let bg
  if (variant === 'full') {
    bg = [...BG, 255]
    sx = (x - 256) / 0.8 + 256 // zone de sécurité maskable / iOS
    sy = (y - 256) / 0.8 + 256
  } else {
    bg = inRoundedRect(x, y, 512, 112) ? [...BG, 255] : [0, 0, 0, 0]
  }
  return bg[3] && inPin(sx, sy) ? [...FG, 255] : bg
}

function render(size, variant) {
  const S = 3
  const data = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0, 0]
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const c = colorAt(((px + (i + 0.5) / S) * 512) / size, ((py + (j + 0.5) / S) * 512) / size, variant)
          for (let k = 0; k < 4; k++) acc[k] += c[k]
        }
      }
      const idx = (py * size + px) * 4
      for (let k = 0; k < 4; k++) data[idx + k] = Math.round(acc[k] / (S * S))
    }
  }
  return data
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [file, size, variant] of [
  ['pwa-192.png', 192, 'rounded'],
  ['pwa-512.png', 512, 'rounded'],
  ['maskable-512.png', 512, 'full'],
  ['apple-touch-icon.png', 180, 'full'],
]) {
  writeFileSync(join(OUT, file), png(size, render(size, variant)))
  console.log(`✓ ${file}`)
}
```

`public/icon.svg` et `public/favicon.svg` (même contenu) :
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#007AFF"/>
  <path fill="#fff" fill-rule="evenodd" d="M256 104a112 112 0 0 1 96 170L256 420 160 274a112 112 0 0 1 96-170zm0 68a44 44 0 1 0 0 88 44 44 0 0 0 0-88z"/>
</svg>
```

Run : `npm run icons` → 4 lignes `✓`. Ouvrir `public/pwa-512.png` (outil Read) : épingle blanche centrée sur fond bleu arrondi.

- [ ] **Step 2 : Plugin PWA — `vite.config.ts` (remplacement complet)**

```ts
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Base path : '/' en local, '/carnet-de-bord/' sur GitHub Pages (injecté par le workflow).
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Carnet de bord',
        short_name: 'Carnet',
        description: 'Frais kilométriques Swing House et LMNP.',
        lang: 'fr',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        orientation: 'portrait',
        id: base,
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Seule la coquille est mise en cache : jamais les réponses Supabase ni Google.
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], navigateFallback: 'index.html' },
      devOptions: { enabled: false },
    }),
  ],
})
```

`package.json` : remplacer le script `build` par `"build": "npm run icons && tsc -b && vite build"`.

Run : `npm run build` → `dist/manifest.webmanifest` et `dist/sw.js` présents.

- [ ] **Step 3 : Workflows GitHub**

`.github/workflows/deploy.yml` :
```yaml
name: Déploiement GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - name: Build
        run: npm run build
        env:
          VITE_BASE: /carnet-de-bord/
          # Variables de dépôt (Settings → Secrets and variables → Actions → Variables) : publiques par nature.
          VITE_SUPABASE_URL: ${{ vars.SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ vars.SUPABASE_PUBLISHABLE_KEY }}
          VITE_GOOGLE_MAPS_KEY: ${{ vars.GOOGLE_MAPS_KEY }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

`.github/workflows/keepalive.yml` :
```yaml
name: Anti-pause Supabase

# Un projet Supabase gratuit se met en pause après 7 jours sans activité.
on:
  schedule:
    - cron: '0 6 * * 1'
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping
        run: |
          curl -fsS -X POST "${{ vars.SUPABASE_URL }}/rest/v1/rpc/ping" \
            -H "apikey: ${{ vars.SUPABASE_PUBLISHABLE_KEY }}" \
            -H "Content-Type: application/json" -d '{}'
```

- [ ] **Step 4 : Documentation**

`docs/mise-en-service.md` :
```markdown
# Mise en service

1. **Supabase** (projet « carnet-de-bord ») : inscriptions désactivées, un seul compte (Authentication → Users). Migrations dans `supabase/migrations/`, recette dans `supabase/tests/verification.sql`.
2. **Google Cloud** (projet « carnet-de-bord ») : facturation active ; Maps JavaScript API, Places API (New), Routes API ; clé restreinte aux sites `https://swinghousechx.github.io/*` et `http://localhost:*` et à ces trois API ; plafonds journaliers de requêtes.
3. **GitHub** : dépôt public `swinghousechx/carnet-de-bord`, Pages en mode « GitHub Actions » ; variables de dépôt `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `GOOGLE_MAPS_KEY`.
4. **iPhone** : ouvrir https://swinghousechx.github.io/carnet-de-bord/ dans Safari → Partager → « Sur l'écran d'accueil » → ouvrir l'app → se connecter une fois → Réglages : véhicule, 3 favoris, vérifier le barème.

## Chaque année
- Janvier–avril : dès la publication du nouveau barème, Réglages → « Ajouter le barème AAAA » → corriger les valeurs. D'ici là, l'app applique le barème précédent marqué « provisoire ».
- Vérifier le choix fiscal de l'année (barème / frais réels, domicile–travail) **avant** le premier export : il se verrouille ensuite.

## Changement de véhicule
Réglages → « Ajouter un véhicule » avec sa date de début : l'actuel est clôturé la veille et les trajets non exportés postérieurs basculent sur le nouveau.

## Format du comptable
Quand le comptable aura donné son format, modifier uniquement `src/export/columns.ts`.
```

`README.md` :
```markdown
# Carnet de bord

PWA de frais kilométriques (Swing House SAS et LMNP EI) : saisie des trajets, barème kilométrique en chaîne annuelle, exports mensuels séparés (PDF + CSV) pour le comptable.

- Spec : `docs/superpowers/specs/2026-09-15-carnet-de-bord-design.md`
- Mise en service : `docs/mise-en-service.md`

```bash
npm install
cp .env.example .env.local   # remplir
npm run dev
npm test
```
```

- [ ] **Step 5 : Commit local**

```bash
git add -A
git commit -m "feat: PWA installable, déploiement GitHub Pages, anti-pause Supabase, docs de mise en service" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6 : Publier (avec accord explicite de Sam — dépôt public)**

Demander à Sam : « Je crée le dépôt public swinghousechx/carnet-de-bord et je pousse le code ? ». Après son oui :
```bash
gh repo create swinghousechx/carnet-de-bord --public --source /Users/samuelpochat/Documents/carnet-de-bord --push
gh variable set SUPABASE_URL --repo swinghousechx/carnet-de-bord --body "<url du projet>"
gh variable set SUPABASE_PUBLISHABLE_KEY --repo swinghousechx/carnet-de-bord --body "<clé publishable>"
gh variable set GOOGLE_MAPS_KEY --repo swinghousechx/carnet-de-bord --body "<clé Google>"
gh api -X POST repos/swinghousechx/carnet-de-bord/pages -f build_type=workflow
gh workflow run deploy.yml --repo swinghousechx/carnet-de-bord
gh run watch --repo swinghousechx/carnet-de-bord --exit-status
```
Expected : run vert (tests + build + deploy).

- [ ] **Step 7 : Recette de bout en bout**

Dans le navigateur (`navigate` vers `https://swinghousechx.github.io/carnet-de-bord/`, preset `mobile`) :
1. La page charge sans erreur console ; `read_network_requests` : `manifest.webmanifest` et `sw.js` servis sous `/carnet-de-bord/`.
2. Sam se connecte (lui-même).
3. Récap → mois courant → export Swing House : les deux fichiers se téléchargent ; ouvrir le PDF (outil Read) : accents et « € » corrects, titre, véhicule, cumul, tableau, « Certifié exact ».

Sur l'iPhone de Sam (à lui faire faire, liste à lui envoyer) :
1. Safari → Partager → « Sur l'écran d'accueil » ; l'icône bleue à épingle apparaît ; l'app s'ouvre en plein écran, barre d'état lisible.
2. Connexion une fois ; fermer/rouvrir l'app → toujours connecté.
3. Mode Avion → ajouter un trajet vers un favori → Brouillon « Au retour du réseau » ; désactiver le mode Avion → quelques secondes plus tard : km calculés, trajet validé.
4. Export d'un mois → feuille de partage iOS avec PDF + CSV → envoi par mail à lui-même.
5. Mode sombre iOS → l'app suit.

- [ ] **Step 8 : Fin**

Mettre à jour la mémoire du projet (URL de prod, état « déployé »). Proposer à Sam d'envoyer au comptable le message de l'annexe A de la spec.

---

# Carnet de bord — Notes de frais kilométriques · Design

Date : 2026-09-15 · Statut : validé en brainstorming, en attente de relecture de la spec écrite.
Source : cahier des charges fonctionnel de Sam (« Carnet de bord — Notes de frais déplacements pro »), amendé par les décisions ci-dessous.

## 1. Objectif et périmètre

PWA installable sur iPhone pour logger chaque déplacement professionnel, calculer le montant dû au barème kilométrique + frais annexes, et produire chaque mois **deux exports distincts** pour le comptable :

- **Swing House (SAS)** : note de frais versée par la société au dirigeant (remboursement).
- **LMNP Nid de l'Aiguille (EI, BIC réel)** : charge déductible dans la compta de l'EI (pas un versement).

Un seul utilisateur (Sam). Pas de PIN/Face ID à l'ouverture, mais backend protégé.

## 2. Décisions prises

| Sujet | Décision |
|---|---|
| Architecture | PWA **local-first** : données sur le téléphone (IndexedDB), synchro auto vers Supabase |
| Stack front | Vite + React + TypeScript + Tailwind + vite-plugin-pwa (même base que coach-sportif) |
| Backend | **Nouveau projet Supabase dédié** « carnet-de-bord » dans l'org swinghousechx (Postgres + Auth + RLS) |
| Hébergement | **GitHub Pages**, repo public `swinghousechx/carnet-de-bord`, déploiement auto sur push `main` |
| Cartographie | **Google Maps Platform** : Places API (New) pour l'autocomplete, **Routes API** pour les km |
| Domicile ↔ Swing House | Tagué « domicile–travail », **exclu par défaut** de la note SAS, réintégrable par réglage annuel |
| Cumul barème | **Séparé par activité** : un compteur par (véhicule, activité, année civile) — à confirmer par le comptable |
| Format export | Format standard PDF + CSV, colonnes centralisées dans un fichier de config ; question posée au comptable (annexe A) |
| Statut « validé » | **Automatique** dès qu'un trajet est complet ; brouillon = incomplet ou mis de côté volontairement |
| Montants à l'accueil | **Aucun montant en euros sur l'accueil** : les montants n'apparaissent que dans l'écran Récap/export |
| Design visuel | **Simple, épuré, style Apple** : l'app doit ressembler à une app iOS native (§9.0) |
| Emplacement local | `/Users/samuelpochat/Documents/carnet-de-bord` |

## 3. Corrections apportées au cahier des charges

1. **Mode barème / frais réels = choix annuel pour tous les véhicules**, pas par véhicule. En cas de changement de véhicule en cours d'année, on ne peut pas mettre l'ancien en frais réels et le nouveau au barème. Le barème reste en revanche **calculé séparément par véhicule** (on ne fait pas masse des km). Le mode est donc porté par (année, activité).
2. **La formule du barème s'applique au total annuel `D`**, pas à la distance d'un trajet. Le montant d'un trajet est `barème(cumul après) − barème(cumul avant)`. Conséquence : au-delà de 5 000 km, chaque km rapporte **moins** (ex. 5 CV : 0,357 €/km au lieu de 0,636 €). Le passage de tranche n'est pas « plus avantageux » ; il doit juste être calculé sans erreur.
3. **Distance Matrix et Directions (legacy) ne sont plus ouvertes aux nouveaux projets Google depuis mars 2025** → Routes API + Places API (New).
4. **Trajets domicile–lieu de travail habituel** : pour l'URSSAF ce ne sont pas des déplacements professionnels ; des IK versées par la SAS pour ces trajets ne sont exonérées que si le dirigeant est contraint d'utiliser son véhicule (horaires, absence de transports). Sans preuve, risque de réintégration en salaire. D'où le tag + exclusion par défaut.

## 4. Architecture

```
iPhone (PWA standalone)
 ├─ UI React (4 écrans)
 ├─ Moteur de calcul (TS pur, testé)          ← src/domain/
 ├─ Store local IndexedDB (Dexie)             ← source de l'UI, marche hors ligne
 ├─ Moteur de synchro (outbox + pull)         ← src/sync/
 ├─ Google Maps JS (places + routes)          ← en ligne uniquement
 └─ Export PDF/CSV + Web Share API            ← src/export/
        │  HTTPS (clé publishable + session Auth)
        ▼
Supabase « carnet-de-bord »
 ├─ Tables + RLS (owner = auth.uid())
 ├─ Triggers : verrou des trajets exportés, verrou du choix fiscal annuel, updated_at serveur
 └─ RPC : export_month(), reopen_trip(), ping()
```

Unités isolées (chacune testable seule) :
- `domain/bareme.ts` : `baremeAmount(D, cv, energie, rates)` et le calcul en chaîne d'un groupe.
- `domain/trips.ts` : résolution du véhicule par date, nature domicile–travail, complétude/statut, validation du motif, détection de doublon.
- `sync/` : outbox, push, pull, gestion des rejets serveur.
- `geo/` : chargement Maps JS, autocomplete, calcul d'itinéraire.
- `export/` : construction des lignes, `columns.ts`, rendu PDF, rendu CSV, partage.

## 5. Modèle de données

Toutes les tables : `id uuid` (généré côté client, `crypto.randomUUID()`), `owner_id uuid default auth.uid()`, `created_at`, `updated_at` (posé par trigger serveur), `deleted_at` (suppression logique, pour la synchro). Même schéma dans Dexie.

### `vehicles`
`nom`, `immatriculation`, `cv int` (1–50), `energie` ∈ {`thermique`, `electrique`}, `date_debut date`, `date_fin date null`.
Contrainte d'exclusion : pas de chevauchement de périodes (un seul véhicule actif à une date donnée — MVP séquentiel).

### `fiscal_years` — clé (owner, `annee`, `activite`)
`mode` ∈ {`bareme`, `frais_reels`} (défaut `bareme`), `inclure_domicile_travail bool` (défaut `false`).
Ligne absente = valeurs par défaut. **Verrouillé** (trigger) dès qu'un trajet de cette (année, activité) est exporté.

### `bareme_years` — clé (owner, `annee`)
`majoration_electrique numeric` (2026 : 0,20), `source text` (référence de l'arrêté).

### `bareme_rates`
`annee`, `cv_min int null`, `cv_max int null`, `km_min numeric`, `km_max numeric null`, `coef numeric`, `constante numeric`.
Tranches : `D ≤ 5 000`, `5 000 < D ≤ 20 000`, `D > 20 000`. « 3 CV et moins » = `cv_max 3` ; « 7 CV et plus » = `cv_min 7`.
Pré-rempli 2026 (voitures thermiques/hybrides, identique 2025) :

| CV | ≤ 5 000 km | 5 001 à 20 000 km | > 20 000 km |
|---|---|---|---|
| ≤ 3 | D × 0,529 | D × 0,316 + 1 065 | D × 0,370 |
| 4 | D × 0,606 | D × 0,340 + 1 330 | D × 0,407 |
| 5 | D × 0,636 | D × 0,357 + 1 395 | D × 0,427 |
| 6 | D × 0,665 | D × 0,374 + 1 457 | D × 0,447 |
| ≥ 7 | D × 0,697 | D × 0,394 + 1 515 | D × 0,470 |

Électrique : montant × (1 + `majoration_electrique`).

### `places`
`label`, `adresse`, `google_place_id`, `lat`, `lng`, `role` ∈ {`domicile`, `swing_house`, `lmnp`, null} (unique par rôle), `last_used_at`.
Favoris initiaux : Domicile (Servoz), Swing House, Appartement LMNP (Chamonix). Les lieux déjà utilisés servent de « récents ».

### `trips`
| Colonne | Détail |
|---|---|
| `date` | date du trajet |
| `activite` | `swing_house` \| `lmnp` — une seule, obligatoire |
| `motif` | texte, validé (§7) |
| `depart_place_id`, `arrivee_place_id` | + **copie** `depart_label/adresse`, `arrivee_label/adresse` (l'historique ne bouge pas si un favori change) |
| `km_route` | aller simple calculé par Routes API, en km à 0,1 près ; null tant que non calculé |
| `km_saisi` | aller simple saisi à la main (null si pas de correction) |
| `justif_km` | obligatoire si `km_saisi` ≠ `km_route` (ex. « détour dépose matériel chez X ») |
| `aller_retour` | bool |
| `km_total` | `(km_saisi ?? km_route) × (aller_retour ? 2 : 1)` |
| `vehicle_id` | déduit de la date (§6.1), stocké |
| `nature` | `pro` \| `domicile_travail` |
| `statut` | `brouillon` \| `valide` \| `exporte` |
| `montant_bareme` | calculé ; **figé** à l'export |
| `export_id` | null tant que non exporté |

### `trip_expenses`
`trip_id`, `type` ∈ {`peage`, `parking`, `autre`}, `montant numeric(8,2)` > 0, `note`. Verrouillé si le trajet est exporté.

### `exports`
`activite`, `mois` (`YYYY-MM`), `version int` (1, 2…), `statut` ∈ {`emis`, `a_rectifier`}, `bareme_annee`, `bareme_provisoire bool`, `totaux jsonb` (km, barème, frais, total), `trip_ids uuid[]`, `created_at`.

### `trip_events` (journal)
`trip_id`, `export_id`, `action` ∈ {`export`, `reopen`}, `motif` (obligatoire pour `reopen`), `created_at`. Insert-only.

## 6. Moteur de calcul

### 6.1 Rattachements
- **Véhicule** : celui dont `date_debut ≤ date ≤ date_fin` (fin vide = ∞). Aucun → trajet en brouillon « véhicule manquant ».
- **Nature** : si {départ, arrivée} ont les rôles {`domicile`, `swing_house`} et `activite = swing_house`, le formulaire demande « trajet domicile–travail habituel ou déplacement pro ? » (réponse obligatoire). Sinon `pro`.
- **Choix fiscal** : `fiscal_years` de (année du trajet, activité), défauts sinon.

### 6.2 Groupes et chaîne
Groupe = (véhicule, activité, année civile). Un trajet **compte** si : non supprimé, `nature = pro` **ou** (`domicile_travail` et `inclure_domicile_travail`), et mode de l'année = `bareme`. Les trajets qui ne comptent pas ont `montant_bareme = 0` et n'entrent pas dans le cumul.

Pour chaque groupe :
```
C ← somme des km_total des trajets exportés du groupe (montants figés, inchangés)
B ← somme des montant_bareme figés de ces trajets (ce qui a réellement été versé ; B ≠ round2(f(C)) en général)
pour chaque trajet non exporté qui compte, trié par (date, created_at, id) :
    montant ← round2(f(C + km_total)) − B      (non plafonné à 0)
    C ← C + km_total
    B ← round2(f(C))
```
`f(D)` = formule de la tranche contenant `D` pour le CV du véhicule, × (1 + majoration) si électrique. Propriété garantie et testée : **la somme des montants d'un groupe = round2(f(D_total))**, quel que soit l'ordre d'export ou les réouvertures (somme télescopique ; le premier trajet non exporté absorbe l'écart entre les montants figés et round2(f(C))). Si le barème ou le CV change après un export, le total vaut round2(f_nouveau(D_total)) ; le premier montant recalculé peut alors être négatif.
Les brouillons comptent dans le calcul (vision « projetée ») ; seuls les trajets validés sont exportables.

### 6.3 Barème de l'année
Utilise `bareme_rates` de l'année du trajet ; à défaut, la dernière année disponible antérieure, marquée **provisoire** (affichée à l'écran et sur l'export). Saisir le nouveau barème recalcule les trajets non exportés ; les exportés restent figés.

### 6.4 Frais annexes
Somme des `trip_expenses`, toujours ajoutés, quel que soit le mode. En mode `frais_reels`, le montant véhicule est 0 et seuls les frais annexes comptent (frais réels complets gérés hors app ; les km restent enregistrés).

## 7. Garde-fous de conformité

- Champs obligatoires : date, activité, motif, départ, arrivée (lieux Google résolus), km.
- **Motif** : ≥ 12 caractères après trim, et refus si le motif, une fois normalisé (minuscules, sans accents ni ponctuation), est uniquement un terme générique : « deplacement », « deplacement pro », « trajet », « rdv », « rendez vous », « reunion », « visite », « course », « divers ». Suggestions = motifs récents.
- **Doublon** : si un trajet non supprimé existe avec même date + même départ + même arrivée + même activité → alerte « Trajet identique déjà saisi — c'est bien un deuxième trajet ? » (confirmation explicite, pas de blocage).
- **Km manuel** différent du calcul Google → justification obligatoire, affichée sur l'export.
- Pas de bouton « dupliquer ». Une seule activité par trajet (colonne non multiple).
- Trajet exporté non modifiable ni supprimable (trigger serveur) sauf via `reopen_trip` avec motif, journalisé.

## 8. Statuts et cycle de vie

- **brouillon** : incomplet (km non calculés hors ligne, adresse non résolue, véhicule manquant, question domicile–travail sans réponse) ou enregistré via « Finir plus tard ».
- **valide** : automatiquement dès que le trajet est complet et que les règles du §7 passent.
- **exporte** : posé par `export_month`. Verrouillé.
- **Périmètre d'un export** (activité A, mois M) : tous les trajets de A au statut `valide`, non exportés, datés **au plus tard le dernier jour de M** — y compris ceux des mois ou années antérieurs (marqués « rattrapage de <mois> », calculés dans la chaîne de leur propre année). Les trajets domicile–travail exclus du mois sont inclus dans l'export (section « pour mémoire », montant 0) et verrouillés comme les autres.
- Un (activité, mois) déjà exporté au statut `emis` ne peut pas être ré-exporté ; un trajet oublié de ce mois part au prochain export en rattrapage. Seul un export `a_rectifier` (après réouverture) donne lieu à une version n+1.
- **Réouverture** : `reopen_trip(trip_id, motif)` → trajet repasse `valide`, `export_id` null, l'export d'origine passe `a_rectifier`, événement journalisé. Le prochain export du même (activité, mois) sort en **version n+1 « annule et remplace »** : trajets encore verrouillés de la version précédente (montants figés) + trajets rouverts (recalculés) + nouveaux.
- Suppression : autorisée pour brouillon/valide (suppression logique), interdite pour exporte.

## 9. Écrans

### 9.0 Direction visuelle : simple, épurée, style Apple

L'app doit ressembler à une app iOS native (Réglages, Rappels, Cartes), pas à un site web ni à un dashboard.

- **Typographie** : police système (`system-ui, -apple-system` → SF Pro sur iPhone). Échelle iOS : grand titre 34 pt gras en tête d'écran, corps 17 pt, secondaire 15 pt, notes 13 pt. Chiffres tabulaires (`tabular-nums`) pour les km et les montants.
- **Couleurs** : palette système iOS. Fond gris groupé (#F2F2F7), cellules blanches, texte noir, texte secondaire gris, séparateurs d'un pixel. **Une seule couleur d'accent** (bleu système #007AFF) pour les actions. Les activités sont repérées par un simple point de couleur (deux teintes système discrètes), rien de plus. Brouillon = libellé orange discret ; exporté = petit cadenas gris. Mode sombre automatique (fond noir, cellules #1C1C1E).
- **Mise en page** : listes groupées en encarts arrondis (« inset grouped », comme l'app Réglages), marges généreuses, une information principale par écran. Pas de cartes à ombre, pas de dégradé, pas d'illustration, pas de logo dans l'interface.
- **Composants natifs** : barre d'onglets en bas (Accueil · Récap · Réglages, icônes à trait fin type SF Symbols) ; bouton « + » en haut à droite de l'accueil ; ajout/modification d'un trajet dans une **feuille modale** qui monte du bas (« Annuler » à gauche, « Enregistrer » à droite) ; contrôle segmenté pour l'activité ; interrupteurs iOS pour l'aller-retour ; pastilles arrondies pour les favoris ; feuille d'action iOS pour les confirmations (export, réouverture).
- **Mouvement** : minimal et fonctionnel (montée de feuille à ressort, transitions courtes), aucune animation décorative, respect du réglage « réduire les animations ».
- **Sensation native** : zones sûres (encoche, barre d'accueil), pas de surbrillance au toucher, champs en 17 pt (pas de zoom automatique), cibles tactiles ≥ 44 pt, hauteur `100dvh`, barre d'état assortie, affichage `standalone`.
- **Icône d'app** : un pictogramme simple sur fond uni.

### 9.1 Accueil
- Mois en cours : **nombre de trajets et km cumulés**, par activité. **Aucun montant en euros.**
- Liste des trajets groupés par jour (motif, départ → arrivée, km, activité, statut ; badge brouillon).
- Bandeau si le mois précédent a des trajets non exportés dans une activité (→ Récap).
- Indicateur de synchro (à jour / N modifications en attente / hors ligne).

### 9.2 Ajouter / modifier un trajet (objectif < 20 s)
1. Activité : 2 boutons, dernière utilisée pré-sélectionnée.
2. Date : aujourd'hui par défaut.
3. Départ : Domicile pré-rempli (chip modifiable).
4. Arrivée : chips favoris + récents ; sinon champ autocomplete Google.
5. Km : calcul auto dès départ + arrivée connus (« calcul… » / « hors ligne — calcul au retour du réseau ») ; bouton « corriger » → saisie + justification.
6. Aller-retour : interrupteur.
7. Motif : champ + suggestions récentes.
8. Question domicile–travail si applicable.
9. Véhicule : affiché en lecture seule (déduit de la date).
10. « + Péage / Parking / Autre » : lignes montant + note.
11. **Enregistrer** (→ validé si complet) · « Finir plus tard » (→ brouillon).
Après enregistrement : bouton **« Étape suivante »** → nouveau trajet pré-rempli avec départ = arrivée précédente, même date et activité (saisie des sorties multi-étapes, un segment = un trajet).
Hors ligne : autocomplete indisponible → seuls favoris et récents sélectionnables ; trajet en brouillon jusqu'au calcul des km.

### 9.3 Récap / export
- Sélecteur de mois.
- Une carte par activité : km, montant barème, frais annexes, total (« **à te verser** » pour Swing House, « **charge déductible** » pour LMNP), nombre de trajets, brouillons restants, rattrapages. Total global.
- Mention « barème provisoire » si applicable.
- Bouton « Exporter Swing House — septembre 2026 » (idem LMNP) : pousse la synchro, confirme (« Verrouille N trajets »), appelle `export_month`, génère PDF + CSV, ouvre la feuille de partage iOS avec les deux fichiers. Si des brouillons existent sur ce mois : action principale « Compléter d'abord », secondaire « Exporter quand même » (les brouillons partiront au prochain export en rattrapage).
- Historique des exports (version, date, statut) avec re-partage (fichiers régénérés à partir des données figées).
- Export et réouverture nécessitent le réseau.

### 9.4 Réglages
- Véhicules : liste, ajout, dates de début/fin, CV, énergie.
- Choix fiscal par année et par activité : mode barème / frais réels, inclusion domicile–travail (verrouillés après le premier export de l'année).
- Favoris : Domicile, Swing House, Appartement LMNP (autocomplete Google).
- Barème : tableau par année, éditable, ajout d'une nouvelle année (pré-rempli par copie de la précédente).
- Compte : email, déconnexion ; état de la synchro, date de dernière synchro.

## 10. Synchro hors ligne

- Dexie = source de l'UI. Chaque écriture locale marque la ligne « à pousser » (outbox).
- **Push** au retour du réseau / au démarrage / toutes les 60 s en ligne : upsert par ordre de dépendance (places, vehicles, fiscal_years, bareme_*, trips, trip_expenses).
- **Pull** : lignes dont `updated_at` (horloge serveur) > dernier curseur.
- Conflit : dernière écriture gagne (un seul utilisateur). Si le serveur rejette une modification (trajet exporté), la version locale est remplacée par celle du serveur et un message l'explique.
- Au retour du réseau, les trajets en brouillon « km non calculés » sont calculés automatiquement puis revalidés.
- `navigator.storage.persist()` demandé au premier lancement.

## 11. Sécurité

- **Supabase Auth** email + mot de passe, un seul compte, inscriptions désactivées. Connexion une fois ; session persistée (refresh token). Les web apps de l'écran d'accueil iOS ne sont pas soumises à l'effacement des données Safari après 7 jours.
- **RLS** sur toutes les tables : `owner_id = auth.uid()` en lecture et écriture.
- **Triggers** : refus UPDATE/DELETE d'un trajet `exporte` (et de ses frais) hors `reopen_trip` ; refus de modifier `fiscal_years` verrouillé ; `updated_at = now()`.
- **RPC** `export_month(activite, mois, lignes)` et `reopen_trip(trip_id, motif)` : transactionnelles, `security invoker`, RLS appliquée.
- **Clé Google** : restreinte par référent HTTP (`https://swinghousechx.github.io/*`, `http://localhost:*`), APIs limitées à Maps JavaScript API, Places API (New), Routes API, plafonds de requêtes journaliers.
- Clés présentes dans le bundle public : uniquement la clé publishable Supabase et la clé Google restreinte. Aucun secret dans le repo.
- **Anti-pause** Supabase (projet gratuit mis en pause après 7 jours sans activité) : GitHub Action hebdomadaire appelant `rpc/ping`.

## 12. Export

### PDF (un par activité et par mois)
Mise en page sobre, dans le même esprit que l'app : noir sur blanc, Helvetica, filets fins, aucune couleur.
- En-tête : « Swing House SAS — Note de frais kilométriques » ou « LMNP Nid de l'Aiguille (EI) — Frais de déplacement ». Bénéficiaire : Sam Pochat. Période. Version (« v2 — annule et remplace v1 » le cas échéant).
- Véhicule(s) : nom, immatriculation, CV, énergie. Barème appliqué (année, « provisoire » le cas échéant). Cumul annuel du groupe avant / après ce mois.
- Tableau (une ligne par trajet) : date, motif, départ → arrivée, km (A/R indiqué), montant barème, frais annexes (détail), total. Justification des km corrigés en note. Rattrapages signalés avec leur mois d'origine.
- Section « Pour mémoire — trajets domicile–travail non remboursés » (SAS, si exclus) : date, km, montant 0.
- Totaux : km, barème, frais annexes, **total**. Mention « Certifié exact » + date.

### CSV
Une ligne par trajet ; colonnes définies dans `src/export/columns.ts` (seul fichier à modifier quand le comptable aura répondu). Séparateur `;`, décimales à virgule, UTF-8 avec BOM (ouverture directe dans Excel FR).

### Partage
Web Share API avec fichiers (PDF + CSV en une fois) ; repli : téléchargement.

## 13. Prérequis de mise en service (actions de Sam, guidées)

1. Google Cloud : créer un projet, activer la facturation, activer Maps JavaScript API + Places API (New) + Routes API, créer la clé, appliquer restrictions et plafonds.
2. Supabase : création du projet « carnet-de-bord » (coût confirmé avant création), désactivation des inscriptions, création du compte de Sam.
3. GitHub : repo public `swinghousechx/carnet-de-bord`, Pages activé via Actions, variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_KEY`.
4. iPhone : ouvrir l'URL dans Safari → Partager → « Sur l'écran d'accueil » → se connecter une fois → saisir véhicule et favoris.

## 14. Tests

- **Vitest — moteur de calcul** : bornes 4 999 / 5 000 / 5 001 et 20 000 / 20 001 km ; somme télescopique = `round2(f(D))` ; ordre d'insertion indifférent ; changement de véhicule en cours d'année (deux chaînes) ; trajets exportés figés + réouverture ; rattrapage ; électrique ; barème provisoire ; mode frais réels ; exclusion/inclusion domicile–travail ; arrondis.
- **Vitest — règles** : validation des motifs, résolution du véhicule par date, détection domicile–travail, complétude/statut, doublons, format CSV.
- **SQL** (via Supabase) : RLS, triggers de verrouillage, `export_month`, `reopen_trip`.
- **Parcours complet** dans le navigateur en format iPhone, en clair et en sombre : ajout, hors ligne simulé, synchro, export, réouverture, v2.

## 15. Hors MVP (V2)

Photo des justificatifs · suivi GPS · notifications push de fin de mois · plusieurs véhicules actifs en parallèle · alerte distance/jour anormale · suggestions depuis Google Calendar · mode frais réels complets détaillé.

## 16. Points à valider avec le comptable

1. Cumul du barème **séparé par activité** (SAS / EI).
2. Trajets domicile ↔ Swing House : exclus par défaut ; peut-on justifier la contrainte (horaires jusqu'à 22 h) pour les inclure ?
3. Usage du barème kilométrique dans la compta de l'EI LMNP (BIC réel, véhicule personnel non inscrit à l'actif).
4. Format d'export (colonnes, intitulés, CSV/Excel ou PDF seul) et rythme d'envoi.

### Annexe A — Message pour le comptable

> Bonjour,
>
> Je mets en place un petit outil pour tenir mes frais kilométriques, en deux dossiers séparés : Swing House (SAS, note de frais) et LMNP Nid de l'Aiguille (EI). Avant de figer l'export mensuel, j'ai besoin de ton avis sur quelques points :
>
> 1. **Format** : un PDF par activité et par mois te suffit, ou tu veux aussi un CSV/Excel ? Si oui, quelles colonnes et quels intitulés (ou un format d'import pour ton logiciel) ?
> 2. **Cumul du barème** : je compte appliquer le barème séparément par activité (km Swing House pour la SAS, km LMNP pour l'EI). Ça te va ?
> 3. **Trajets domicile ↔ Swing House** : je les exclus par défaut de la note SAS (trajet domicile–travail). Est-ce qu'on peut considérer que je suis contraint de prendre ma voiture (horaires jusqu'à 22 h) et donc les inclure ?
> 4. **LMNP** : je peux bien utiliser le barème kilométrique pour ma voiture perso dans la compta de l'EI ?
> 5. **Rythme** : un envoi mensuel par activité, ça te convient ?
>
> Merci !
> Sam

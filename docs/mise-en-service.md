# Mise en service

1. **Supabase** (projet « carnet-de-bord ») : inscriptions désactivées, un seul compte (Authentication → Users). Migrations dans `supabase/migrations/`, recette dans `supabase/tests/verification.sql`. La connexion se fait par e-mail et mot de passe : elle n'a pas besoin de l'« URL Configuration ». Renseigner `https://swinghousechx.github.io/carnet-de-bord/` dans Authentication → URL Configuration ne sert qu'aux liens envoyés par e-mail (réinitialisation du mot de passe).
2. **Google Cloud** (projet « carnet-de-bord ») : facturation active ; Maps JavaScript API, Places API (New), Routes API ; clé restreinte à ces trois API et aux référents suivants :
   - Développement local : `http://localhost:5173/*` (la console Google Cloud a refusé `http://localhost:*` : il faut le port exact de Vite) ;
   - Production : `https://swinghousechx.github.io/*` (les navigateurs n'envoient souvent que l'origine du site, un référent limité au chemin `/carnet-de-bord/` risque de ne pas correspondre) ;
   - Plafonds journaliers de requêtes.
3. **GitHub** : dépôt public `swinghousechx/carnet-de-bord`, Pages en mode « GitHub Actions » ; variables de dépôt `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `GOOGLE_MAPS_KEY`.
4. **iPhone** : ouvrir https://swinghousechx.github.io/carnet-de-bord/ dans Safari → Partager → « Sur l'écran d'accueil » → ouvrir l'app → se connecter une fois → Réglages : véhicule, 3 favoris, vérifier le barème.

## Chaque année
- Janvier–avril : dès la publication du nouveau barème, Réglages → « Ajouter le barème AAAA » → corriger les valeurs. D'ici là, l'app applique le barème précédent marqué « provisoire ».
- Vérifier le choix fiscal de l'année (barème / frais réels, domicile–travail) **avant** le premier export : il se verrouille ensuite.

## Changement de véhicule
Réglages → « Ajouter un véhicule » avec sa date de début et sans date de fin : l'actuel est clôturé la veille et les trajets non exportés postérieurs basculent sur le nouveau. Un véhicule ajouté avec une date de fin ne clôture pas le véhicule actuel.

## Format du comptable
Quand le comptable aura donné son format, modifier uniquement `src/export/columns.ts`.

## Maintenance
- **Anti-pause Supabase** : le workflow « Anti-pause Supabase » appelle la base deux fois par semaine, car un projet gratuit se met en pause après 7 jours sans activité. Si le projet est en pause, l'app ne synchronise plus et ne peut plus exporter : le réactiver depuis le tableau de bord Supabase (Restore project).
- **Règle des 60 jours de GitHub** : GitHub désactive les workflows planifiés d'un dépôt resté 60 jours sans activité. Le workflow se réactive lui-même à chaque passage ; s'il apparaît quand même désactivé (onglet Actions → « Anti-pause Supabase » → Enable workflow), le réactiver puis le lancer à la main (Run workflow).

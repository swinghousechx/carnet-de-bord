# Mise en service

1. **Supabase** (projet « carnet-de-bord ») : inscriptions désactivées, un seul compte (Authentication → Users). Migrations dans `supabase/migrations/`, recette dans `supabase/tests/verification.sql`. Dans Authentication → URL Configuration, ajouter l'URL du site de production (`https://swinghousechx.github.io/carnet-de-bord/`) à « Site URL » et/ou « Redirect URLs », sinon la connexion échoue une fois déployé.
2. **Google Cloud** (projet « carnet-de-bord ») : facturation active ; Maps JavaScript API, Places API (New), Routes API ; clé restreinte à ces trois API et aux référents suivants :
   - Développement local : `http://localhost:5173/*` (Google Cloud refuse le joker `http://localhost:*` sans port ni chemin, il faut le port exact de Vite) ;
   - Production : `https://swinghousechx.github.io/carnet-de-bord/*` (ou plus large, `https://swinghousechx.github.io/*`) ;
   - Plafonds journaliers de requêtes.
3. **GitHub** : dépôt public `swinghousechx/carnet-de-bord`, Pages en mode « GitHub Actions » ; variables de dépôt `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `GOOGLE_MAPS_KEY`.
4. **iPhone** : ouvrir https://swinghousechx.github.io/carnet-de-bord/ dans Safari → Partager → « Sur l'écran d'accueil » → ouvrir l'app → se connecter une fois → Réglages : véhicule, 3 favoris, vérifier le barème.

## Chaque année
- Janvier–avril : dès la publication du nouveau barème, Réglages → « Ajouter le barème AAAA » → corriger les valeurs. D'ici là, l'app applique le barème précédent marqué « provisoire ».
- Vérifier le choix fiscal de l'année (barème / frais réels, domicile–travail) **avant** le premier export : il se verrouille ensuite.

## Changement de véhicule
Réglages → « Ajouter un véhicule » avec sa date de début : l'actuel est clôturé la veille et les trajets non exportés postérieurs basculent sur le nouveau.

## Format du comptable
Quand le comptable aura donné son format, modifier uniquement `src/export/columns.ts`.

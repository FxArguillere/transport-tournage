# Transport tournage (PWA)

Stack : React (Vite) + Supabase + OpenRouteService, hébergement Cloudflare Pages.

## Mise en route
1. Supabase : créer un projet, exécuter `supabase/schema.sql` (SQL Editor).
2. Supabase > Authentication : créer l'utilisateur admin (e-mail + mot de passe), puis **désactiver les inscriptions** (Sign ups).
3. OpenRouteService : créer une clé gratuite, la restreindre au domaine de l'app.
4. `cp .env.example .env` et renseigner les 3 variables.
5. `npm install && npm run dev` (test) ; `npm run build` (production).

## Déploiement (GitHub Pages)
`./deploy.sh` construit l'app (clés lues dans `.env`) et pousse `dist` sur la branche `gh-pages`. Réglage GitHub : Settings > Pages > Source = branche `gh-pages`, dossier `/ (root)`.
Adresse : https://fxarguillere.github.io/transport-tournage/ (le nom du dépôt doit rester `transport-tournage`, sinon adapter `base` dans `vite.config.js`).

## Usage
- `/` : formulaire public (cible du QR code).
- `/admin` : équipe, lieux, export Excel, QR code (JPG/PNG + affiche A4 PDF).
- Km : voiture/bus/train/tram = itinéraire routier, vélo et à pied = profils dédiés.

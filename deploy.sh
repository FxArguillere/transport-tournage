#!/bin/bash
# Construit l'app et la publie sur la branche gh-pages (GitHub Pages).
set -e
cd "$(dirname "$0")"
REMOTE=$(git remote get-url origin)
npm run build
cp dist/index.html dist/404.html   # /admin fonctionne via le repli SPA
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Déploiement $(date +%F_%H:%M)"
git push -f "$REMOTE" gh-pages
rm -rf .git
echo "Publié : https://fxarguillere.github.io/transport-tournage/"

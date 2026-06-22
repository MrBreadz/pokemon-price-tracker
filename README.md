# pokemon-price-tracker

Dashboard de monitoring des prix des **displays Pokémon TCG japonais** (puis FR).
Front statique sur GitHub Pages, données collectées par un workflow GitHub
Actions qui écrit dans `data/prices.json`. Le site lit le JSON via
`raw.githubusercontent.com` (architecture découplée « le robot écrit, le site
lit »).

## Démarrage rapide

1. Repo **public**, push des fichiers.
2. Secret `RAKUTEN_APP_ID` dans *Settings → Secrets and variables → Actions*.
3. Renseigner `GH_USER` dans `assets/js/app.js`.
4. *Actions → pokemon-monitor → Run workflow* (premier remplissage).
5. *Settings → Pages* → branche `main` / root.
6. Ouvrir `https://VOTRE-PSEUDO.github.io/pokemon-price-tracker/`.

👉 Le guide complet pas à pas est dans **[GUIDE.md](./GUIDE.md)**.

## Ajouter un produit

Une entrée dans la liste `PRODUCTS` de `scripts/monitor.js`. Le front le détecte
automatiquement au prochain run.

## Stack

Vanilla JS · Chart.js (CDN) · Node 20+ (script, sans dépendance) · GitHub
Actions · GitHub Pages.

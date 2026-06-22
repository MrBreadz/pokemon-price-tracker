# pokemon-price-tracker — Guide complet de A à Z

Monitoring des prix des **displays Pokémon TCG japonais** (puis FR), avec courbes
d'évolution et KPIs, hébergé gratuitement sur GitHub Pages et alimenté par un
script GitHub Actions. Aucune base de données serveur, aucun coût d'hébergement.

---

## 1. L'architecture en une image (Option A)

Le principe : **un robot écrit, le site lit**. Les deux sont découplés par un
simple fichier JSON versionné dans Git.

```
                 ┌─────────────────────────────────────────────┐
                 │  GitHub Actions — workflow "pokemon-monitor"  │
                 │  (cron quotidien à 03:00 UTC)                 │
                 │                                               │
                 │   scripts/monitor.js                          │
                 │     1. lit data/prices.json                   │
                 │     2. interroge la source (API Rakuten…)     │
   API Rakuten ──┤     3. ajoute le point du jour                │
   (prix JP)     │     4. réécrit data/prices.json               │
                 │     5. git commit + push si diff              │
                 └───────────────────┬───────────────────────────┘
                                     │  écrit
                                     ▼
                       ┌───────────────────────────┐
                       │   data/prices.json         │  ← "la base de données"
                       │   (versionné dans le repo) │
                       └───────────────┬────────────┘
                                       │  lit (fetch)
                                       ▼
        raw.githubusercontent.com/USER/pokemon-price-tracker/main/data/prices.json
                                       │
                                       ▼
                 ┌─────────────────────────────────────────────┐
                 │  Front statique (GitHub Pages)                │
                 │  index.html + app.js (vanilla) + Chart.js     │
                 │   • calcule les KPIs côté navigateur          │
                 │   • détecte automatiquement les produits      │
                 │   • dessine une courbe par produit            │
                 └─────────────────────────────────────────────┘
```

**Pourquoi lire via `raw.githubusercontent.com` et pas via un `fetch("./data/prices.json")` ?**
Parce que le front lit alors le fichier **directement depuis Git**, sans dépendre
du redéploiement de Pages. Chaque commit de données est visible quasi
immédiatement (cache d'environ 5 min côté GitHub), et le site n'a pas besoin
d'être reconstruit à chaque mise à jour de prix. C'est tout l'intérêt de
l'Option A : le pipeline de données et le site vivent leur vie séparément.

> **Contrainte importante :** `raw.githubusercontent.com` n'est accessible
> publiquement que pour un **repo public**. Sur un repo privé, l'URL raw exige un
> token → on perd la simplicité. Pour ce projet, gardez le repo **public**.

---

## 2. Ce que contient le projet

```
pokemon-price-tracker/
├── index.html                 ← page du dashboard
├── assets/
│   ├── css/style.css          ← style (thème sombre "carte holo / terminal")
│   └── js/app.js              ← fetch + calcul KPIs + rendu (À CONFIGURER : GH_USER)
├── data/
│   └── prices.json            ← LA donnée ; écrite par le robot, lue par le front
├── scripts/
│   └── monitor.js             ← le robot "pokemon-monitor" (Node, sans dépendance)
├── .github/workflows/
│   └── monitor.yml            ← planifie et exécute le robot, commit le résultat
├── package.json
└── .gitignore
```

Deux fichiers seulement sont à toucher pour démarrer :
1. **`assets/js/app.js`** → mettre votre pseudo GitHub dans `GH_USER`.
2. **`scripts/monitor.js`** → la liste `PRODUCTS` (ce que vous voulez suivre).

---

## 3. La « base de données » : `data/prices.json`

Il n'y a pas de vraie base. La donnée est un seul fichier JSON, versionné dans
Git — ce qui donne gratuitement l'historique, les sauvegardes et un diff lisible
à chaque collecte. Schéma :

```jsonc
{
  "schema_version": 1,
  "last_updated": "2026-06-22T03:00:00Z",  // ISO, écrit par le robot
  "products": [
    {
      "id": "sv11b-display-jp",     // identifiant stable (slug) — clé d'auto-détection
      "name": "SV11B — Display (JP)",
      "set": "SV11B",
      "region": "JP",
      "currency": "JPY",            // pilote le formatage (¥ / € plus tard)
      "source": "rakuten",
      "history": [                  // série temporelle, un point par jour
        { "date": "2026-06-20", "price": 12480 },
        { "date": "2026-06-22", "price": 12390 }
      ]
    }
  ]
}
```

**Auto-détection des nouveaux produits :** le front ne contient aucune liste de
produits en dur. Il parcourt `products[]` et affiche une carte par entrée. Le
jour où un nouvel `id` apparaît dans le JSON, sa carte apparaît toute seule.

---

## 4. La source des prix (le point le plus important)

Le robot doit récupérer un prix quelque part. Pour le marché **japonais**, la
voie propre et durable est l'**API officielle Rakuten Ichiba** :

- Gratuite, avec un simple `applicationId`.
- Légale et stable (contrairement au scraping qui casse au moindre changement de
  HTML et peut faire bannir l'IP des runners GitHub).
- Renvoie de vrais prix d'annonces ; le robot prend la **médiane** des résultats
  pour lisser les valeurs aberrantes (lots, accessoires, annonces gonflées).

**Obtenir la clé :**
1. Aller sur <https://webservice.rakuten.co.jp/> et se créer un compte Rakuten.
2. Créer une « application » → récupérer l'`applicationId`.
3. Le garder de côté pour l'étape 6 (secret du repo).

> **Alternative — le scraping :** techniquement possible (Mercari JP, Yahoo
> Auctions JP, snkrdunk…), mais : souvent contraire aux CGU des sites, fragile,
> et les IP des serveurs GitHub se font régulièrement bloquer. Si vous y allez,
> respectez `robots.txt`, espacez les requêtes, et attendez-vous à de la
> maintenance. Le code est prévu pour brancher d'autres sources via le système
> d'« adapters » (voir `scripts/monitor.js`), donc vous pourrez toujours en
> ajouter un plus tard.

Pour **tester tout le pipeline sans clé**, l'adapter `sample` génère une petite
variation autour du dernier prix : pratique pour vérifier que collecte → commit →
affichage fonctionne avant de brancher la vraie source.

---

## 5. Créer le repo et y mettre les fichiers

1. Sur GitHub : **New repository** → nom `pokemon-price-tracker` → **Public** →
   *Create*.
2. En local, soit vous décompressez l'archive fournie, soit vous clonez le repo
   vide et y copiez les fichiers :

```bash
git clone https://github.com/VOTRE-PSEUDO/pokemon-price-tracker.git
cd pokemon-price-tracker
# … copiez ici tous les fichiers du projet …
git add .
git commit -m "feat: initial scaffold"
git push origin main
```

---

## 6. Brancher la clé Rakuten (secret du repo)

Le secret n'est jamais écrit dans le code ni dans le JSON. Il vit dans les
réglages du repo et n'est injecté qu'au moment de l'exécution.

- Repo → **Settings → Secrets and variables → Actions → New repository secret**
- Name : `RAKUTEN_APP_ID`
- Value : votre `applicationId`
- *Add secret*

Le workflow le passe au script via `env: RAKUTEN_APP_ID: ${{ secrets.RAKUTEN_APP_ID }}`.

---

## 7. Le robot GitHub Actions

Le fichier `.github/workflows/monitor.yml` est déjà prêt. Trois points à
comprendre :

- **`permissions: contents: write`** : indispensable pour que le job puisse
  committer `data/prices.json` (sinon « permission denied » au push).
- **`schedule: cron "0 3 * * *"`** : exécution quotidienne à 03:00 **UTC**. Le
  cron Actions est toujours en UTC et peut être décalé de quelques minutes selon
  la charge GitHub — c'est attendu.
- **L'étape de commit** ne committe que s'il y a un diff (`git diff --staged
  --quiet`), donc pas de commit vide les jours sans variation. Comme le commit
  est fait avec le `GITHUB_TOKEN` par défaut, il ne redéclenche pas d'autres
  workflows : pas de boucle infinie.

**Premier remplissage (à la main) :** repo → onglet **Actions** → workflow
*pokemon-monitor* → **Run workflow**. Au bout d'une minute, un commit
`chore(data): maj prix …` doit apparaître et `data/prices.json` se remplir.

> **À savoir :** sur un repo public, GitHub **désactive les workflows planifiés
> après 60 jours sans activité**. Un `workflow_dispatch` manuel ou n'importe quel
> commit relance le compteur. Pour un suivi de prix qui commit tous les jours,
> vous ne tomberez jamais dedans.

---

## 8. Configurer le front

Ouvrez `assets/js/app.js` et remplacez le pseudo en haut du fichier :

```js
const GH_USER = "VOTRE-PSEUDO";       // ← votre identifiant GitHub
const GH_REPO = "pokemon-price-tracker";
const GH_BRANCH = "main";
```

L'URL de données est reconstruite automatiquement à partir de ces trois valeurs,
avec un paramètre anti-cache (`?t=timestamp`) pour toujours lire la dernière
version. Commitez puis poussez.

---

## 9. Activer GitHub Pages

- Repo → **Settings → Pages**
- **Source** : *Deploy from a branch*
- **Branch** : `main` / `/ (root)` → **Save**
- Au bout d'une minute, l'URL s'affiche :
  `https://VOTRE-PSEUDO.github.io/pokemon-price-tracker/`

C'est tout. Le site lit la donnée via `raw.githubusercontent.com`, donc même si
Pages met un peu à se redéployer, les prix sont à jour dès que le robot a
committé.

---

## 10. Ajouter un produit à suivre

Tout se passe dans `scripts/monitor.js`, dans la liste `PRODUCTS`. Ajoutez une
entrée :

```js
{
  id: "sv12-display-jp",          // slug unique et stable
  name: "SV12 — Display (JP)",
  set: "SV12",
  region: "JP",
  currency: "JPY",
  source: "rakuten",
  query: "ポケモンカード SV12 BOX 未開封",   // mot-clé envoyé à l'API Rakuten
}
```

Au prochain run, le robot crée l'entrée dans `prices.json`, et le front affiche
la nouvelle carte automatiquement. Le `query` (mot-clé de recherche) n'est pas
publié dans le JSON : seul le suivi de prix l'est.

**Conseil de précision :** plus le `query` est spécifique (set + « BOX » +
« 未開封 » = scellé), moins vous attrapez de bruit. Vérifiez de temps en temps
qu'un produit ne capte pas des annonces de boosters à l'unité ou de lots.

---

## 11. Passer au marché FR (deuxième temps)

L'architecture est déjà prête : il suffit d'ajouter des produits avec
`region: "FR"` et `currency: "EUR"`, et un nouvel adapter pour une source EU
(Cardmarket a une API ; certains revendeurs FR aussi). Le formatage des prix
suit déjà `currency`, donc l'euro s'affichera correctement sans toucher au front.
Le bouton **FR** dans l'en-tête est là, désactivé, en attendant. La seule
évolution front à prévoir sera un filtre par région si vous voulez séparer les
deux marchés à l'écran.

---

## 12. Comment les KPIs sont calculés (côté front)

Tout est recalculé dans le navigateur à partir de l'historique, dans
`computeKpis()` :

- **Moyenne / min / max** : sur toute la série de prix du produit.
- **Variation 7j / 30j** : on prend le dernier point, on cherche le prix le plus
  récent **antérieur ou égal** à (date du dernier point − 7 j, resp. − 30 j), et
  on calcule le pourcentage. Ça reste correct même si la collecte saute un jour.
- **Tendance ↑/↓** : signe de la variation 7 j (repli sur les deux derniers
  points si l'historique est trop court).
- **KPIs globaux** : nombre de produits, variation moyenne 7 j du panier, nombre
  de hausses/baisses, date de dernière collecte.

Tant que le JSON respecte le schéma, vous n'avez jamais à toucher à ces calculs.

---

## 13. Pièges & FAQ

- **« Impossible de charger les données » sur le site** → `GH_USER` n'est pas
  renseigné dans `app.js`, ou le repo est privé. Le repo doit être public.
- **Le robot ne committe pas** → vérifiez `permissions: contents: write` dans le
  workflow et que le secret `RAKUTEN_APP_ID` existe.
- **Prix farfelus** → resserrez le `query` et/ou ajustez le garde-fou de prix
  (`p >= 3000 && p <= 200000`) dans l'adapter `rakuten`.
- **Le cron ne part pas à l'heure pile** → normal, l'ordonnanceur GitHub peut
  décaler ou regrouper les exécutions. Pour de la précision horaire, il faudrait
  un autre ordonnanceur, mais pour un prix quotidien c'est sans importance.
- **Latence d'affichage après un commit** → cache raw d'environ 5 min ; le
  paramètre `?t=` aide, mais quelques minutes de délai restent possibles.
- **Limites Rakuten** → l'API est limitée en débit (de l'ordre de 1 req/s) ;
  avec quelques produits par jour, vous êtes très loin du plafond.

---

## 14. Roadmap possible

- Vue détaillée d'un produit (plein écran, période ajustable).
- Filtre par région une fois le FR ajouté.
- Alertes (ex. variation > X % sur 7 j) via une notification dans le workflow.
- Export CSV depuis le front.
- Comparateur multi-produits sur un même graphe.

---

### Récapitulatif express

1. Repo **public** `pokemon-price-tracker`, push des fichiers.
2. Secret `RAKUTEN_APP_ID` (Settings → Secrets → Actions).
3. `GH_USER` renseigné dans `assets/js/app.js`.
4. **Actions → Run workflow** pour le premier remplissage.
5. **Settings → Pages** → branche `main` / root.
6. Ouvrir `https://VOTRE-PSEUDO.github.io/pokemon-price-tracker/`.
7. Pour suivre un produit de plus : une entrée dans `PRODUCTS` (monitor.js).

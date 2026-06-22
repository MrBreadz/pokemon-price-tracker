#!/usr/bin/env node
/**
 * pokemon-monitor
 * -----------------------------------------------------------------------------
 * Lit data/prices.json, récupère le prix courant de chaque produit suivi,
 * ajoute (ou met à jour) le point du jour dans l'historique, puis réécrit le
 * fichier. Le workflow GitHub Actions commit le diff s'il y en a un.
 *
 * Aucune dépendance externe : Node 20+ fournit fetch() en global.
 *
 * Pour ajouter un produit à suivre : ajoutez une entrée dans PRODUCTS ci-dessous.
 * Le front (pokemon-price-tracker) détectera automatiquement le nouveau produit
 * dès qu'il apparaît dans prices.json.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "prices.json");

/* -------------------------------------------------------------------------- */
/*  1. Produits suivis — la seule chose à éditer pour ajouter/retirer un suivi */
/* -------------------------------------------------------------------------- */
const PRODUCTS = [
  {
    id: "sv11b-display-jp",
    name: "SV11B — Display (JP)",
    set: "SV11B",
    region: "JP",
    currency: "JPY",
    source: "rakuten",
    // Mot-clé envoyé à l'API Rakuten. Soyez précis pour éviter le bruit.
    query: "ポケモンカード SV11B ブラックボルト BOX 未開封",
  },
  {
    id: "sv11w-display-jp",
    name: "SV11W — Display (JP)",
    set: "SV11W",
    region: "JP",
    currency: "JPY",
    source: "rakuten",
    query: "ポケモンカード SV11W ホワイトフレア BOX 未開封",
  },
];

/* -------------------------------------------------------------------------- */
/*  2. Adapters — une fonction par source. Renvoie un nombre (prix) ou null.   */
/* -------------------------------------------------------------------------- */
const adapters = {
  /**
   * Rakuten Ichiba Item Search API (officielle, gratuite avec un applicationId).
   * Doc : https://webservice.rakuten.co.jp/documentation/ichiba-item-search
   * On prend la MÉDIANE des prix des résultats pour lisser les annonces aberrantes.
   */
  async rakuten(product) {
    const appId = process.env.RAKUTEN_APP_ID;
    if (!appId) throw new Error("RAKUTEN_APP_ID manquant (secret du repo).");

    const url = new URL(
      "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601"
    );
    url.searchParams.set("applicationId", appId);
    url.searchParams.set("keyword", product.query);
    url.searchParams.set("hits", "30");
    url.searchParams.set("sort", "+itemPrice"); // du moins cher au plus cher
    url.searchParams.set("availability", "1"); // en stock uniquement
    url.searchParams.set("format", "json");

    const res = await fetch(url, { headers: { "User-Agent": "pokemon-monitor" } });
    if (!res.ok) throw new Error(`Rakuten HTTP ${res.status}`);
    const data = await res.json();

    const prices = (data.Items || [])
      .map((wrap) => wrap.Item?.itemPrice)
      .filter((p) => typeof p === "number" && p > 0)
      // garde-fou : on écarte les accessoires/sleeves bon marché et les lots
      .filter((p) => p >= 3000 && p <= 200000);

    return median(prices);
  },

  /**
   * Adapter de secours pour tester le pipeline sans clé API.
   * Génère une petite variation autour du dernier prix connu.
   */
  async sample(product, lastPrice) {
    const base = lastPrice ?? 10000;
    const drift = Math.round((Math.random() - 0.5) * base * 0.03);
    return Math.max(1000, base + drift);
  },
};

/* -------------------------------------------------------------------------- */
/*  3. Helpers                                                                 */
/* -------------------------------------------------------------------------- */
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

async function loadData() {
  try {
    return JSON.parse(await readFile(DATA_PATH, "utf8"));
  } catch {
    return { schema_version: 1, last_updated: null, products: [] };
  }
}

/* -------------------------------------------------------------------------- */
/*  4. Main                                                                    */
/* -------------------------------------------------------------------------- */
async function main() {
  const data = await loadData();
  const byId = new Map(data.products.map((p) => [p.id, p]));
  const date = today();

  for (const cfg of PRODUCTS) {
    let entry = byId.get(cfg.id);
    if (!entry) {
      // Nouveau produit : on l'initialise. Le front le détectera tout seul.
      entry = { ...cfg, history: [] };
      delete entry.query; // on ne publie pas le mot-clé de scraping
      data.products.push(entry);
      byId.set(cfg.id, entry);
      console.log(`+ nouveau produit suivi : ${cfg.id}`);
    }

    const lastPrice = entry.history.at(-1)?.price ?? null;
    let price = null;
    try {
      price = await adapters[cfg.source](cfg, lastPrice);
    } catch (err) {
      console.warn(`! ${cfg.id} — échec récupération : ${err.message}`);
      continue; // on n'écrit pas de point bidon ce jour-là
    }
    if (price == null) {
      console.warn(`! ${cfg.id} — aucun prix exploitable, ignoré.`);
      continue;
    }

    const existing = entry.history.find((h) => h.date === date);
    if (existing) {
      existing.price = price; // ré-exécution le même jour : on écrase
    } else {
      entry.history.push({ date, price });
    }
    console.log(`= ${cfg.id} : ${price} ${cfg.currency}`);
  }

  data.last_updated = new Date().toISOString();
  await writeFile(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`\nÉcrit ${DATA_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

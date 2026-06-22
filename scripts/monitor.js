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
 * Pour ajouter un produit : ajoutez une entrée dans PRODUCTS ci-dessous.
 * Le front détectera automatiquement le nouveau produit dans prices.json.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import https from "node:https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "prices.json");

// Rakuten exige un en-tête Referer correspondant à l'un de vos « Allowed websites ».
// Mettez ici un domaine déclaré dans votre application Rakuten.
const RAKUTEN_REFERER = "https://mrbreadz.github.io/";

/* -------------------------------------------------------------------------- */
/*  1. Produits suivis — la seule liste à éditer                              */
/* -------------------------------------------------------------------------- */
const PRODUCTS = [
  { id: "abyss-eye-jp",      name: "アビスアイ (JP)",       set: "MEGA", region: "JP", currency: "JPY", source: "rakuten", query: "ポケモンカード アビスアイ BOX 未開封" },
  { id: "ninja-spinner-jp",  name: "ニンジャスピナー (JP)", set: "MEGA", region: "JP", currency: "JPY", source: "rakuten", query: "ポケモンカード ニンジャスピナー BOX 未開封" },
  { id: "muniki-zero-jp",    name: "ムニキスゼロ (JP)",     set: "MEGA", region: "JP", currency: "JPY", source: "rakuten", query: "ポケモンカード ムニキスゼロ BOX 未開封" },
  { id: "mega-dream-ex-jp",  name: "MEGAドリームex (JP)",   set: "MEGA", region: "JP", currency: "JPY", source: "rakuten", query: "ポケモンカード MEGAドリームex BOX 未開封" },
  { id: "inferno-x-jp",      name: "インフェルノX (JP)",    set: "MEGA", region: "JP", currency: "JPY", source: "rakuten", query: "ポケモンカード インフェルノX BOX 未開封" },
  { id: "mega-brave-jp",     name: "メガブレイブ (JP)",     set: "MEGA", region: "JP", currency: "JPY", source: "rakuten", query: "ポケモンカード メガブレイブ BOX 未開封" },
  { id: "mega-symphonia-jp", name: "メガシンフォニア (JP)", set: "MEGA", region: "JP", currency: "JPY", source: "rakuten", query: "ポケモンカード メガシンフォニア BOX 未開封" },
  { id: "black-bolt-jp",     name: "ブラックボルト (JP)",   set: "S&V",  region: "JP", currency: "JPY", source: "rakuten", query: "ポケモンカード ブラックボルト BOX 未開封" },
  { id: "white-flare-jp",    name: "ホワイトフレア (JP)",   set: "S&V",  region: "JP", currency: "JPY", source: "rakuten", query: "ポケモンカード ホワイトフレア BOX 未開封" },
  { id: "rocket-glory-jp",   name: "ロケット団の栄光 (JP)", set: "S&V",  region: "JP", currency: "JPY", source: "rakuten", query: "ポケモンカード ロケット団の栄光 BOX 未開封" },
];

/* -------------------------------------------------------------------------- */
/*  2. Adapters — une fonction par source. Renvoie un nombre (prix) ou null.   */
/* -------------------------------------------------------------------------- */
const adapters = {
  // Rakuten Ichiba Item Search API (officielle, gratuite avec applicationId).
  // https://webservice.rakuten.co.jp/documentation/ichiba-item-search
  // On prend la MÉDIANE des prix pour lisser les annonces aberrantes.
  async rakuten(product) {
    const appId = process.env.RAKUTEN_APP_ID;
    const accessKey = process.env.RAKUTEN_ACCESS_KEY;
    if (!appId || !accessKey)
      throw new Error("RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY manquant (secrets du repo).");

    // Nouvelle API Rakuten (depuis 2026) : domaine openapi.rakuten.co.jp,
    // version 20260401, auth = applicationId + accessKey (les deux obligatoires).
    const url = new URL(
      "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401"
    );
    url.searchParams.set("applicationId", appId);
    url.searchParams.set("keyword", product.query);
    url.searchParams.set("hits", "30");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatVersion", "2");

    // accessKey + Referer en en-têtes. On utilise node:https (et non fetch) car
    // fetch supprime silencieusement l'en-tête Referer (en-tête « interdit »).
    const { status, body } = await httpsGet(url.toString(), {
      "User-Agent": "pokemon-monitor",
      accessKey,
      Referer: RAKUTEN_REFERER,
    });
    if (status !== 200) throw new Error(`Rakuten HTTP ${status} — ${body.slice(0, 300)}`);
    const data = JSON.parse(body);

    // robuste aux variations de format (formatVersion 1/2, casse Items/items)
    const rows = data.items || data.Items || [];
    const prices = rows
      .map((row) => row.itemPrice ?? row.item?.itemPrice ?? row.Item?.itemPrice)
      .filter((p) => typeof p === "number" && p > 0)
      .filter((p) => p >= 3000 && p <= 200000);

    return median(prices);
  },

  // Adapter de secours pour tester sans clé API.
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
  return new Date().toISOString().slice(0, 10);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET HTTPS avec en-têtes arbitraires (Referer inclus, contrairement à fetch).
function httpsGet(urlString, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(urlString, { headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("timeout")));
  });
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
      entry = { ...cfg, history: [] };
      delete entry.query;
      data.products.push(entry);
      byId.set(cfg.id, entry);
      console.log(`+ nouveau produit suivi : ${cfg.id}`);
    }

    const lastPrice = entry.history.at(-1)?.price ?? null;
    let price = null;
    if (cfg.source !== "sample") await sleep(1500); // ~1 req/s : on reste sous la limite Rakuten
    try {
      price = await adapters[cfg.source](cfg, lastPrice);
    } catch (err) {
      console.warn(`! ${cfg.id} — échec récupération : ${err.message}`);
      continue;
    }
    if (price == null) {
      console.warn(`! ${cfg.id} — aucun prix exploitable, ignoré.`);
      continue;
    }

    const existing = entry.history.find((h) => h.date === date);
    if (existing) existing.price = price;
    else entry.history.push({ date, price });
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

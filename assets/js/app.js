/* ==========================================================================
 * PokéIndex — front
 * Lit data/prices.json via raw.githubusercontent.com (Architecture Option A),
 * calcule les KPIs et affiche un produit par carte. Tout est piloté par les
 * données : un nouveau produit dans le JSON apparaît automatiquement.
 * ========================================================================== */

/* >>> À PERSONNALISER : remplacez VOTRE-PSEUDO par votre identifiant GitHub <<<
 * Branche "main", fichier data/prices.json. raw.githubusercontent.com envoie
 * des en-têtes CORS permissifs, donc le fetch navigateur fonctionne. */
const GH_USER = "VOTRE-PSEUDO";
const GH_REPO = "pokemon-price-tracker";
const GH_BRANCH = "main";
const DATA_URL = `https://raw.githubusercontent.com/${GH_USER}/${GH_REPO}/${GH_BRANCH}/data/prices.json`;

/* -------------------------------------------------------------------------- */
/*  Helpers de calcul                                                         */
/* -------------------------------------------------------------------------- */
const sortAsc = (h) => [...h].sort((a, b) => a.date.localeCompare(b.date));

function priceOnOrBefore(history, isoDate) {
  // history trié asc ; renvoie le dernier point dont la date <= isoDate
  let found = null;
  for (const p of history) {
    if (p.date <= isoDate) found = p;
    else break;
  }
  return found;
}

function shiftDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function pct(curr, prev) {
  if (prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function computeKpis(product) {
  const h = sortAsc(product.history);
  const prices = h.map((p) => p.price);
  const latest = h.at(-1) ?? null;
  if (!latest) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

  const var7 = (() => {
    const ref = priceOnOrBefore(h, shiftDays(latest.date, 7));
    return ref ? pct(latest.price, ref.price) : null;
  })();
  const var30 = (() => {
    const ref = priceOnOrBefore(h, shiftDays(latest.date, 30));
    return ref ? pct(latest.price, ref.price) : null;
  })();

  // tendance : signe de la variation 7j, sinon comparaison des 2 derniers points
  let trend = 0;
  if (var7 != null) trend = Math.sign(var7);
  else if (h.length >= 2) trend = Math.sign(latest.price - h.at(-2).price);

  return { latest, min, max, avg, var7, var30, trend, history: h };
}

/* -------------------------------------------------------------------------- */
/*  Formatage                                                                 */
/* -------------------------------------------------------------------------- */
function fmtPrice(value, currency) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(value);
}
function fmtPct(v) {
  if (v == null) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(1)}%`;
}
const trendClass = (t) => (t > 0 ? "up" : t < 0 ? "down" : "flat");
const trendArrow = (t) => (t > 0 ? "▲" : t < 0 ? "▼" : "—");

/* -------------------------------------------------------------------------- */
/*  Rendu                                                                     */
/* -------------------------------------------------------------------------- */
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function renderGlobal(products, kpisList, lastUpdated) {
  const root = document.getElementById("global-kpis");
  const var7s = kpisList.map((k) => k.var7).filter((v) => v != null);
  const avgVar7 = var7s.length
    ? var7s.reduce((a, b) => a + b, 0) / var7s.length
    : null;
  const up = kpisList.filter((k) => k.trend > 0).length;
  const down = kpisList.filter((k) => k.trend < 0).length;

  const tiles = [
    { label: "Produits suivis", value: products.length, sub: "région JP" },
    {
      label: "Variation moy. 7j",
      value: fmtPct(avgVar7),
      sub: "moyenne du panier",
      cls: trendClass(avgVar7 ?? 0),
    },
    { label: "Hausses / Baisses", value: `${up} / ${down}`, sub: "sur 7 jours" },
    {
      label: "Dernière collecte",
      value: lastUpdated ? new Date(lastUpdated).toLocaleDateString("fr-FR") : "—",
      sub: lastUpdated ? new Date(lastUpdated).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "",
    },
  ];

  root.innerHTML = "";
  for (const t of tiles) {
    const tile = el("div", "kpi");
    tile.append(el("div", "kpi__label", t.label));
    const v = el("div", "kpi__value", String(t.value));
    if (t.cls) v.classList.add(`trend--${t.cls}`);
    tile.append(v);
    if (t.sub) tile.append(el("div", "kpi__sub", t.sub));
    root.append(tile);
  }
}

function renderCard(product, kpis) {
  const { latest, min, max, avg, var7, var30, trend } = kpis;
  const cur = product.currency;
  const card = el("article", "card");

  const head = el("div", "card__head");
  head.append(el("span", "card__set", product.set || product.region));
  card.append(head);

  card.append(el("h2", "card__name", product.name));

  const row = el("div", "price-row");
  row.append(el("span", "price", fmtPrice(latest.price, cur)));
  row.append(
    el("span", `trend trend--${trendClass(trend)}`, `${trendArrow(trend)} ${fmtPct(var7)}`)
  );
  card.append(row);

  const chips = el("div", "chips");
  for (const [label, v] of [["7 jours", var7], ["30 jours", var30]]) {
    const c = el("div", `chip chip--${trendClass(v ?? 0)}`);
    c.innerHTML = `<span class="chip__label">${label}</span><b>${fmtPct(v)}</b>`;
    chips.append(c);
  }
  card.append(chips);

  const box = el("div", "chart-box");
  const canvas = document.createElement("canvas");
  box.append(canvas);
  card.append(box);

  const stats = el("div", "stats");
  stats.innerHTML = `
    <span><span class="lab">Min</span><b>${fmtPrice(min, cur)}</b></span>
    <span><span class="lab">Moyenne</span><b>${fmtPrice(avg, cur)}</b></span>
    <span><span class="lab">Max</span><b>${fmtPrice(max, cur)}</b></span>`;
  card.append(stats);

  // chart différé pour que le canvas ait ses dimensions
  requestAnimationFrame(() => drawChart(canvas, kpis.history, trend));
  return card;
}

function drawChart(canvas, history, trend) {
  const color =
    trend > 0 ? "#34d399" : trend < 0 ? "#fb7185" : "#94a3b8";
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 120);
  grad.addColorStop(0, color + "33");
  grad.addColorStop(1, color + "00");

  new Chart(ctx, {
    type: "line",
    data: {
      labels: history.map((p) => p.date),
      datasets: [
        {
          data: history.map((p) => p.price),
          borderColor: color,
          backgroundColor: grad,
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: color,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          backgroundColor: "#0b0f1c",
          borderColor: "rgba(255,255,255,.12)",
          borderWidth: 1,
          padding: 10,
          titleFont: { family: "IBM Plex Mono" },
          bodyFont: { family: "IBM Plex Mono" },
          callbacks: {
            label: (c) => new Intl.NumberFormat("fr-FR").format(c.parsed.y),
          },
        },
      },
      scales: {
        x: { display: false },
        y: { display: false, grace: "8%" },
      },
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  États (erreur / vide)                                                     */
/* -------------------------------------------------------------------------- */
function showState(html) {
  document.getElementById("product-grid").innerHTML = `<div class="state">${html}</div>`;
}

/* -------------------------------------------------------------------------- */
/*  Boot                                                                      */
/* -------------------------------------------------------------------------- */
async function init() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const products = (data.products || []).filter((p) => p.history?.length);
    if (!products.length) {
      showState(
        `Aucun prix pour l'instant. Lancez le workflow <b>pokemon-monitor</b> (onglet Actions → Run workflow) pour remplir <code>data/prices.json</code>.`
      );
      document.getElementById("updated").textContent = "—";
      return;
    }

    const kpisList = products.map(computeKpis);

    renderGlobal(products, kpisList, data.last_updated);

    const grid = document.getElementById("product-grid");
    grid.innerHTML = "";
    products.forEach((p, i) => grid.append(renderCard(p, kpisList[i])));

    if (data.last_updated) {
      const d = new Date(data.last_updated);
      document.getElementById("updated").textContent =
        "maj " + d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
    }
    document.getElementById("foot-meta").textContent =
      `${products.length} produit(s) · schéma v${data.schema_version ?? 1}`;
  } catch (err) {
    showState(
      `Impossible de charger les données.<br><br>
       Vérifiez que <code>${DATA_URL}</code> est public et que <b>GH_USER</b> est bien renseigné dans <code>assets/js/app.js</code>.<br>
       <small>${err.message}</small>`
    );
  }
}

document.addEventListener("DOMContentLoaded", init);

// backtest-zinstilt.mjs — DEV-WERKZEUG (manuell ausführen, läuft nicht im Workflow).
// Frage: Sagt das Wochen-Δ des 2J-Zins-Spreads die FX-Richtung der FOLGE-Woche voraus?
// Und: Wie groß sind typische Wochen-Δs (→ sinnvoller Faktor/Deckel für den Tilt)?
//
// Datenlage keyless/gratis-key: nur für EUR/USD + USD/CAD sauber historisch machbar
//   US 2J  = FRED DGS2 (Key aus env FRED_API_KEY oder scripts/.fred-key)
//   EUR 2J = ECB Data Portal YC-Datensatz (Spot 2Y, AAA-Staatsanleihen)
//   CAD 2J = Bank of Canada Valet (BD.CDN.2YR.DQ.YLD)
//   FX     = frankfurter.dev Zeitreihe (ECB-Fixings)
// Ergebnis = grobe Kalibrierungshilfe, KEIN Beweis (2 Paare, ~2,5 Jahre, Regime-abhängig).
//
// Aufruf: node scripts/backtest-zinstilt.mjs [STARTJAHR-01-01, Default 2024-01-01]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const START = process.argv[2] || "2024-01-01";
const UA = { "User-Agent": "Mozilla/5.0 (Makro-Dashboard, privat)" };

function fredKey() {
  if (process.env.FRED_API_KEY?.trim()) return process.env.FRED_API_KEY.trim();
  try { return fs.readFileSync(path.join(ROOT, "scripts", ".fred-key"), "utf8").trim(); } catch { return null; }
}

async function holeJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url.slice(0, 80)}`);
  return res.json();
}

// ---- Tages-Serien holen: Map(YYYY-MM-DD -> Zahl) ---------------------------
async function us2y() {
  const key = fredKey();
  if (!key) throw new Error("kein FRED-Key");
  const j = await holeJson(`https://api.stlouisfed.org/fred/series/observations?series_id=DGS2&api_key=${key}&file_type=json&observation_start=${START}`);
  const m = new Map();
  for (const o of j.observations || []) if (o.value !== ".") m.set(o.date, +o.value);
  return m;
}
async function ca2y() {
  const j = await holeJson(`https://www.bankofcanada.ca/valet/observations/BD.CDN.2YR.DQ.YLD/json?start_date=${START}`);
  const m = new Map();
  for (const o of j.observations || []) { const v = o["BD.CDN.2YR.DQ.YLD"]?.v; if (v != null) m.set(o.d, +v); }
  return m;
}
async function eur2y() {
  const j = await holeJson(`https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y?startPeriod=${START}&format=jsondata`);
  const daten = Object.values(j.dataSets[0].series)[0].observations;
  const tage = j.structure.dimensions.observation[0].values.map(v => v.id);
  const m = new Map();
  for (const [idx, arr] of Object.entries(daten)) if (arr?.[0] != null) m.set(tage[+idx], +arr[0]);
  return m;
}
async function fx() {
  const j = await holeJson(`https://api.frankfurter.dev/v1/${START}..?base=EUR&symbols=USD,CAD`);
  return j.rates; // {datum: {USD, CAD}}
}

// letzter verfügbarer Wert <= datum (Serien haben Feiertagslücken)
function wertBis(map, datum) {
  for (let i = 0; i < 7; i++) {
    const d = new Date(datum + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - i);
    const k = d.toISOString().slice(0, 10);
    if (map.has(k)) return map.get(k);
  }
  return null;
}

const [US, CA, EU, FX] = await Promise.all([us2y(), ca2y(), eur2y(), fx()]);
console.log(`Serien: US ${US.size} Tage · CA ${CA.size} · EUR ${EU.size} · FX ${Object.keys(FX).length}\n`);

// alle Freitage im Zeitraum
const freitage = [];
{
  const d = new Date(START + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));
  const heute = new Date();
  while (d < heute) { freitage.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); }
}

const fxMap = new Map(Object.entries(FX).map(([d, r]) => [d, r]));
const fxBis = (datum, ccy) => { const r = wertBis(fxMap, datum); return r ? r[ccy] : null; };

const TESTS = [
  { paar: "EUR/USD", spread: f => { const e = wertBis(EU, f), u = wertBis(US, f); return e != null && u != null ? e - u : null; },
    preis: f => fxBis(f, "USD") },                                    // USD je EUR
  { paar: "USD/CAD", spread: f => { const u = wertBis(US, f), c = wertBis(CA, f); return u != null && c != null ? u - c : null; },
    preis: f => { const usd = fxBis(f, "USD"), cad = fxBis(f, "CAD"); return usd && cad ? cad / usd : null; } },
];

for (const t of TESTS) {
  const zeilen = [];
  for (let i = 1; i < freitage.length - 1; i++) {
    const dS = t.spread(freitage[i]) - t.spread(freitage[i - 1]);            // Signal: Spread-Δ diese Woche
    const move = (t.preis(freitage[i + 1]) - t.preis(freitage[i])) / t.preis(freitage[i]) * 100; // Folge-Woche
    if (!Number.isFinite(dS) || !Number.isFinite(move)) continue;
    zeilen.push({ dS, move });
  }
  const mitSignal = zeilen.filter(z => Math.abs(z.dS) >= 0.02);              // Mini-Rauschen raus
  const treffer = mitSignal.filter(z => Math.sign(z.dS) === Math.sign(z.move)).length;
  const deltas = zeilen.map(z => Math.abs(z.dS)).sort((a, b) => a - b);
  const q = p => deltas[Math.floor(deltas.length * p)] ?? null;
  // Korrelation Signal -> Folgebewegung
  const mx = zeilen.reduce((s, z) => s + z.dS, 0) / zeilen.length;
  const my = zeilen.reduce((s, z) => s + z.move, 0) / zeilen.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (const z of zeilen) { sxy += (z.dS - mx) * (z.move - my); sxx += (z.dS - mx) ** 2; syy += (z.move - my) ** 2; }
  const korr = sxy / Math.sqrt(sxx * syy);
  // stark-Bucket: obere Hälfte der Signalstärken
  const med = q(0.5);
  const stark = zeilen.filter(z => Math.abs(z.dS) >= med);
  const trefferStark = stark.filter(z => Math.sign(z.dS) === Math.sign(z.move)).length;

  console.log(`── ${t.paar} (${zeilen.length} Wochen ab ${START}) ──`);
  console.log(`  Vorzeichen-Treffer (|Δ|≥0,02Pp): ${treffer}/${mitSignal.length} = ${Math.round(treffer / mitSignal.length * 100)}%`);
  console.log(`  Vorzeichen-Treffer (|Δ|≥Median ${med?.toFixed(2)}Pp): ${trefferStark}/${stark.length} = ${Math.round(trefferStark / stark.length * 100)}%`);
  console.log(`  Korrelation Δ-Spread → Folgewoche: ${korr.toFixed(2)}`);
  console.log(`  |Δ-Spread|-Verteilung Pp: Median ${q(0.5)?.toFixed(2)} · P75 ${q(0.75)?.toFixed(2)} · P90 ${q(0.9)?.toFixed(2)}`);
  console.log(`  → Tilt-Skala-Check: Faktor 40 macht aus P75 ${(q(0.75) * 40).toFixed(1)} Punkte (Deckel ±8)\n`);
}
console.log("Interpretation: ~50% Treffer = kein Standalone-Edge (erwartbar laut Recherche);");
console.log("der Tilt ist als NEIGUNG auf die Makro-Überzeugung gedacht. Faktor so wählen,");
console.log("dass typische Wochen (P75) NICHT schon den Deckel reißen.");

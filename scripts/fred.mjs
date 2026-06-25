// fred.mjs — Trägt echte US-Ist-Werte automatisch nach (Schluss mit manuellem
// setze-ist-wert.mjs für US-Daten). Quelle: FRED (Federal Reserve Bank of
// St. Louis), kostenlose API mit Schlüssel.
//
// Sicherheit: Der Schlüssel kommt aus der Umgebungsvariable FRED_API_KEY ODER
// aus der gitignorierten Datei scripts/.fred-key — NIE committen (Repo ist öffentlich).
// Fehlt der Schlüssel, wird FRED sauber übersprungen (kein Absturz).
//
// Aufruf direkt:  node scripts/fred.mjs            (befüllt historie.json, zeigt was)
//                 node scripts/fred.mjs --dry       (zeigt nur, schreibt nicht)
// Als Modul:      import { fuelleFredIstwerte } from "./fred.mjs"
//
// WICHTIG: FRED kann nur Events befüllen, die SCHON in historie.json stehen und
// deren actual noch leer ist. Events, die nie im Kalender-Feed waren, kann es
// nicht erfinden. Überschreibt NIE einen vorhandenen Ist-Wert.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEN = path.join(ROOT, "daten");

// ---- Schlüssel laden ------------------------------------------------------
export function ladeFredKey() {
  if (process.env.FRED_API_KEY) return process.env.FRED_API_KEY.trim();
  try {
    const k = fs.readFileSync(path.join(ROOT, "scripts", ".fred-key"), "utf8").trim();
    return k || null;
  } catch { return null; }
}

// ---- Indikator-Landkarte: Kalender-Event-Titel → FRED-Serie + Transformation
// transform: "mom" = Monatsveränderung %, "yoy" = Jahresveränderung %,
//            "level" = Wert direkt (z.B. GDP ist bereits eine %-Wachstumsrate).
// periode:   "m" = monatlich (Event erscheint im Folgemonat der Referenzperiode),
//            "q" = quartalsweise (GDP, „Final"-Schätzung ~3 Monate nach Quartalsende).
// Die Regexe sind ANKERND (^…$), damit „CPI m/m" nicht auch „Core CPI m/m" trifft.
export const INDIKATOREN = [
  { titel: /^CPI m\/m$/i,                  land: "USD", serie: "CPIAUCSL",         transform: "mom",        dez: 1, einheit: "%", periode: "m", name: "CPI m/m" },
  { titel: /^CPI y\/y$/i,                  land: "USD", serie: "CPIAUCNS",         transform: "yoy",        dez: 1, einheit: "%", periode: "m", name: "CPI y/y" },
  { titel: /^Core CPI m\/m$/i,             land: "USD", serie: "CPILFESL",         transform: "mom",        dez: 1, einheit: "%", periode: "m", name: "Core CPI m/m" },
  { titel: /^Core CPI y\/y$/i,             land: "USD", serie: "CPILFENS",         transform: "yoy",        dez: 1, einheit: "%", periode: "m", name: "Core CPI y/y" },
  { titel: /^Core PCE Price Index m\/m$/i, land: "USD", serie: "PCEPILFE",         transform: "mom",        dez: 1, einheit: "%", periode: "m", name: "Core PCE m/m" },
  { titel: /^PPI m\/m$/i,                  land: "USD", serie: "PPIFIS",           transform: "mom",        dez: 1, einheit: "%", periode: "m", name: "PPI m/m" },
  { titel: /^Core PPI m\/m$/i,             land: "USD", serie: "WPSFD49116",       transform: "mom",        dez: 1, einheit: "%", periode: "m", name: "Core PPI m/m" },  // FD less foods, energy & trade (deckt sich mit den manuell gepflegten Werten)
  { titel: /Final GDP q\/q/i,             land: "USD", serie: "A191RL1Q225SBEA",  transform: "level",      dez: 1, einheit: "%", periode: "q", name: "Final GDP q/q" },
  // Session 5: weitere US-High-Impact-Events (greifen, sobald solche Events im Feed/historie auftauchen)
  { titel: /^Non-Farm Employment Change$/i,land: "USD", serie: "PAYEMS",           transform: "mom_diff_k", dez: 0, einheit: "K", periode: "m", name: "Non-Farm Payrolls" },
  { titel: /^Unemployment Rate$/i,         land: "USD", serie: "UNRATE",           transform: "level",      dez: 1, einheit: "%", periode: "m", name: "Arbeitslosenquote" },
  { titel: /^Retail Sales m\/m$/i,         land: "USD", serie: "RSAFS",            transform: "mom",        dez: 1, einheit: "%", periode: "m", name: "Retail Sales m/m" },
  { titel: /^Core Retail Sales m\/m$/i,    land: "USD", serie: "RSFSXMV",          transform: "mom",        dez: 1, einheit: "%", periode: "m", name: "Core Retail Sales m/m" },
];

// Tages-Marktreihen von FRED für den Markt-Kompass (keyed): Inflationserwartung +
// Realzins — erstklassige USD-/Risk-Signale. Liefert Markt-Kompass-Karten-Form.
export const FRED_MARKTREIHEN = [
  { key: "INFL10", serie: "T10YIE", name: "Inflationserwartung 10J (Breakeven)" },
  { key: "REAL10", serie: "DFII10", name: "US-Realzins 10J (TIPS)" },
];

// ---- Datums-Helfer (alles in UTC, Monatserster) ---------------------------
const monatErster = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
function verschiebeMonate(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return monatErster(d);
}

// ---- FRED-Serie holen → Map(YYYY-MM-01 → Zahl) ----------------------------
async function holeSerie(serie, key) {
  const url = `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${serie}&api_key=${key}&file_type=json&observation_start=2022-01-01&sort_order=asc`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Makro-Dashboard, privat)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const map = new Map();
  for (const o of (j.observations || [])) {
    if (o.value === "." || o.value == null) continue;
    map.set(o.date.slice(0, 10), parseFloat(o.value));
  }
  return map;
}

// ---- Wert einer Serie für eine Referenzperiode berechnen ------------------
export function berechneWert(map, refDate, transform) {
  const v = map.get(refDate);
  if (v == null) return null;
  if (transform === "level") return v;
  if (transform === "mom_diff_k") {                       // absolute Monatsveränderung (z.B. NFP in Tsd.)
    const b = map.get(verschiebeMonate(refDate, -1));
    return b == null ? null : (v - b);
  }
  const basis = transform === "yoy" ? map.get(verschiebeMonate(refDate, -12))
                                    : map.get(verschiebeMonate(refDate, -1));
  if (basis == null || basis === 0) return null;
  return (v / basis - 1) * 100;
}

// Wert + Einheit formatieren wie im Kalender üblich (0.2% bzw. 175K)
function formatWert(roh, ind) {
  if (ind.einheit === "K") return `${roh > 0 ? "+" : ""}${Math.round(roh)}K`;
  return `${roh.toFixed(ind.dez)}%`;
}

// Referenzperiode aus dem Event-Datum:
// monatlich → Vormonat des Release-Monats; quartalsweise → neuestes Quartal vor dem Release.
function refDateFuerEvent(eventDatum, periode, map) {
  const release = monatErster(new Date(eventDatum));
  if (periode === "m") return verschiebeMonate(release, -1);
  // Quartal: das jüngste in der Serie vorhandene Quartal, das vor dem Release-Monat liegt
  let kandidaten = [...map.keys()].filter(d => d < release).sort();
  return kandidaten.length ? kandidaten[kandidaten.length - 1] : null;
}

// ---- Hauptfunktion: historie.events in-place befüllen ---------------------
// Gibt { gefuellt:[…], übersprungen, stand, fehler:[…] } zurück. Mutiert historie.events.
export async function fuelleFredIstwerte(historie, { dry = false, log = console.log } = {}) {
  const key = ladeFredKey();
  if (!key) { log("FRED: kein Schlüssel (FRED_API_KEY oder scripts/.fred-key) — übersprungen."); return { skipped: true, gefuellt: [] }; }

  // Serien einmalig holen (mehrere Indikatoren teilen sich teils keine Serie)
  const serienIds = [...new Set(INDIKATOREN.map(i => i.serie))];
  const serien = {};
  const fehler = [];
  await Promise.all(serienIds.map(async id => {
    try { serien[id] = await holeSerie(id, key); }
    catch (e) { fehler.push(`${id}: ${e.message}`); }
  }));

  const gefuellt = [];
  for (const ind of INDIKATOREN) {
    const map = serien[ind.serie];
    if (!map || !map.size) continue;
    for (const [id, e] of Object.entries(historie.events)) {
      if (e.land !== ind.land || (e.actual != null && e.actual !== "")) continue;
      if (!ind.titel.test(e.titel)) continue;
      const refDate = refDateFuerEvent(e.datum, ind.periode, map);
      if (!refDate) continue;
      const roh = berechneWert(map, refDate, ind.transform);
      if (roh == null) continue;                       // FRED hat die Periode noch nicht → später erneut
      const wert = formatWert(roh, ind);
      gefuellt.push({ datum: e.datum.slice(0, 10), titel: e.titel, wert, serie: ind.serie, ref: refDate });
      if (!dry) {
        e.actual = wert;
        e.notiz = `auto:FRED ${ind.serie} (Ref ${refDate})`;
      }
    }
  }
  return { skipped: false, gefuellt, fehler, stand: new Date().toISOString() };
}

// ---- FRED-Tagesreihen für den Markt-Kompass (Inflationserwartung, Realzins) -
// Liefert Objekt {INFL10:{…Karten-Form…}, REAL10:{…}} oder {} (kein Key/Fehler).
export async function holeFredMarktreihen() {
  const key = ladeFredKey();
  if (!key) return {};
  const out = {};
  await Promise.all(FRED_MARKTREIHEN.map(async r => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations` +
        `?series_id=${r.serie}&api_key=${key}&file_type=json&observation_start=2026-01-01&sort_order=asc`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Makro-Dashboard, privat)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const obs = ((await res.json()).observations || []).filter(o => o.value !== "." && o.value != null);
      if (obs.length < 2) return;
      const werte = obs.map(o => parseFloat(o.value));
      const cur = werte[werte.length - 1];
      const vorWoche = werte.length >= 6 ? werte[werte.length - 6] : werte[0];   // ~5 Handelstage
      out[r.key] = {
        name: r.name, einheit: "%", typ: "rendite",
        wert: +cur.toFixed(2),
        tagProzent: werte.length >= 2 ? +(cur - werte[werte.length - 2]).toFixed(2) : null,
        wocheProzent: +(cur - vorWoche).toFixed(2),       // %-Punkte
        renditeDelta: true,
        verlauf: werte.slice(-22).map(v => +v.toFixed(2)),
        quelle: "FRED",
      };
    } catch (e) { console.warn(`FRED-Marktreihe ${r.serie} nicht erreichbar: ${e.message}`); }
  }));
  return out;
}

// ---- Standalone-Lauf ------------------------------------------------------
if (process.argv[1]?.endsWith("fred.mjs")) {
  const dry = process.argv.includes("--dry");
  const datei = path.join(DATEN, "historie.json");
  const historie = JSON.parse(fs.readFileSync(datei, "utf8"));
  const r = await fuelleFredIstwerte(historie, { dry });
  if (r.skipped) {
    console.log("\nSo holst du den Gratis-Schlüssel: https://fredaccount.stlouisfed.org/apikeys");
    console.log("Dann entweder  setx FRED_API_KEY <KEY>  ODER  Schlüssel in scripts/.fred-key speichern.");
    process.exit(0);
  }
  if (r.fehler?.length) console.warn("FRED-Serien-Fehler:", r.fehler.join(" | "));
  if (!r.gefuellt.length) {
    console.log("FRED: keine offenen US-Ist-Werte zu befüllen (alles schon da oder FRED noch nicht aktuell).");
  } else {
    console.log(`FRED${dry ? " (DRY-RUN, nichts geschrieben)" : ""}: ${r.gefuellt.length} Ist-Wert(e) nachgetragen:`);
    for (const g of r.gefuellt) console.log(`  ${g.datum}  ${g.titel.padEnd(26)} = ${g.wert}   [${g.serie} Ref ${g.ref}]`);
    if (!dry) { fs.writeFileSync(datei, JSON.stringify(historie, null, 2)); console.log("→ historie.json gespeichert."); }
  }
}

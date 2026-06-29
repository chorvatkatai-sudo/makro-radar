// benachrichtige.mjs — schickt eine Telegram-Nachricht, sobald ein High-Impact-Event
// einen neuen Ist-Wert bekommen hat: Ist/Prognose/Vorher, höher/tiefer, was es bedeutet
// (aus lexikon.json) und welche Major-Paare dadurch bullish/bärisch werden.
//
// Aufruf:
//   node scripts/benachrichtige.mjs            -> sendet faellige Benachrichtigungen
//   node scripts/benachrichtige.mjs --dry      -> zeigt nur an, sendet nichts, merkt nichts
//   node scripts/benachrichtige.mjs --seed     -> markiert ALLE aktuell gefuellten Events als
//                                                 "schon benachrichtigt" (sauberer Erststart)
//   node scripts/benachrichtige.mjs --tage 7   -> Rueckblick-Fenster (Default 4 Tage)
//
// Telegram-Zugang via Umgebungsvariablen TELEGRAM_TOKEN + TELEGRAM_CHAT
// (im GitHub-Workflow aus den Repo-Secrets). Fehlt der Zugang -> sauber uebersprungen.
// Letzte Ausgabezeile ist immer "GESENDET:<n>" (vom Workflow ausgewertet).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEN = path.join(ROOT, "daten");
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const SEED = args.includes("--seed");
const TAGE = (() => { const i = args.indexOf("--tage"); return i >= 0 ? parseInt(args[i + 1], 10) || 4 : 4; })();

const TOKEN = process.env.TELEGRAM_TOKEN?.trim();
const CHAT = process.env.TELEGRAM_CHAT?.trim();

const FLAGGE = { USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CHF: "🇨🇭", CAD: "🇨🇦", AUD: "🇦🇺", NZD: "🇳🇿", CNY: "🇨🇳" };
const MAJORS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "USD/CHF", "NZD/USD"];

// Live-Kurse (ECB-Tageskurse, frankfurter.dev — kostenlos, kein Key). Einmal pro Lauf.
async function holeKurse() {
  try {
    const r = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,JPY,GBP,CHF,CAD,AUD,NZD");
    if (!r.ok) throw new Error("HTTP " + r.status);
    return (await r.json()).rates;
  } catch { return null; }
}
function paarKurs(paar, rates) {
  if (!rates) return null;
  const [b, q] = paar.split("/");
  const eurZu = c => c === "EUR" ? 1 : rates[c];
  const pb = eurZu(b), pq = eurZu(q);
  if (!pb || !pq) return null;
  const preis = pq / pb;
  return preis.toLocaleString("de-DE", { minimumFractionDigits: q === "JPY" ? 2 : 4, maximumFractionDigits: q === "JPY" ? 2 : 4 });
}

function leseJson(datei, fallback) {
  try { return JSON.parse(fs.readFileSync(datei, "utf8")); } catch { return fallback; }
}
const alsZahl = s => { const n = parseFloat(String(s).replace(",", ".").replace(/[^\d.\-]/g, "")); return isNaN(n) ? null : n; };

// Lexikon-Eintrag zum Event-Titel finden (sonst Fallback).
const lexikon = leseJson(path.join(ROOT, "scripts", "lexikon.json"), { begriffe: [], fallback: {} });
function findeBegriff(titel) {
  for (const b of lexikon.begriffe || []) {
    try { if (new RegExp(b.muster, "i").test(titel)) return b; } catch { /* ignorieren */ }
  }
  return lexikon.fallback || { name: titel, einfach: "", hoeher: "", niedriger: "" };
}
// Polaritaet aus dem Lexikon-Text "hoeher" ableiten: was bedeutet ein HOEHERER Wert
// fuer die Waehrung? -> true = staerker (bullish), false = schwaecher, null = unklar/neutral.
function hoeherBullish(begriff) {
  const t = (begriff.hoeher || "").toUpperCase();
  const iStark = t.indexOf("STÄRKER");
  const iSchwach = t.indexOf("SCHWÄCHER");
  if (iStark === -1 && iSchwach === -1) return null;
  if (iStark === -1) return false;
  if (iSchwach === -1) return true;
  return iStark < iSchwach;            // welche Richtung wird zuerst genannt
}

function paarWirkung(land, waehrungBull) {
  // waehrungBull: true = Waehrung wird staerker. Gibt je betroffenem Major Richtung zurueck.
  const out = [];
  for (const m of MAJORS) {
    const [base, quote] = m.split("/");
    if (base !== land && quote !== land) continue;
    // Paar steigt, wenn die BASIS staerker wird.
    const basisStaerker = base === land ? waehrungBull : !waehrungBull;
    out.push({ paar: m, hoch: basisStaerker });
  }
  return out;
}

function baueNachricht(e, rates) {
  const b = findeBegriff(e.titel);
  const flagge = FLAGGE[e.land] || "🏳️";
  const a = alsZahl(e.actual), f = alsZahl(e.prognose);
  let richtung = null;                 // true=hoeher, false=tiefer, "gleich", null=unbekannt
  if (a !== null && f !== null) richtung = a > f ? true : (a < f ? false : "gleich");
  const pol = hoeherBullish(b);
  const hatSignal = (richtung === true || richtung === false) && pol !== null;
  const waehrungBull = hatSignal ? (richtung === true ? pol : !pol) : null;

  const z = [];
  // Kopf
  z.push(`${flagge} ${b.name || e.titel}`);
  z.push(`📅 ${String(e.datum).slice(0, 10)} · ${e.land}`);
  z.push("");

  // 1) SIGNAL ganz oben (schnelles Reagieren)
  if (hatSignal) {
    const wirk = paarWirkung(e.land, waehrungBull);
    z.push("➡️ SIGNAL — wahrscheinliche Richtung:");
    for (const w of wirk) {
      const kurs = paarKurs(w.paar, rates);
      const ampel = w.hoch ? "🟢" : "🔴";
      const pfeil = w.hoch ? "↑ eher STEIGEND" : "↓ eher FALLEND";
      z.push(`${ampel} ${w.paar}${kurs ? "  " + kurs : ""}  →  ${pfeil}`);
    }
    z.push("");
  } else if (richtung === "gleich") {
    z.push("➡️ SIGNAL: wie erwartet — kaum Bewegung zu erwarten.");
    z.push("");
  }

  // 2) Die Zahlen (kurz untereinander, kein Umbruch-Chaos)
  z.push("📊 Zahlen:");
  z.push(`• Ist: ${e.actual}`);
  if (e.prognose) z.push(`• Erwartet: ${e.prognose}`);
  if (e.vorher) z.push(`• Vorher: ${e.vorher}`);
  if (richtung === true) z.push("📈 HÖHER als erwartet");
  else if (richtung === false) z.push("📉 TIEFER als erwartet");
  z.push("");

  // 3) Einschätzung + Erklärung
  if (hatSignal) {
    const wort = waehrungBull ? "stärker" : "schwächer";
    z.push(`📝 Einschätzung: Die Zahlen sprechen dafür, dass ${e.land} ${wort} wird — die Paare oben zeigen die wahrscheinliche Richtung.`);
  } else if (richtung !== "gleich") {
    z.push("📝 Faustregel: besser als Prognose = gut für die Währung, schlechter = schlecht.");
  }
  if (b.einfach) z.push(`💡 ${b.einfach}`);
  return z.join("\n");
}

async function sende(text) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text, disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// ---- Demo-Modus: fiktive Beispiele durch dieselbe Logik schicken ----
if (args.includes("--demo")) {
  const beispiele = [
    { datum: "2026-07-02T08:30:00-04:00", land: "USD", titel: "Non-Farm Employment Change", impact: "High", actual: "195K", prognose: "165K", vorher: "150K" },
    { datum: "2026-07-16T02:00:00-04:00", land: "GBP", titel: "CPI y/y", impact: "High", actual: "2.5%", prognose: "2.9%", vorher: "2.8%" },
    { datum: "2026-07-09T20:30:00-04:00", land: "AUD", titel: "Unemployment Rate", impact: "High", actual: "4.4%", prognose: "4.1%", vorher: "4.1%" },
  ];
  const ratesDemo = await holeKurse();
  let n = 0;
  for (const e of beispiele) {
    const text = "🧪 BEISPIEL (Test)\n\n" + baueNachricht(e, ratesDemo);
    if (DRY || !TOKEN || !CHAT) { console.log("--- (DRY/kein Zugang) ---\n" + text + "\n"); }
    else { try { await sende(text); n++; } catch (err) { console.warn("Senden fehlgeschlagen:", err.message); } }
  }
  console.log(`Demo: ${n} Beispiel(e) gesendet.`);
  console.log("GESENDET:0");
  process.exit(0);
}

// ---- Hauptlauf ----
const historie = leseJson(path.join(DATEN, "historie.json"), { events: {} });
const ledgerDatei = path.join(DATEN, "benachrichtigt.json");
const ledger = leseJson(ledgerDatei, { hinweis: "IDs bereits per Telegram gemeldeter Events (kein Doppel-Versand).", gesendet: [] });
const schonGesendet = new Set(ledger.gesendet);

const hatIst = e => e.impact === "High" && e.actual !== null && e.actual !== "" && e.actual !== undefined;
const eintraege = Object.entries(historie.events);

if (SEED) {
  let n = 0;
  for (const [id, e] of eintraege) if (hatIst(e) && !schonGesendet.has(id)) { ledger.gesendet.push(id); n++; }
  fs.writeFileSync(ledgerDatei, JSON.stringify(ledger, null, 2));
  console.log(`Seed: ${n} bereits gefüllte Events als "gemeldet" markiert (kein Versand).`);
  console.log("GESENDET:0");
  process.exit(0);
}

const grenze = new Date(); grenze.setDate(grenze.getDate() - TAGE);
const faellig = eintraege.filter(([id, e]) =>
  hatIst(e) && !schonGesendet.has(id) && new Date(e.datum) >= grenze && !isNaN(new Date(e.datum))
);

if (!faellig.length) { console.log("Keine neuen Event-Ergebnisse."); console.log("GESENDET:0"); process.exit(0); }

if (!DRY && (!TOKEN || !CHAT)) {
  console.log(`${faellig.length} fällige Benachrichtigung(en), aber kein Telegram-Zugang (TELEGRAM_TOKEN/CHAT) — übersprungen.`);
  console.log("GESENDET:0");
  process.exit(0);
}

const rates = await holeKurse();
let gesendet = 0;
for (const [id, e] of faellig) {
  const text = baueNachricht(e, rates);
  if (DRY) {
    console.log("--- (DRY) ---\n" + text + "\n");
  } else {
    try { await sende(text); ledger.gesendet.push(id); gesendet++; }
    catch (err) { console.warn(`Senden fehlgeschlagen für ${id}: ${err.message}`); }
  }
}
if (!DRY) fs.writeFileSync(ledgerDatei, JSON.stringify(ledger, null, 2));
console.log(`Fertig: ${gesendet} Benachrichtigung(en) gesendet${DRY ? " (DRY: 0 real)" : ""}.`);
console.log(`GESENDET:${gesendet}`);

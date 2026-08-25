// sentiment.mjs — Retail-Sentiment (Myfxbook Community Outlook): wie viel % der
// Kleinanleger sind je Paar long/short? Klassischer CONTRARIAN-Indikator: ist die
// Crowd extrem einseitig (z.B. >75% long), spricht das eher für die Gegenrichtung.
// Ergänzt die COT-Daten (Großspekulanten) um die Gegenseite (Retail).
//
// Zugang: KOSTENLOSER Myfxbook-Account nötig (kein API-Key). Login liefert einen
// Session-Token (IP-gebunden, ~1 Monat gültig) → wir loggen uns pro Lauf frisch ein
// und wieder aus (GitHub-Runner haben jedes Mal eine andere IP).
// Secrets: MYFXBOOK_EMAIL + MYFXBOOK_PASSWORD. Fehlen sie -> sauber übersprungen.
//
// Aufruf direkt:  node scripts/sentiment.mjs        (schreibt daten/sentiment.json)
// Als Modul:      import { holeSentiment } from "./sentiment.mjs"

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEN = path.join(ROOT, "daten");

const PAARE = { EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", AUDUSD: "AUD/USD",
                USDCAD: "USD/CAD", USDCHF: "USD/CHF", NZDUSD: "NZD/USD",
                EURGBP: "EUR/GBP", EURJPY: "EUR/JPY", AUDNZD: "AUD/NZD", EURCHF: "EUR/CHF" };
const UA = { "User-Agent": "Mozilla/5.0 (Makro-Dashboard, privat)" };

async function api(pfad) {
  const res = await fetch(`https://www.myfxbook.com/api/${pfad}`, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.message || "API-Fehler");
  return j;
}

export async function holeSentiment() {
  const email = process.env.MYFXBOOK_EMAIL?.trim();
  const passwort = process.env.MYFXBOOK_PASSWORD?.trim();
  if (!email || !passwort) {
    console.log("Sentiment: kein MYFXBOOK_EMAIL/MYFXBOOK_PASSWORD — übersprungen.");
    return null;
  }
  let session = null;
  try {
    session = (await api(`login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(passwort)}`)).session;
    const outlook = await api(`get-community-outlook.json?session=${encodeURIComponent(session)}`);
    const paare = {};
    for (const s of (outlook.symbols || [])) {
      const paar = PAARE[(s.name || "").toUpperCase()];
      if (!paar) continue;
      const long = +s.longPercentage, short = +s.shortPercentage;
      if (!Number.isFinite(long)) continue;
      paare[paar] = {
        longPct: Math.round(long), shortPct: Math.round(short),
        longPositionen: +s.longPositions || null, shortPositionen: +s.shortPositions || null,
        // Crowd sehr einseitig? Contrarian-Flag ab 75% auf einer Seite.
        extrem: long >= 75 ? "long" : short >= 75 ? "short" : null,
      };
    }
    if (!Object.keys(paare).length) throw new Error("keine Major-Paare in der Antwort");
    console.log(`Sentiment: ${Object.keys(paare).length} Paare (Myfxbook).`);
    return { stand: new Date().toISOString(), quelle: "Myfxbook Community Outlook (Retail-Trader)", paare };
  } catch (err) {
    console.warn(`Sentiment (Myfxbook) nicht erreichbar: ${err.message}`);
    return null;
  } finally {
    if (session) { try { await api(`logout.json?session=${encodeURIComponent(session)}`); } catch { /* egal */ } }
  }
}

// ---- Standalone-Lauf ------------------------------------------------------
if (process.argv[1]?.endsWith("sentiment.mjs")) {
  const s = await holeSentiment();
  if (s) {
    fs.writeFileSync(path.join(DATEN, "sentiment.json"), JSON.stringify(s, null, 2));
    for (const [p, v] of Object.entries(s.paare)) console.log(`${p}: ${v.longPct}% long / ${v.shortPct}% short${v.extrem ? " ⚠ " + v.extrem : ""}`);
  }
}

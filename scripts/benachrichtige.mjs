// benachrichtige.mjs — schickt eine Telegram-Nachricht, sobald ein High-Impact-Event
// einen neuen Ist-Wert bekommen hat: Zahl, Richtung, was es bedeutet (aus lexikon.json)
// und EIN konkretes Paar mit Ziel/Stop.
//
// Umbau Session 11 (2026-10-21, Wunsch des Users "zu viel INFO"):
//   - Vorher listete die Nachricht ALLE betroffenen Paare mit Ziel/Stop — bei US-Zahlen
//     7 Paare x 2 Zeilen = ~25 Zeilen. Jetzt: EIN "bestes Paar" mit Levels, die übrigen
//     als eine Zeile mit Pfeilen.
//   - Auswahl des besten Paars: erst Übereinstimmung mit der eigenen Makro-Einschätzung
//     (paare-markt.json), dann bestes Chance/Risiko-Verhältnis aus den Kurslevels.
//   - BUGFIX: Preis kam von frankfurter (EZB-Tagesfixing), Ziel/Stop aus Yahoo-Kerzen.
//     Beide Quellen driften -> im Demo stand bei AUD/USD "FALLEND" ein Ziel ÜBER dem
//     angezeigten Preis. Jetzt kommt BEIDES aus kurslevel.mjs (Yahoo), und Levels auf
//     der falschen Seite des Preises werden weggelassen statt ausgegeben.
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
import { holeKurslevel } from "./kurslevel.mjs";
import { flagge, waehrungName, findeBegriff, hoeherBullish, eventName, zahlDe, kuerze } from "./klartext.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEN = path.join(ROOT, "daten");
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const SEED = args.includes("--seed");
const TAGE = (() => { const i = args.indexOf("--tage"); return i >= 0 ? parseInt(args[i + 1], 10) || 4 : 4; })();

const TOKEN = process.env.TELEGRAM_TOKEN?.trim();
const CHAT = process.env.TELEGRAM_CHAT?.trim();

const MAJORS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "USD/CHF", "NZD/USD",
                "EUR/GBP", "EUR/JPY", "AUD/NZD", "EUR/CHF"];   // Crosses seit Session 10

const nachkomma = paar => paar.endsWith("/JPY") ? 2 : 4;
const fmtZahl = (paar, v) => v == null ? null : v.toLocaleString("de-DE", { minimumFractionDigits: nachkomma(paar), maximumFractionDigits: nachkomma(paar) });

// Kurslevel je Paar nur einmal pro Lauf holen (Cache). Liefert auch den Preis —
// Preis UND Levels kommen damit aus derselben Quelle (Yahoo-Tageskerzen).
const levelCache = new Map();
async function levelFuer(paar) {
  if (!levelCache.has(paar)) levelCache.set(paar, await holeKurslevel(paar).catch(() => null));
  return levelCache.get(paar);
}

function leseJson(datei, fallback) {
  try { return JSON.parse(fs.readFileSync(datei, "utf8")); } catch { return fallback; }
}
const alsZahl = s => { const n = parseFloat(String(s).replace(",", ".").replace(/[^\d.\-]/g, "")); return isNaN(n) ? null : n; };

// Eigene Makro-Einschätzung je Paar (Endscores wie im Dashboard) — dient nur dazu,
// unter den betroffenen Paaren jenes auszuwählen, das zur Hausmeinung passt.
const eigeneScores = (() => {
  const pm = leseJson(path.join(DATEN, "paare-markt.json"), null);
  const br = leseJson(path.join(DATEN, "briefing-aktuell.json"), null);
  const liste = (pm?.paare?.length ? pm.paare : br?.paare) || [];
  return new Map(liste.map(p => [p.paar, p.score || 0]));
})();

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

/**
 * Aus allen betroffenen Paaren EINES auswählen und mit Ziel/Stop versehen.
 * Reihenfolge der Kriterien:
 *   1. Levels müssen plausibel sein — Ziel und Stop auf der RICHTIGEN Seite des
 *      Preises. (Früher wurde das nicht geprüft; bei driftenden Quellen stand dann
 *      ein Short-Ziel über dem Einstieg.)
 *   2. Übereinstimmung mit der eigenen Makro-Einschätzung (Bestätigung schlägt
 *      Gegenwette).
 *   3. Bestes Chance/Risiko-Verhältnis (Weg zum Ziel / Weg zum Stop).
 * Gibt { beste, uebrige } zurück; beste kann null sein (dann nur die Pfeil-Liste).
 */
async function waehleBestesPaar(wirkungen) {
  const bewertet = [];
  for (const w of wirkungen) {
    const lv = await levelFuer(w.paar);
    let ziel = null, stop = null, crv = null;
    if (lv && lv.preis) {
      const z = w.hoch ? lv.widerstand : lv.support;      // Long -> Widerstand, Short -> Support
      const s = w.hoch ? lv.support : lv.widerstand;
      const zielOk = w.hoch ? z > lv.preis : z < lv.preis;
      const stopOk = w.hoch ? s < lv.preis : s > lv.preis;
      if (zielOk && stopOk) {
        ziel = z; stop = s;
        crv = Math.abs(z - lv.preis) / Math.abs(s - lv.preis);
      }
    }
    const eigener = eigeneScores.get(w.paar) || 0;
    // Stimmt unsere Hausmeinung (Score-Vorzeichen) mit der Event-Richtung überein?
    const passt = eigener !== 0 && (eigener > 0) === w.hoch;
    bewertet.push({ ...w, preis: lv?.preis ?? null, ziel, stop, crv, passt });
  }
  const handelbar = bewertet.filter(x => x.crv != null);
  handelbar.sort((a, b) => (b.passt - a.passt) || (b.crv - a.crv));
  const beste = handelbar[0] || null;
  const uebrige = bewertet.filter(x => x !== beste);
  return { beste, uebrige };
}

async function baueNachricht(e) {
  const b = findeBegriff(e.titel);
  const a = alsZahl(e.actual), f = alsZahl(e.prognose);
  let richtung = null;                 // true=hoeher, false=tiefer, "gleich", null=unbekannt
  if (a !== null && f !== null) richtung = a > f ? true : (a < f ? false : "gleich");
  const pol = hoeherBullish(b);
  const hatSignal = (richtung === true || richtung === false) && pol !== null;
  const waehrungBull = hatSignal ? (richtung === true ? pol : !pol) : null;

  const z = [];
  // 1) Kopf: Land, Klarname, die Zahl und die Abweichung — alles in zwei Zeilen.
  z.push(`${flagge(e.land)} ${eventName(e.titel)}`);
  if (e.prognose) {
    // "deutlich", wenn die Abweichung über 20 % der Prognose liegt (bei Prognose 0
    // nicht berechenbar -> dann ohne Verstärkung).
    const stark = a !== null && f !== null && f !== 0 && Math.abs(a - f) / Math.abs(f) > 0.2;
    const wort = richtung === true ? `${stark ? "deutlich " : ""}HÖHER`
      : richtung === false ? `${stark ? "deutlich " : ""}TIEFER`
      : richtung === "gleich" ? "GENAU WIE ERWARTET" : "";
    z.push(`${zahlDe(e.actual)} — erwartet ${zahlDe(e.prognose)}${wort ? ` → ${wort}` : ""}`);
  } else {
    z.push(`${zahlDe(e.actual)}${e.vorher ? ` (vorher ${zahlDe(e.vorher)})` : ""}`);
  }

  // 2) Bedeutung in einem Satz.
  if (hatSignal) {
    z.push(`${waehrungBull ? "📈" : "📉"} Heißt: ${waehrungName(e.land)} sollte ${waehrungBull ? "STÄRKER" : "SCHWÄCHER"} werden.`);
  } else if (richtung === "gleich") {
    z.push("➖ Heißt: keine Überraschung — kaum Bewegung zu erwarten.");
  } else {
    z.push("📝 Faustregel: besser als die Prognose = gut für die Währung, schlechter = schlecht.");
  }

  // 3) EIN konkretes Paar mit Ziel/Stop, Rest als Pfeil-Zeile.
  if (hatSignal) {
    const { beste, uebrige } = await waehleBestesPaar(paarWirkung(e.land, waehrungBull));
    if (beste) {
      z.push("");
      const seite = beste.hoch ? "🟢 LONG" : "🔴 SHORT";
      z.push(`${seite} ${beste.paar} (${fmtZahl(beste.paar, beste.preis)})${beste.passt ? " ✓ passt zu unserer Einschätzung" : ""}`);
      z.push(`   🎯 Ziel ${fmtZahl(beste.paar, beste.ziel)} · 🛑 Stop ${fmtZahl(beste.paar, beste.stop)}`);
    }
    if (uebrige.length) {
      z.push("");
      z.push(`Auch betroffen: ${uebrige.map(w => `${w.paar} ${w.hoch ? "↑" : "↓"}`).join(" · ")}`);
    }
  }

  // 4) Erklärung — gekürzt, der volle Text steht im Dashboard-Lexikon.
  if (b.einfach) {
    z.push("");
    z.push(`💡 ${kuerze(b.einfach, 150)}`);
  }
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
  let n = 0;
  for (const e of beispiele) {
    const text = "🧪 BEISPIEL (Test)\n\n" + await baueNachricht(e);
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

let gesendet = 0;
for (const [id, e] of faellig) {
  const text = await baueNachricht(e);
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

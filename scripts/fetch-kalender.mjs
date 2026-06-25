// fetch-kalender.mjs — Holt den ForexFactory-Wochenkalender, archiviert ihn
// dauerhaft in daten/ (unser Gedächtnis) und baut dashboard/data.js neu.
//
// Aufruf:   node scripts/fetch-kalender.mjs           (holt frische Daten)
//           node scripts/fetch-kalender.mjs --lokal   (nur Dashboard neu bauen, ohne Internet)
//
// Quellen:
//  1) ForexFactory:  https://nfs.faireconomy.media/ff_calendar_thisweek.json
//     (aktuelle Woche; Prognose & Vorwert, keine Ist-Werte, keine nächste Woche)
//  2) TradingView:   https://economic-calendar.tradingview.com/events
//     (nächste Woche als Vorschau; liefert nach Veröffentlichung auch Ist-Werte)
// Ist-Werte werden in den Claude-Sessions in daten/historie.json nachgetragen.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { holeMarktdaten } from "./marktdaten.mjs";
import { fuelleFredIstwerte, holeFredMarktreihen } from "./fred.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEN = path.join(ROOT, "daten");
const ARCHIV = path.join(DATEN, "kalender-archiv");
const FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const NUR_LOKAL = process.argv.includes("--lokal");

fs.mkdirSync(ARCHIV, { recursive: true });

function leseJson(datei, fallback) {
  try { return JSON.parse(fs.readFileSync(datei, "utf8")); } catch { return fallback; }
}

// Eindeutiger Schlüssel pro Event – damit wir in der Historie nichts doppelt speichern
function eventId(e) {
  return `${e.date}|${e.country}|${e.title}`;
}

// Sonntag der Woche eines Events (FF-Wochen laufen So–Sa, Zeiten in New York)
function wochenStart(events) {
  const erste = events.map(e => new Date(e.date)).sort((a, b) => a - b)[0];
  const d = new Date(erste);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

async function holeFeed() {
  for (let versuch = 1; versuch <= 3; versuch++) {
    try {
      const res = await fetch(FEED_URL, { headers: { "User-Agent": "Mozilla/5.0 (Makro-Dashboard, privat)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const daten = await res.json();
      if (!Array.isArray(daten) || daten.length === 0) throw new Error("Leere Antwort");
      return daten;
    } catch (err) {
      console.warn(`Versuch ${versuch}/3 fehlgeschlagen: ${err.message}`);
      if (versuch < 3) await new Promise(r => setTimeout(r, 3000 * versuch));
    }
  }
  return null;
}

// TradingView-Kalender: nächste Woche (So–Sa nach der aktuellen FF-Woche)
async function holeNaechsteWoche(aktuelleWoche) {
  const start = new Date(aktuelleWoche + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() + 7);                 // nächster Sonntag
  const ende = new Date(start);
  ende.setUTCDate(ende.getUTCDate() + 7);
  const url = "https://economic-calendar.tradingview.com/events?from=" +
    start.toISOString() + "&to=" + ende.toISOString() +
    "&countries=US,EU,GB,JP,CH,CA,AU,NZ,CN";
  try {
    const res = await fetch(url, { headers: { "Origin": "https://www.tradingview.com", "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rohdaten = (await res.json()).result || [];
    const impactMap = { 1: "High", 0: "Medium", "-1": "Low" };
    const wert = e => (v => v === null || v === undefined ? "" :
      String(v) + (e.unit === "%" ? "%" : e.unit ? " " + e.unit : ""));
    return rohdaten.map(e => ({
      date: e.date,
      country: e.currency || e.country,
      title: e.title,
      impact: impactMap[e.importance] || "Low",
      forecast: wert(e)(e.forecast),
      previous: wert(e)(e.previous),
      actual: wert(e)(e.actual) || null,
      quelle: "tradingview"
    }));
  } catch (err) {
    console.warn(`Nächste Woche (TradingView) nicht erreichbar: ${err.message}`);
    return [];
  }
}

function neuestesArchiv() {
  const dateien = fs.readdirSync(ARCHIV).filter(f => f.startsWith("woche-")).sort();
  if (dateien.length === 0) return null;
  return leseJson(path.join(ARCHIV, dateien[dateien.length - 1]), null);
}

// ---------------------------------------------------------------- Hauptlauf
let feed = null;
if (!NUR_LOKAL) feed = await holeFeed();
if (!feed) {
  feed = neuestesArchiv();
  if (!feed) { console.error("FEHLER: Kein Internet und kein Archiv vorhanden."); process.exit(1); }
  console.log(NUR_LOKAL ? "Lokalmodus: nutze letztes Archiv." : "WARNUNG: Feed nicht erreichbar – nutze letztes Archiv.");
}

// 1) Rohdaten archivieren (eine Datei pro Woche, wird bei jedem Lauf aktualisiert)
const woche = wochenStart(feed);
fs.writeFileSync(path.join(ARCHIV, `woche-${woche}.json`), JSON.stringify(feed, null, 2));

// 2) Historie pflegen: jedes Event dauerhaft speichern, Ist-Werte NIE überschreiben
const historieDatei = path.join(DATEN, "historie.json");
const historie = leseJson(historieDatei, { hinweis: "Dauerhaftes Gedächtnis aller Kalender-Events. 'actual' wird in Claude-Sessions nachgetragen.", events: {} });
let neue = 0;
for (const e of feed) {
  const id = eventId(e);
  const alt = historie.events[id] || {};
  if (!historie.events[id]) neue++;
  historie.events[id] = {
    datum: e.date, land: e.country, titel: e.title, impact: e.impact,
    prognose: e.forecast || alt.prognose || "",
    vorher: e.previous || alt.vorher || "",
    actual: alt.actual ?? null,            // Ist-Wert bleibt erhalten
    notiz: alt.notiz ?? null               // Platz für Lehren/Beobachtungen
  };
}
// 2b) Echte US-Ist-Werte automatisch von FRED nachtragen (nur online, nur leere
//     actual-Felder, nie überschreiben). Ohne FRED-Schlüssel: sauber übersprungen.
if (!NUR_LOKAL) {
  try {
    const fr = await fuelleFredIstwerte(historie);
    if (!fr.skipped && fr.gefuellt.length) {
      console.log(`FRED: ${fr.gefuellt.length} US-Ist-Wert(e) nachgetragen (${fr.gefuellt.map(g => g.titel + " " + g.wert).join(", ")}).`);
    }
    if (fr.fehler?.length) console.warn("FRED-Serien-Fehler:", fr.fehler.join(" | "));
  } catch (e) { console.warn("FRED-Auto-Fill fehlgeschlagen:", e.message); }
}

fs.writeFileSync(historieDatei, JSON.stringify(historie, null, 2));

// 3) Nächste Woche von TradingView holen (im Lokalmodus: letzte gespeicherte Version)
const naechsteWocheDatei = path.join(DATEN, "naechste-woche.json");
let naechsteWoche = NUR_LOKAL ? leseJson(naechsteWocheDatei, []) : await holeNaechsteWoche(woche);
if (naechsteWoche.length) fs.writeFileSync(naechsteWocheDatei, JSON.stringify(naechsteWoche, null, 2));
else naechsteWoche = leseJson(naechsteWocheDatei, []);

// 4) Dashboard-Daten bauen: Kalender + Lexikon + aktuelles Briefing + Historien-Auszug
const lexikon = leseJson(path.join(ROOT, "scripts", "lexikon.json"), { begriffe: [], waehrungen: {} });
const briefing = leseJson(path.join(DATEN, "briefing-aktuell.json"), null);

// Ist-Werte aus der Historie in die Wochen-Events zurückspielen
const events = feed.map(e => ({
  ...e,
  actual: historie.events[eventId(e)]?.actual ?? null
}));

// Kleine Historien-Statistik fürs Dashboard (nur High-Impact mit Ist-Wert)
const historieAuszug = Object.values(historie.events)
  .filter(e => e.impact === "High" && e.actual)
  .sort((a, b) => new Date(b.datum) - new Date(a.datum))
  .slice(0, 60);

// 5) Leitzinsen (Zins-Cockpit) — gepflegte Datei, nur durchreichen
const leitzinsen = leseJson(path.join(DATEN, "leitzinsen.json"), null);

// 5b) Markt-Kompass: Live-Treiber (DXY, VIX, Öl, Gold, US-Renditen) + CFTC-COT-Positionierung.
//     Online frisch holen; lokal/offline letzten Stand aus daten/marktdaten.json nutzen.
const marktdatenDatei = path.join(DATEN, "marktdaten.json");
let marktdaten = NUR_LOKAL ? null : await holeMarktdaten();
if (!NUR_LOKAL && marktdaten?.kurse) {
  const fredReihen = await holeFredMarktreihen();          // Inflationserwartung + Realzins (keyed)
  Object.assign(marktdaten.kurse, fredReihen);
}
if (marktdaten && Object.keys(marktdaten.kurse || {}).length) {
  fs.writeFileSync(marktdatenDatei, JSON.stringify(marktdaten, null, 2));
} else {
  marktdaten = leseJson(marktdatenDatei, null);
  if (marktdaten) console.log(NUR_LOKAL ? "Lokalmodus: nutze letzten Markt-Kompass." : "WARNUNG: Markt-Kompass nicht erreichbar – nutze letzten Stand.");
}

// 6) Überraschungs-Momentum je Währung: zählen, wie oft High-Impact-Daten
//    über/unter der Prognose lagen (grobe Daten-Momentum-Anzeige).
const alsZahl = s => { const n = parseFloat(String(s).replace(",", ".").replace(/[^\d.\-]/g, "")); return isNaN(n) ? null : n; };
const momentum = {};
for (const e of Object.values(historie.events)) {
  if (e.impact !== "High") continue;
  const a = alsZahl(e.actual), f = alsZahl(e.prognose);
  if (a === null || f === null) continue;
  const m = (momentum[e.land] = momentum[e.land] || { ueber: 0, unter: 0, gleich: 0, gesamt: 0 });
  m.gesamt++;
  if (a > f) m.ueber++; else if (a < f) m.unter++; else m.gleich++;
}
for (const code in momentum) momentum[code].score = momentum[code].ueber - momentum[code].unter;

// 6b) Major-Paare-Scoring mit MARKT-OVERLAY (COT + US-Zinsen).
//     Grundscore = meine Makro-Überzeugung (briefing.paare bzw. aus waehrungen).
//     Darauf zwei SICHTBARE, gedeckelte Markt-Tilts:
//       - COT: alle Majors sind USD-Crosses → genau eine COT-Währung pro Paar.
//         Netto-Anteil am Open Interest, ±10, Vorzeichen je Basis/Gegenwährung.
//       - Zinsen: Wochen-Δ der US-10J-Rendite → USD-Stärke (±8); +Risk-off-Nudge
//         bei inverser 2s10s-Kurve (Häfen JPY/CHF rauf, AUD/NZD runter).
//     Endscore = Grundscore + Tilts (gedeckelt -100..+100). Wird gezeigt UND vom
//     Selbstlernen bewertet (siehe 7a).
const MAJORS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "USD/CHF", "NZD/USD"];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const stimmungZuScore = s => s === "bullisch" ? 40 : s === "bärisch" ? -40 : 0;
const waehrungScore = code => {
  const w = (briefing?.waehrungen || {})[code];
  if (!w) return 0;
  return typeof w.score === "number" ? w.score : stimmungZuScore(w.stimmung);
};
const explizitPaar = {};
(briefing?.paare || []).forEach(p => { explizitPaar[p.paar] = p; });
const grundScore = paar => {
  const e = explizitPaar[paar];
  if (e && typeof e.score === "number") return e.score;
  const [b, q] = paar.split("/");
  return clamp(Math.round((waehrungScore(b) - waehrungScore(q)) / 2), -100, 100);
};
// COT: Währung + Vorzeichen (+1 wenn Basis, -1 wenn Gegenwährung); USD hat keine COT-Serie
const COT_PAAR = { "EUR/USD": ["EUR", 1], "GBP/USD": ["GBP", 1], "AUD/USD": ["AUD", 1], "NZD/USD": ["NZD", 1], "USD/JPY": ["JPY", -1], "USD/CAD": ["CAD", -1], "USD/CHF": ["CHF", -1] };
const cotW = marktdaten?.cot?.waehrungen || {};
const tiltCot = paar => {
  const m = COT_PAAR[paar]; if (!m) return 0;
  const c = cotW[m[0]]; if (!c || c.nettoAnteil == null) return 0;
  const daempfung = c.extrem === "extrem" ? 0.5 : 1;       // überfüllter Trade → Momentum-Signal halbieren (Reversal-Risiko)
  return Math.round(clamp(c.nettoAnteil * 0.4, -10, 10) * m[1] * daempfung);
};
const cotExtremFuer = paar => { const m = COT_PAAR[paar]; return m ? (cotW[m[0]]?.extrem || null) : null; };
// Zinsen: USD-Stärke aus Wochen-Δ der 10J-Rendite + Risk-off bei inverser Kurve
const d10 = marktdaten?.kurse?.US10Y?.wocheProzent;      // %-Punkte
const usdTilt = d10 == null ? 0 : clamp(d10 * 20, -8, 8);
const USD_SEITE = { "USD/JPY": 1, "USD/CAD": 1, "USD/CHF": 1, "EUR/USD": -1, "GBP/USD": -1, "AUD/USD": -1, "NZD/USD": -1 };
const kurveInvers = marktdaten?.kurve2s10s != null && marktdaten.kurve2s10s < 0;
const RISKOFF = { "USD/JPY": 3, "USD/CHF": 3, "AUD/USD": -3, "NZD/USD": -3 };
const tiltZins = paar => {
  let t = usdTilt * (USD_SEITE[paar] || 0);
  if (kurveInvers) t += (RISKOFF[paar] || 0);
  return Math.round(clamp(t, -10, 10));
};
const paareMarkt = MAJORS.map(paar => {
  const basis = grundScore(paar);
  const tc = tiltCot(paar), tz = tiltZins(paar);
  const score = clamp(basis + tc + tz, -100, 100);
  const e = explizitPaar[paar];
  return { paar, baseScore: basis, tiltCot: tc, tiltZins: tz, tiltGesamt: tc + tz, score, cotExtrem: cotExtremFuer(paar), treiber: e?.treiber || "" };
});
const marktOverlayAktiv = !!(marktdaten?.cot?.waehrungen || marktdaten?.kurse?.US10Y);

// 7) Prognose-Gedächtnis (Selbstlernen): je Vorhersage-Woche die Paar-Scores
//    speichern und abgeschlossene Wochen gegen die echte FX-Bewegung auswerten.
const eurZu = (ccy, r) => ccy === "EUR" ? 1 : r[ccy];
const paarPreis = (paar, r) => { const [b, q] = paar.split("/"); const pb = eurZu(b, r), pq = eurZu(q, r); return pb && pq ? pq / pb : null; };
async function holeKurse(datum) {
  const url = `https://api.frankfurter.dev/v1/${datum}?base=EUR&symbols=USD,JPY,GBP,CHF,CAD,AUD,NZD`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).rates;
}
function naechsterMontag(datumStr) {
  const d = new Date(datumStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}
const prognoseDatei = path.join(DATEN, "prognose-historie.json");
const prognoseHist = leseJson(prognoseDatei, { hinweis: "Selbstlernen: je Vorhersage-Woche die Paar-Scores + spätere Auswertung gegen die echte Kursbewegung (frankfurter.dev, ECB-Tageskurse).", wochen: [] });

// 7a) Aktuelle Briefing-Prognose als kommende Woche festhalten (einmalig je Woche).
//     Es wird der MARKT-ANGEPASSTE Endscore aufgezeichnet (nicht der reine Grund-
//     score) — so bewertet das Selbstlernen genau das, was im Dashboard steht.
if (briefing?.datum) {
  const zielWoche = naechsterMontag(briefing.datum);
  if (!prognoseHist.wochen.find(w => w.woche === zielWoche)) {
    const paare = {};
    paareMarkt.forEach(p => { if (p.score) paare[p.paar] = p.score; });   // 0/neutral nicht werten
    if (Object.keys(paare).length) prognoseHist.wochen.push({ woche: zielWoche, ausBriefing: briefing.datum, paare, mitMarktOverlay: marktOverlayAktiv, auswertung: null });
  }
}

// 7b) Abgeschlossene Wochen auswerten (nur online)
const jetztDatum = new Date();
if (!NUR_LOKAL) {
  for (const w of prognoseHist.wochen) {
    if (w.auswertung) continue;
    const freitag = new Date(w.woche + "T00:00:00Z"); freitag.setUTCDate(freitag.getUTCDate() + 4);
    if (freitag >= jetztDatum) continue;                          // Woche noch nicht vorbei
    try {
      const rStart = await holeKurse(w.woche);
      const rEnde = await holeKurse(freitag.toISOString().slice(0, 10));
      let treffer = 0, gesamt = 0; const details = {};
      for (const paar in w.paare) {
        const score = w.paare[paar];
        if (!score) continue;                                     // 0 = neutral, nicht werten
        const p0 = paarPreis(paar, rStart), p1 = paarPreis(paar, rEnde);
        if (!p0 || !p1) continue;
        const moveProzent = (p1 - p0) / p0 * 100;
        const richtig = Math.sign(moveProzent) === Math.sign(score);
        gesamt++; if (richtig) treffer++;
        details[paar] = { score, moveProzent: +moveProzent.toFixed(2), treffer: richtig };
      }
      w.auswertung = { treffer, gesamt, quote: gesamt ? Math.round(treffer / gesamt * 100) : null, details };
      console.log(`Prognose-Auswertung ${w.woche}: ${treffer}/${gesamt} richtig`);
    } catch (err) { console.warn(`Prognose-Auswertung ${w.woche} fehlgeschlagen: ${err.message}`); }
  }
}
fs.writeFileSync(prognoseDatei, JSON.stringify(prognoseHist, null, 2));

const ausgewertet = prognoseHist.wochen.filter(w => w.auswertung && w.auswertung.gesamt);
const summe = ausgewertet.reduce((s, w) => ({ t: s.t + w.auswertung.treffer, g: s.g + w.auswertung.gesamt }), { t: 0, g: 0 });

// Treffer-Quote PRO PAAR über alle ausgewerteten Wochen (Rückkopplung fürs Scoring):
// je Paar zählen wir, wie oft das Vorzeichen meines Scores zur echten Bewegung passte.
const proPaar = {};
for (const w of ausgewertet) {
  for (const paar in (w.auswertung.details || {})) {
    const d = w.auswertung.details[paar];
    const s = (proPaar[paar] = proPaar[paar] || { treffer: 0, gesamt: 0, letzte: [] });
    s.gesamt++; if (d.treffer) s.treffer++;
    s.letzte.push({ woche: w.woche, treffer: d.treffer, score: d.score, move: d.moveProzent });
  }
}
for (const paar in proPaar) {
  const s = proPaar[paar];
  s.quote = s.gesamt ? Math.round(s.treffer / s.gesamt * 100) : null;
  s.letzte = s.letzte.slice(-6);
  // Konfidenz-Stufe: erst ab genug Stichprobe aussagekräftig (sonst "duenn"/"neu")
  s.konfidenz = s.gesamt === 0 ? "neu" : s.gesamt < 3 ? "duenn"
              : s.quote >= 60 ? "hoch" : s.quote <= 40 ? "niedrig" : "mittel";
}

const prognoseQuote = {
  wochenAusgewertet: ausgewertet.length,
  treffer: summe.t, gesamt: summe.g,
  quote: summe.g ? Math.round(summe.t / summe.g * 100) : null,
  wochenErfasst: prognoseHist.wochen.length,
  proPaar,
  letzte: ausgewertet.slice(-6).map(w => ({ woche: w.woche, quote: w.auswertung.quote, treffer: w.auswertung.treffer, gesamt: w.auswertung.gesamt }))
};

const dataJs = "window.MAKRO_DATA = " + JSON.stringify({
  erstellt: new Date().toISOString(),
  wochenStart: woche,
  events,
  naechsteWoche,
  briefing,
  lexikon,
  leitzinsen,
  marktdaten,
  paareMarkt,
  momentum,
  prognoseQuote,
  historie: historieAuszug,
  anzahlGespeichert: Object.keys(historie.events).length
}, null, 1) + ";\n";

fs.writeFileSync(path.join(ROOT, "dashboard", "data.js"), dataJs);

const high = events.filter(e => e.impact === "High").length;
console.log(`OK: Woche ab ${woche} | ${events.length} Events (${high} High-Impact) | nächste Woche: ${naechsteWoche.length} Events | ${neue} neu in Historie | gesamt gespeichert: ${Object.keys(historie.events).length}`);
if (!briefing) console.log("Hinweis: daten/briefing-aktuell.json fehlt noch – Dashboard zeigt Platzhalter.");

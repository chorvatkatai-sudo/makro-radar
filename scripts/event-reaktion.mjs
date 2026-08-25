// event-reaktion.mjs — Wie reagiert eine Währung TATSÄCHLICH auf eine Datenüberraschung?
//
// Hintergrund (Session 10): Die Wochen-Prognose ist nachweislich kaum besser als ein
// Münzwurf (RECHERCHE-SIGNALE.md: Makro schlägt auf Wochenhorizont keinen Random Walk).
// Die Reaktion RUND UM EIN RELEASE ist eine andere, engere Frage — und genau dort
// handelt der User. Dieses Skript misst sie aus den eigenen Daten.
//
// WICHTIG — bewusst NICHT pro Event-Typ ausgewiesen: Es gibt maximal 3 Fälle je
// Titel (z.B. 3x "US Core CPI m/m"). Eine Aussage wie "in 3 von 3 Fällen stieg der
// Dollar" klingt konkret, ist aber statistisch wertlos und würde zu falschen Trades
// verleiten. Deshalb wird über Währung und über Kategorie AGGREGIERT, wo die
// Stichprobe trägt — und die Fallzahl steht überall dabei.
//
// Aufruf: node scripts/event-reaktion.mjs [--details]
// Schreibt daten/event-reaktion.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEN = path.join(ROOT, "daten");
const WAEHRUNGEN = ["USD", "JPY", "GBP", "CHF", "CAD", "AUD", "NZD"];   // + EUR als Basis

const leseJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };
const alsZahl = s => { const n = parseFloat(String(s).replace(",", ".").replace(/[^\d.\-]/g, "")); return isNaN(n) ? null : n; };

// ─── Polarität: Was bedeutet ein HÖHERER Wert für die Währung? ──────────────
// Gleiche Logik wie in benachrichtige.mjs (dort nicht importierbar, weil das
// Skript beim Laden Nachrichten verschicken würde) — bei Änderungen beide pflegen.
const lexikon = leseJson(path.join(ROOT, "scripts", "lexikon.json"), { begriffe: [], fallback: {} });
function findeBegriff(titel) {
  for (const b of lexikon.begriffe || []) {
    try { if (new RegExp(b.muster, "i").test(titel)) return b; } catch { /* ignorieren */ }
  }
  return lexikon.fallback || { name: titel, hoeher: "" };
}
function hoeherBullish(begriff) {
  const t = (begriff.hoeher || "").toUpperCase();
  const iStark = t.indexOf("STÄRKER"), iSchwach = t.indexOf("SCHWÄCHER");
  if (iStark === -1 && iSchwach === -1) return null;
  if (iStark === -1) return false;
  if (iSchwach === -1) return true;
  return iStark < iSchwach;
}

// ─── Kategorien (gröber als der Titel → tragfähigere Stichprobe) ────────────
const KATEGORIE = [
  [/CPI|Inflation|PCE|PPI|Preis/i, "Inflation"],
  [/Employment|Payroll|Unemployment|Jobless|Arbeitsmarkt|Claims/i, "Arbeitsmarkt"],
  [/GDP|BIP|Retail|Sales|Production|Industrial/i, "Wachstum & Konsum"],
  [/PMI|ISM|Sentiment|Confidence|Ifo|ZEW/i, "Stimmung & Umfragen"],
  [/Rate|Zins|Policy|Bank Rate|Cash Rate|Refinancing/i, "Zinsentscheid"],
];
const kategorieVon = titel => (KATEGORIE.find(([re]) => re.test(titel || "")) || [])[1] || "Sonstiges";

// ─── Kurs-Zeitreihe (ECB-Tagesfixings über frankfurter) ────────────────────
async function holeZeitreihe(von, bis) {
  const url = `https://api.frankfurter.dev/v1/${von}..${bis}?base=EUR&symbols=${WAEHRUNGEN.join(",")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`frankfurter HTTP ${res.status}`);
  return (await res.json()).rates || {};
}

// Preis einer Währung in USD (EUR-Basis umrechnen). Für USD selbst: null.
const preisInUsd = (ccy, r) => {
  if (!r) return null;
  const eurZu = c => (c === "EUR" ? 1 : r[c]);
  const usd = eurZu("USD"), c = eurZu(ccy);
  return usd && c ? usd / c : null;
};

export async function baueEventReaktion({ details = false } = {}) {
  const hist = leseJson(path.join(DATEN, "historie.json"), { events: {} });
  const events = Object.values(hist.events || {}).filter(e =>
    e && e.impact === "High" && e.actual != null && e.actual !== "" && e.prognose != null && e.prognose !== "" && e.datum);
  if (!events.length) return null;

  const daten = events.map(e => String(e.datum).slice(0, 10)).sort();
  // Puffer: ein Tag vor dem frühesten und nach dem spätesten Ereignis.
  const tagPlus = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const rates = await holeZeitreihe(tagPlus(daten[0], -5), tagPlus(daten[daten.length - 1], 5));
  const handelstage = Object.keys(rates).sort();

  // Letztes Fixing AM ODER VOR / erstes AM ODER NACH einem Datum (Wochenenden!).
  const fixVor = d => { for (let i = handelstage.length - 1; i >= 0; i--) if (handelstage[i] <= d) return handelstage[i]; return null; };
  const fixNach = d => { for (const t of handelstage) if (t >= d) return t; return null; };

  const zeilen = [];
  for (const e of events) {
    const a = alsZahl(e.actual), f = alsZahl(e.prognose);
    if (a == null || f == null) continue;
    const toleranz = Math.max(0.05, Math.abs(f) * 0.02);
    if (Math.abs(a - f) <= toleranz) continue;                  // keine Überraschung -> nichts zu messen
    const besser = a > f;                                       // Wert kam höher als erwartet
    const pol = hoeherBullish(findeBegriff(e.titel));
    if (pol === null) continue;                                 // Polarität unklar -> nicht werten
    const waehrungSollteSteigen = besser ? pol : !pol;

    const tag = String(e.datum).slice(0, 10);
    // ECB-Fixing entsteht ~14:15 Wiener Zeit. Ein Release DANACH steckt erst im
    // Fixing des Folgetags — sonst würde die Reaktion im falschen Fenster gesucht.
    // ACHTUNG: toLocaleString("de-AT", {hour}) liefert "08 Uhr" -> Number(...) = NaN,
    // wodurch JEDES Event ins Folgetagsfenster gerutscht wäre. Deshalb formatToParts.
    const wienStunde = Number(new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", hour12: false })
      .formatToParts(new Date(e.datum)).find(p => p.type === "hour").value);
    const vorDemFix = wienStunde < 14;
    const dVor = vorDemFix ? fixVor(tagPlus(tag, -1)) : fixVor(tag);
    const dNach = vorDemFix ? fixNach(tag) : fixNach(tagPlus(tag, 1));
    if (!dVor || !dNach || dVor === dNach) continue;

    // Bewegung der betroffenen Währung gegen den Dollar. Für USD-Events:
    // Dollar gegen den Korb der übrigen sieben (DXY-Ersatz).
    let move = null;
    if (e.land === "USD") {
      const einzeln = ["EUR", ...WAEHRUNGEN.filter(c => c !== "USD")]
        .map(c => { const p0 = preisInUsd(c, rates[dVor]), p1 = preisInUsd(c, rates[dNach]); return p0 && p1 ? (p1 - p0) / p0 : null; })
        .filter(v => v != null);
      if (einzeln.length) move = -100 * einzeln.reduce((s, v) => s + v, 0) / einzeln.length;
    } else {
      const p0 = preisInUsd(e.land, rates[dVor]), p1 = preisInUsd(e.land, rates[dNach]);
      if (p0 && p1) move = 100 * (p1 - p0) / p0;
    }
    if (move == null || !isFinite(move)) continue;

    zeilen.push({
      datum: tag, land: e.land, titel: e.titel, kategorie: kategorieVon(e.titel),
      konsens: e.prognose, ist: e.actual, ueberraschung: besser ? "hoeher" : "niedriger",
      erwarteteRichtung: waehrungSollteSteigen ? "stärker" : "schwächer",
      bewegungProzent: +move.toFixed(3),
      wieErwartet: waehrungSollteSteigen ? move > 0 : move < 0,
      fenster: `${dVor} → ${dNach}`,
    });
  }

  // Zweiseitiger exakter Binomial-p-Wert gegen den Münzwurf — ohne den liest sich
  // ein "3/4 = 75%" wie eine Regel, obwohl es vier Münzwürfe sind.
  const binomP = (k, n) => {
    const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };
    const pmf = i => C(n, i) * Math.pow(0.5, n);
    const schwelle = pmf(k) + 1e-12;
    let s = 0;
    for (let i = 0; i <= n; i++) if (pmf(i) <= schwelle) s += pmf(i);
    return Math.min(1, s);
  };
  const bilanz = liste => {
    if (!liste.length) return null;
    const treffer = liste.filter(z => z.wieErwartet).length;
    // Bewegung in Richtung der ERWARTETEN Reaktion (positiv = Lehrbuch, negativ = dagegen)
    const gerichtet = liste.map(z => z.erwarteteRichtung === "stärker" ? z.bewegungProzent : -z.bewegungProzent);
    const schnitt = gerichtet.reduce((s, v) => s + v, 0) / gerichtet.length;
    const absSchnitt = liste.reduce((s, z) => s + Math.abs(z.bewegungProzent), 0) / liste.length;
    const p = binomP(treffer, liste.length);
    return {
      faelle: liste.length, treffer, quote: Math.round(treffer / liste.length * 100),
      schnittGerichtet: +schnitt.toFixed(3), schnittBetrag: +absSchnitt.toFixed(3),
      pWert: +p.toFixed(3), belastbar: p < 0.05,
    };
  };
  const gruppiere = (schluessel, minFaelle) => {
    const out = {};
    for (const z of zeilen) (out[z[schluessel]] = out[z[schluessel]] || []).push(z);
    const ergebnis = {};
    for (const k in out) if (out[k].length >= minFaelle) ergebnis[k] = bilanz(out[k]);
    return ergebnis;
  };

  // ENTDUPLIZIEREN: Am selben Tag erscheinen mehrere Zahlen derselben Veröffentlichung
  // (z.B. CPI m/m, CPI y/y, Kern m/m, Kern y/y) — sie teilen sich EINE Kursbewegung.
  // Ungefiltert zählt dieselbe Beobachtung vierfach und täuscht Stichprobe vor.
  // Widersprechen sich die Zahlen eines Tages, ist das Signal uneindeutig -> raus.
  const proTag = {};
  for (const z of zeilen) (proTag[`${z.land}|${z.fenster}`] = proTag[`${z.land}|${z.fenster}`] || []).push(z);
  const bereinigt = [];
  for (const k in proTag) {
    const g = proTag[k];
    const richtungen = new Set(g.map(z => z.erwarteteRichtung));
    if (richtungen.size !== 1) continue;                 // gegenläufige Überraschungen am selben Tag
    bereinigt.push({ ...g[0], titel: g.length > 1 ? `${g[0].titel} (+${g.length - 1} weitere)` : g[0].titel });
  }
  const gruppiereBereinigt = (schluessel, minFaelle) => {
    const out = {};
    for (const z of bereinigt) (out[z[schluessel]] = out[z[schluessel]] || []).push(z);
    const ergebnis = {};
    for (const k in out) if (out[k].length >= minFaelle) ergebnis[k] = bilanz(out[k]);
    return ergebnis;
  };

  const bericht = {
    stand: new Date().toISOString(),
    hinweis: "Reagiert die Währung nach einer Datenüberraschung so, wie das Lehrbuch sagt? Fenster = letztes ECB-Fixing vor dem Release bis zum ersten danach. BEWUSST nur aggregiert (je Event-Titel gibt es höchstens 3 Fälle — das wäre keine belastbare Aussage). MASSGEBLICH ist 'gesamt' (entdupliziert): mehrere Zahlen derselben Veröffentlichung teilen sich eine Kursbewegung und dürfen nicht mehrfach zählen.",
    fenstererklaerung: "ECB-Fixing ~14:15 Wiener Zeit; Releases danach werden gegen das Fixing des Folgetags gemessen.",
    gesamt: bilanz(bereinigt),
    gesamtRoh: bilanz(zeilen),
    jeWaehrung: gruppiereBereinigt("land", 4),
    jeKategorie: gruppiereBereinigt("kategorie", 4),
    jeWaehrungRoh: gruppiere("land", 4),
    letzte: bereinigt.slice(-10).map(z => ({
      datum: z.datum, land: z.land, titel: z.titel, ueberraschung: z.ueberraschung,
      erwartet: z.erwarteteRichtung, bewegung: z.bewegungProzent, wieErwartet: z.wieErwartet,
    })),
  };

  fs.writeFileSync(path.join(DATEN, "event-reaktion.json"), JSON.stringify(bericht, null, 2));
  if (details) for (const z of zeilen) console.log(`  ${z.wieErwartet ? "✓" : "✗"} ${z.datum} ${z.land} ${z.titel} | ${z.ueberraschung} → erwartet ${z.erwarteteRichtung}, tatsächlich ${z.bewegungProzent > 0 ? "+" : ""}${z.bewegungProzent}% (${z.fenster})`);
  return bericht;
}

if (process.argv[1] && process.argv[1].endsWith("event-reaktion.mjs")) {
  const b = await baueEventReaktion({ details: process.argv.includes("--details") });
  if (!b) { console.log("Keine auswertbaren Events."); process.exit(0); }
  const z = x => x ? `${x.treffer}/${x.faelle} = ${x.quote}% · Ø ${x.schnittGerichtet > 0 ? "+" : ""}${x.schnittGerichtet}% in Erwartungsrichtung (Ø Bewegung ${x.schnittBetrag}%) · p=${x.pWert}${x.belastbar ? " BELASTBAR" : " (Zufall nicht ausgeschlossen)"}` : "—";
  console.log(`GESAMT (entdupliziert): ${z(b.gesamt)}`);
  console.log(`  roh, mit Mehrfachzaehlung:  ${z(b.gesamtRoh)}`);
  console.log("Je Währung (ab 4 Fällen):");
  for (const k in b.jeWaehrung) console.log(`  ${k}: ${z(b.jeWaehrung[k])}`);
  console.log("Je Kategorie (ab 4 Fällen):");
  for (const k in b.jeKategorie) console.log(`  ${k}: ${z(b.jeKategorie[k])}`);
}

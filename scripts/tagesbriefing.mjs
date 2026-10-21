// tagesbriefing.mjs — schickt EINMAL pro Tag einen KURZEN Telegram-Tagesüberblick.
//
// Leitlinie (Session 11, 2026-10-21, auf Wunsch des Users): ~10 Zeilen, ~600 Zeichen,
// Alltagsdeutsch statt Fachbegriffen. Vorher waren es ~3.900 Zeichen Prosa — zu viel,
// um es morgens zu lesen. Die Langfassung (Tenor, heute/gestern, alle Paare,
// Kalibrierung) steht im Dashboard; Telegram ist nur noch der Weckruf.
//
// Aufbau der Nachricht, in dieser Reihenfolge:
//   1. Kopfzeile mit Datum
//   2. 🎯 Was ist heute zu tun (ABWARTEN oder das klarste Paar in Handelsrichtung)
//   3. 💬 Warum — erster Satz/erste Sätze des Tenors, hart gekürzt
//   4. 📅 Die nächsten max. 2 High-Impact-Termine mit Wiener Uhrzeit
//   5. ⚠️ Risiko in Alltagssprache (überfüllte Positionierung, Klumpen-Wette)
//   6. 📊 Marktlage in EINER Zeile, ohne Kürzel (Dollar/Öl/Gold/Börsen-Stimmung)
//   7. 🎲 Ehrlichkeit: eine Zeile Track-Record
//   8. 👉 Link
//
// Aufruf:
//   node scripts/tagesbriefing.mjs           -> sendet, wenn ein NEUER Tagesstand vorliegt
//   node scripts/tagesbriefing.mjs --dry      -> zeigt nur an (plus Zeichenzahl)
//   node scripts/tagesbriefing.mjs --force    -> sendet auch ohne neuen Stand
//
// Doppel-Versand-Schutz: daten/tagesbriefing-gesendet.json (zuletzt gesendeter Stand).
// Ohne TELEGRAM_TOKEN/TELEGRAM_CHAT -> sauber übersprungen. Letzte Zeile: GESENDET:<0|1>.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flagge, waehrungName, landName, eventName, zahlDe, kuerze } from "./klartext.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEN = path.join(ROOT, "daten");
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const TOKEN = process.env.TELEGRAM_TOKEN?.trim();
const CHAT = process.env.TELEGRAM_CHAT?.trim();

const WIEN = "Europe/Vienna";
const LINK = "https://chorvatkatai-sudo.github.io/makro-radar/";
// Unterhalb dieser Signalstärke wird KEIN Trade genannt (|score| 10 = 55 % "Überzeugung").
// Bewusst konservativ: die gemessene Quote schwacher Signale liegt bei ~50 %.
const MIN_SIGNAL = 10;

function leseJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } }

const briefing = leseJson(path.join(DATEN, "briefing-aktuell.json"), null);
const tn = briefing?.tagesnews;
if (!tn || !tn.stand) { console.log("Kein tagesnews-Block — nichts zu senden."); console.log("GESENDET:0"); process.exit(0); }

const standTag = String(tn.stand).slice(0, 10);
const ledgerDatei = path.join(DATEN, "tagesbriefing-gesendet.json");
const ledger = leseJson(ledgerDatei, { stand: null });
if (!FORCE && !DRY && ledger.stand === standTag) {
  console.log(`Tagesüberblick für ${standTag} schon gesendet — übersprungen.`);
  console.log("GESENDET:0"); process.exit(0);
}

const markt = leseJson(path.join(DATEN, "marktdaten.json"), null);
const quote = leseJson(path.join(DATEN, "prognose-quote.json"), null);

// Markt-korrigierte Endscores bevorzugen (paare-markt.json = dieselben Werte wie im
// Dashboard). Fallback: briefing.paare.
const pmDatei = leseJson(path.join(DATEN, "paare-markt.json"), null);
const paare = ((pmDatei?.paare?.length ? pmDatei.paare : briefing.paare) || [])
  .slice().sort((a, b) => Math.abs(b.score || 0) - Math.abs(a.score || 0));

const de = (v, n) => Number(v).toLocaleString("de-DE", { minimumFractionDigits: n, maximumFractionDigits: n });
const tagWien = d => new Date(d).toLocaleDateString("sv-SE", { timeZone: WIEN });
const uhrWien = d => new Date(d).toLocaleTimeString("de-AT", { timeZone: WIEN, hour: "2-digit", minute: "2-digit" });
const heuteWien = new Date().toLocaleDateString("sv-SE", { timeZone: WIEN });

// ── 1. Kopf ────────────────────────────────────────────────────────────────
function kopfzeile() {
  const [y, m, d] = standTag.split("-");
  const kurz = (tn.wochentag || "").slice(0, 2);
  return `📰 Makro-Radar · ${kurz ? kurz + " " : ""}${d}.${m}.`;
}

// ── 2. Handlungsansage ─────────────────────────────────────────────────────
// Entweder das klarste Paar in Handelsrichtung, oder — wenn kein Score die
// MIN_SIGNAL-Schwelle reisst — ein ehrliches "ABWARTEN". Frueher stand hier
// beides gleichzeitig ("praktisch NEUTRAL" UND "klarste Signale"), was sich
// widersprach.
function handlung() {
  const z = [];
  const mitSignal = paare.filter(p => Math.abs(p.score || 0) > MIN_SIGNAL);
  if (!mitSignal.length) {
    const max = Math.max(0, ...paare.map(p => Math.abs(p.score || 0)));
    z.push(`🎯 HEUTE: ABWARTEN — kein Signal ist stark genug${max ? ` (klarstes nur ${de(50 + max / 2, 0)} %)` : ""}.`);
    return z;
  }
  const seite = p => (p.score > 0 ? "🟢 LONG" : "🔴 SHORT");
  const [erst, zweit] = mitSignal;
  z.push(`🎯 HEUTE: ${seite(erst)} ${erst.paar} — unser klarstes Signal.`);
  if (zweit) z.push(`   2. Wahl: ${seite(zweit)} ${zweit.paar}`);
  return z;
}

// ── 3. Warum (Kurzfassung des Tenors) ──────────────────────────────────────
// Der Tenor der Routine ist oft 400+ Zeichen Prosa; hier bleibt der Anfang bis
// zum letzten vollstaendigen Satz vor der Grenze.
function warum() {
  const t = kuerze(tn.tenor || "", 200);
  return t ? [`💬 Warum: ${t}`] : [];
}

// ── 4. Naechste Termine ────────────────────────────────────────────────────
function naechsteTermine(anzahl = 2) {
  const kandidaten = [];
  const archivDir = path.join(DATEN, "kalender-archiv");
  const wocheDatei = fs.existsSync(archivDir)
    ? fs.readdirSync(archivDir).filter(f => f.startsWith("woche-")).sort().pop()
    : null;
  if (wocheDatei) kandidaten.push(...(leseJson(path.join(archivDir, wocheDatei), []) || []));
  kandidaten.push(...(leseJson(path.join(DATEN, "naechste-woche.json"), { events: [] })?.events || []));
  const jetzt = Date.now();
  const kommend = kandidaten
    .filter(e => e && e.impact === "High" && e.date && new Date(e.date).getTime() > jetzt && !e.actual)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  // Mehrere Zahlen derselben Veroeffentlichung (gleiches Land + gleiche Minute)
  // buendeln, damit nicht 3x "AUD CPI" die Liste fuellt.
  const gebuendelt = [];
  for (const e of kommend) {
    const letzter = gebuendelt[gebuendelt.length - 1];
    if (letzter && letzter.country === e.country && letzter.date === e.date) continue;
    gebuendelt.push(e);
    if (gebuendelt.length >= anzahl) break;
  }
  return gebuendelt;
}

function termine() {
  const liste = naechsteTermine(2);
  if (!liste.length) return [];
  const morgenTag = new Date(Date.now() + 864e5).toLocaleDateString("sv-SE", { timeZone: WIEN });
  const z = ["", "📅 Als Nächstes:"];
  for (const t of liste) {
    const tg = tagWien(t.date);
    const wann = tg === heuteWien ? "HEUTE" : tg === morgenTag ? "MORGEN"
      : new Date(t.date).toLocaleDateString("de-AT", { timeZone: WIEN, weekday: "short" }).replace(".", "").toUpperCase();
    const fc = t.forecast ? ` (erw. ${zahlDe(t.forecast)})` : "";
    z.push(`• ${wann} ${uhrWien(t.date)} · ${flagge(t.country)} ${landName(t.country)} ${eventName(t.title)}${fc}`);
  }
  return z;
}

// ── 5. Risiko in Alltagssprache ────────────────────────────────────────────
function risiko() {
  const teile = [];
  const cot = markt?.cot?.waehrungen || markt?.cot;
  if (cot && typeof cot === "object") {
    // Ueberfuellte Positionierung: |z| >= 1,5 heisst, fast alle stehen auf einer Seite.
    const extrem = Object.entries(cot)
      .filter(([, v]) => v && typeof v.zScore === "number" && Math.abs(v.zScore) >= 1.5)
      .sort((a, b) => Math.abs(b[1].zScore) - Math.abs(a[1].zScore)).slice(0, 2);
    // Nur zusammenfassen, wenn alle in dieselbe Richtung ueberfuellt sind — sonst
    // wuerde "fallenden Euro und Pfund" bei gemischten Vorzeichen falsch sein.
    const short = extrem.filter(([, v]) => v.richtung === "short").map(([c]) => waehrungName(c));
    const lang = extrem.filter(([, v]) => v.richtung !== "short").map(([c]) => waehrungName(c));
    const undListe = a => a.length === 2 ? `${a[0]} und ${a[1]}` : a[0];
    if (short.length) teile.push(`Sehr viele wetten schon auf fallenden ${undListe(short)} — dreht es, geht es schnell nach oben`);
    if (lang.length) teile.push(`Sehr viele wetten schon auf steigenden ${undListe(lang)} — dreht es, kippt es schnell nach unten`);
  }
  // Klumpen-Warnung (Kernbefund Session 10): 7 gleichgerichtete Dollar-Paare sind
  // EINE Wette, nicht sieben.
  const usdMitScore = paare.filter(p => p.paar.includes("USD") && p.score);
  if (usdMitScore.length >= 5) {
    const richtungen = new Set(usdMitScore.map(p => (p.paar.startsWith("USD/") ? 1 : -1) * Math.sign(p.score)));
    if (richtungen.size === 1) teile.push(`alle ${usdMitScore.length} Dollar-Paare zeigen gleich — das ist EINE Wette, nicht ${usdMitScore.length}`);
  }
  return teile.length ? [`⚠️ Vorsicht: ${teile.join(". ")}.`] : [];
}

// ── 6. Marktlage in einer Zeile, ohne Kuerzel ──────────────────────────────
function marktzeile() {
  const kk = markt?.kurse;
  if (!kk) return [];
  const trend = p => p == null ? "" : p > 0.5 ? " ↑" : p < -0.5 ? " ↓" : " seitwärts";
  const teile = [];
  if (kk.DXY) teile.push(`Dollar${trend(kk.DXY.wocheProzent)}`);
  if (kk.WTI) teile.push(`Öl ${de(Math.round(kk.WTI.wert), 0)} $${trend(kk.WTI.wocheProzent)}`);
  if (kk.Gold) teile.push(`Gold ${de(Math.round(kk.Gold.wert), 0)} $${trend(kk.Gold.wocheProzent)}`);
  if (kk.VIX) {
    const v = kk.VIX.wert;
    const stimmung = v < 15 ? "sehr ruhig" : v < 20 ? "ruhig" : v < 28 ? "nervös" : "Panik";
    teile.push(`Börsen ${stimmung}`);
  }
  return teile.length ? [`📊 ${teile.join(" · ")}`] : [];
}

// ── 6b. Technik-Warnung (nur bei ANHALTENDEN Ausfällen) ────────────────────
// Gegengift gegen stille Dauerausfälle einer Datenquelle, ohne bei jeder
// Wartungspause Alarm zu schlagen: gemeldet wird erst, was seit über 24 Stunden
// besteht. (Beim Bau in Session 11 war FRED eine knappe Stunde in Wartung — eine
// sofortige Meldung hätte nur unnötig beunruhigt.)
const DAUERHAFT_AB_MS = 24 * 3600e3;
function technikWarnung() {
  const t = leseJson(path.join(DATEN, "technik-status.json"), null);
  const alt = (t?.probleme || []).filter(p =>
    p?.seit && Date.now() - new Date(p.seit).getTime() > DAUERHAFT_AB_MS);
  return alt.length ? [`🔧 Technik: ${alt.map(p => p.text).join(" · ")}`] : [];
}

// ── 7. Ehrlichkeit ─────────────────────────────────────────────────────────
// Massgeblich ist wochenWette (= Wochen-Dollar-Wetten), NICHT die Paar-Quote:
// die 7 Majors sind im Schnitt zu ~90 % dieselbe Wette, siebenfach gezaehlt.
function ehrlichkeit() {
  const WW = quote?.wochenWette;
  if (!WW?.gesamt) return [];
  const urteil = WW.vomZufallUnterscheidbar
    ? "nachweislich besser als Zufall"
    : "statistisch Münzwurf. Also klein bleiben";
  return ["", `🎲 Unsere Wochen-Calls: ${WW.treffer} von ${WW.gesamt} richtig (${WW.quote} %) = ${urteil}.`];
}

// ── Zusammensetzen ─────────────────────────────────────────────────────────
// KOPF (Handlungsansage + Warum) ist unantastbar, MITTE (Termine/Risiko/Markt)
// darf bei Überlänge von hinten gekürzt werden, FUSS (Link) bleibt immer.
const kopf = [kopfzeile(), "", ...handlung(), ...warum()];
const mitte = [...termine(), "", ...risiko(), ...marktzeile(), ...technikWarnung()];
const fuss = [...ehrlichkeit(), `👉 Alles im Detail: ${LINK}`];

const LIMIT = Number(process.env.TG_LIMIT) || 4060;
let mitteKurz = mitte.slice();
const laenge = m => [...kopf, ...m, ...fuss].join("\n").length;
while (mitteKurz.length && laenge(mitteKurz) > LIMIT) mitteKurz.pop();
const text = [...kopf, ...mitteKurz, ...fuss].join("\n").replace(/\n{3,}/g, "\n\n");

async function sende(t) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text: t, disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

if (DRY) { console.log(text); console.log(`\n[${text.length} Zeichen]`); console.log("GESENDET:0 (DRY)"); process.exit(0); }
if (!TOKEN || !CHAT) { console.log("Kein Telegram-Zugang — übersprungen."); console.log("GESENDET:0"); process.exit(0); }

try {
  await sende(text);
  fs.writeFileSync(ledgerDatei, JSON.stringify({ stand: standTag, gesendetUm: new Date().toISOString() }, null, 2));
  console.log(`Tagesüberblick für ${standTag} gesendet.`);
  console.log("GESENDET:1");
} catch (err) {
  console.warn("Senden fehlgeschlagen:", err.message);
  console.log("GESENDET:0");
}

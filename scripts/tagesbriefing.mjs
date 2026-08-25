// tagesbriefing.mjs — schickt EINMAL pro Tag einen Telegram-Tagesüberblick:
// Lage (Tenor), was heute/gestern los ist, plus Paar-Einschätzung (Prognose) als
// Bull/Bär-Liste. Quelle: daten/briefing-aktuell.json (tagesnews + paare), das die
// tägliche Cloud-Routine jeden Morgen aktualisiert.
//
// Aufruf:
//   node scripts/tagesbriefing.mjs           -> sendet, wenn ein NEUER Tagesstand vorliegt
//   node scripts/tagesbriefing.mjs --dry      -> zeigt nur an
//   node scripts/tagesbriefing.mjs --force    -> sendet auch ohne neuen Stand
//
// Doppel-Versand-Schutz: daten/tagesbriefing-gesendet.json (zuletzt gesendeter Stand).
// Ohne TELEGRAM_TOKEN/TELEGRAM_CHAT -> sauber übersprungen. Letzte Zeile: GESENDET:<0|1>.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEN = path.join(ROOT, "daten");
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const TOKEN = process.env.TELEGRAM_TOKEN?.trim();
const CHAT = process.env.TELEGRAM_CHAT?.trim();

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

const fmtDatum = s => { const [y, m, d] = standTag.split("-"); return `${d}.${m}.${y}`; };
const ampel = sc => sc > 0 ? "🟢" : sc < 0 ? "🔴" : "⚪";
const label = sc => sc > 0 ? "bullish" : sc < 0 ? "bärisch" : "neutral";
// %-Darstellung wie im Dashboard: bullPct = 50 + score/2 -> gezeigt wird die
// Wahrscheinlichkeits-Seite der Einschätzung (56% bärisch statt Score -12).
const prozent = sc => `${Math.round(50 + Math.abs(sc) / 2)}%`;
const staerke = sc => { const m = Math.abs(sc); return m === 0 ? "" : m <= 25 ? " · schwach" : m <= 50 ? " · mittel" : " · stark"; };

// Bevorzugt die Markt-korrigierten Endscores (paare-markt.json, von fetch-kalender
// direkt davor geschrieben) — dieselben Werte wie im Dashboard. Fallback: briefing.paare.
const pmDatei = leseJson(path.join(DATEN, "paare-markt.json"), null);
const paare = ((pmDatei?.paare?.length ? pmDatei.paare : briefing.paare) || [])
  .slice().sort((a, b) => Math.abs(b.score || 0) - Math.abs(a.score || 0));

// ───────────────────────────────────────────────────────────────────────────
// KURZFASSUNG ganz oben (User-Wunsch Session 10): harte Fakten in 6 Zeilen, damit
// der Rest der Nachricht optional ist. Alles hier ist aus Daten abgeleitet, nicht
// aus Prosa — Richtung, nächster Termin mit Uhrzeit, Marktlage, Risiko, Ehrlichkeit.
// ───────────────────────────────────────────────────────────────────────────
const markt = leseJson(path.join(DATEN, "marktdaten.json"), null);
const quote = leseJson(path.join(DATEN, "prognose-quote.json"), null);

const WIEN = "Europe/Vienna";
const tagWien = d => new Date(d).toLocaleDateString("sv-SE", { timeZone: WIEN });
const uhrWien = d => new Date(d).toLocaleTimeString("de-AT", { timeZone: WIEN, hour: "2-digit", minute: "2-digit" });
const heuteWien = new Date().toLocaleDateString("sv-SE", { timeZone: WIEN });

// Nächste High-Impact-Termine: aktuelle Woche, sonst nächste Woche.
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
  // Mehrere Zahlen derselben Veröffentlichung (gleiches Land + gleiche Minute)
  // zusammenfassen, damit nicht 3x "AUD CPI" die Liste füllt.
  const gebuendelt = [];
  for (const e of kommend) {
    const letzter = gebuendelt[gebuendelt.length - 1];
    if (letzter && letzter.country === e.country && letzter.date === e.date) continue;
    gebuendelt.push(e);
    if (gebuendelt.length >= anzahl) break;
  }
  return gebuendelt;
}

function baueKurzfassung() {
  const k = [];
  k.push("⚡ KURZFASSUNG");

  // 1) Dollar-Richtung + wie klar. NUR die USD-Paare zählen — die Crosses sind
  //    eigenständige Wetten und würden die Dollar-Aussage sonst verwässern.
  const usdPaare = paare.filter(p => p.paar.includes("USD"));
  if (usdPaare.length) {
    let stark = 0, schwach = 0;
    for (const p of usdPaare) {
      const usdIstBasis = p.paar.startsWith("USD/");
      const s = usdIstBasis ? Math.sign(p.score || 0) : -Math.sign(p.score || 0);
      if (s > 0) stark++; else if (s < 0) schwach++;
    }
    const maxAbs = Math.max(...usdPaare.map(p => Math.abs(p.score || 0)));
    // Ehrlich bleiben: bei |score| ≤ 10 (= unter 55%) ist nichts davon eine Richtung.
    if (maxAbs <= 10) {
      k.push(`🎯 Dollar: praktisch NEUTRAL — kein Signal über ${prozent(maxAbs)}, heute kein Makro-Edge`);
    } else {
      const wucht = maxAbs <= 25 ? "schwach" : maxAbs <= 50 ? "mittel" : "stark";
      const richtung = stark > schwach ? "eher STARK" : schwach > stark ? "eher SCHWACH" : "gemischt";
      k.push(`🎯 Dollar ${richtung} (${Math.max(stark, schwach)} von ${stark + schwach} Paaren) · Signalstärke ${wucht}`);
    }

    // 2) Die zwei klarsten Signale, in Handelsrichtung formuliert.
    const top = paare.filter(p => (p.score || 0) !== 0).slice(0, 2)
      .map(p => `${(p.score > 0 ? "🟢 LONG " : "🔴 SHORT ")}${p.paar} ${prozent(p.score)}`);
    if (top.length) k.push(`📈 Klarste Signale: ${top.join("  ·  ")}`);
  }

  // 3) Die nächsten harten Termine mit Wiener Uhrzeit — der wichtigste Trading-Fakt.
  const morgenTag = new Date(Date.now() + 864e5).toLocaleDateString("sv-SE", { timeZone: WIEN });
  for (const t of naechsteTermine(2)) {
    const tg = tagWien(t.date);
    const wann = tg === heuteWien ? "HEUTE" : tg === morgenTag ? "MORGEN"
      : new Date(t.date).toLocaleDateString("de-AT", { timeZone: WIEN, weekday: "short" }).replace(".", "").toUpperCase();
    const fc = t.forecast ? ` (erw. ${String(t.forecast).replace(".", ",")})` : "";
    k.push(`📅 ${wann} ${uhrWien(t.date)} · ${t.country} ${t.title}${fc}`);
  }

  // 4) Marktlage in einer Zeile (Wochenveränderung, weil Tageswerte oft 0 sind).
  if (markt?.kurse) {
    const kk = markt.kurse;
    // de-DE (Punkt als Tausendertrenner) — de-AT nutzt ein schmales Leerzeichen,
    // das in Telegram wie ein Zeilenumbruch-Fehler aussieht ("4 716$").
    const de = (v, n) => v.toLocaleString("de-DE", { minimumFractionDigits: n, maximumFractionDigits: n });
    const pz = v => v == null ? "" : ` ${v > 0 ? "+" : "−"}${de(Math.abs(v), 1)}%`;
    const teile = [];
    if (kk.DXY) teile.push(`DXY ${de(kk.DXY.wert, 2)}${pz(kk.DXY.wocheProzent)}`);
    if (kk.Gold) teile.push(`Gold ${de(Math.round(kk.Gold.wert), 0)}$${pz(kk.Gold.wocheProzent)}`);
    if (kk.WTI) teile.push(`Öl ${de(kk.WTI.wert, 0)}$${pz(kk.WTI.wocheProzent)}`);
    if (kk.VIX) teile.push(`VIX ${de(kk.VIX.wert, 1)}`);
    if (kk.US10Y) teile.push(`US10J ${de(kk.US10Y.wert, 2)}%`);
    if (teile.length) k.push(`📊 Markt (Wo): ${teile.join(" · ")}`);
  }

  // 5) Risiko-Zeile: überfüllte Positionierung (Squeeze-Gefahr) + Klumpen-Warnung.
  const risiken = [];
  const cot = markt?.cot?.waehrungen || markt?.cot;
  if (cot && typeof cot === "object") {
    const extrem = Object.entries(cot)
      .filter(([, v]) => v && typeof v.zScore === "number" && Math.abs(v.zScore) >= 1.5)
      .sort((a, b) => Math.abs(b[1].zScore) - Math.abs(a[1].zScore)).slice(0, 2)
      .map(([c, v]) => `${c} ${v.richtung === "short" ? "short" : "long"} überfüllt (z ${v.zScore.toFixed(1).replace(".", ",").replace("-", "−")})`);
    if (extrem.length) risiken.push(`${extrem.join(", ")} → Squeeze-Gefahr`);
  }
  const usdMitScore = paare.filter(p => p.paar.includes("USD") && p.score);
  if (usdMitScore.length >= 5) {
    const richtungen = new Set(usdMitScore.map(p => (p.paar.startsWith("USD/") ? 1 : -1) * Math.sign(p.score)));
    if (richtungen.size === 1) risiken.push(`alle ${usdMitScore.length} Dollar-Paare = EINE Wette (kein Streuungs-Schutz — dann eher ein Cross handeln)`);
  }
  if (risiken.length) k.push(`⚠️ Risiko: ${risiken.join(" · ")}`);

  // 6) Ehrlichkeit: wie gut lag das Scoring bisher wirklich?
  const WW = quote?.wochenWette;
  if (WW?.gesamt) {
    const urteil = WW.vomZufallUnterscheidbar ? "besser als Zufall" : "noch im Zufallsbereich → klein bleiben";
    k.push(`🎲 Bisher: ${WW.treffer}/${WW.gesamt} Wochen-Calls richtig (${WW.quote}%) — ${urteil}`);
  }
  // 7) Zweiter, davon unabhängiger Track-Record: die Zahlen-Prognosen.
  const zb = leseJson(path.join(DATEN, "prognose-zahlen.json"), null);
  if (zb?.datenPrognosen?.gesamt) {
    const ab = zb.richtungBeiAbweichung;
    const zusatz = ab?.gesamt ? `, bei echter Abweichung ${ab.quote}%` : "";
    k.push(`🔢 Zahlen-Calls: ${zb.datenPrognosen.quote}% (${zb.datenPrognosen.treffer}/${zb.datenPrognosen.gesamt})${zusatz}`);
  }
  return k;
}

// Nachricht in drei Blöcke bauen. KOPF (Kurzfassung) und FUSS (Paar-Liste + Link)
// sind gesetzt; nur der DETAIL-Teil wird gekürzt, wenn Telegrams 4096-Zeichen-Limit
// sonst gerissen würde — die Kurzfassung darf nie wegfallen.
const kopf = ["📰 Makro-Radar · Tagesüberblick", `🗓️ ${tn.wochentag ? tn.wochentag + ", " : ""}${fmtDatum()}`];
const kurz = baueKurzfassung();
if (kurz.length > 1) kopf.push("", ...kurz);

const detail = [];
if (tn.tenor) { detail.push(""); detail.push(`🧭 ${tn.tenor}`); }
if (Array.isArray(tn.heute) && tn.heute.length) {
  detail.push(""); detail.push("🔥 Heute:");
  for (const h of tn.heute) detail.push(`• ${h}`);
}
if (Array.isArray(tn.gestern) && tn.gestern.length) {
  detail.push(""); detail.push("📅 Gestern/davor:");
  for (const g of tn.gestern) detail.push(`• ${g}`);
}
if (detail.length) detail.unshift("", "— — — Details unten — — —");

const fuss = [];
if (paare.length) {
  fuss.push(""); fuss.push("📊 Paar-Einschätzung (Prognose der Woche):");
  // Kompakt halten: 🟢/🔴 sagt die Richtung schon, die Signalstärke steht in der
  // Kalibrierungszeile darunter. Paare ohne Signal in einer Sammelzeile.
  const mitSignal = paare.filter(p => p.score);
  const ohneSignal = paare.filter(p => !p.score);
  for (const p of mitSignal) fuss.push(`${ampel(p.score)} ${p.paar} ${prozent(p.score)}${p.paar.includes("USD") ? "" : " 🔀"}`);
  if (ohneSignal.length) fuss.push(`⚪ ohne Signal: ${ohneSignal.map(p => p.paar).join(", ")}`);
  fuss.push("🔀 = Cross ohne Dollar (unabhängig von der Dollar-Richtung)");
  fuss.push("50% = neutral · % = meine Überzeugung, KEINE gemessene Wahrscheinlichkeit");
  // Gemessene Trefferquote der Signalstärke danebenstellen (sonst wirken die %
  // präziser, als sie sind). Stufen wie in der Kalibrierung des Build-Skripts.
  const kal = quote?.kalibrierung;
  if (kal) {
    const gemessen = ["schwach", "mittel", "stark"].filter(s => kal[s]?.gesamt)
      .map(s => `${s} ${kal[s].quote}%`);
    if (gemessen.length) fuss.push(`⚖️ Tatsächlich getroffen bisher: ${gemessen.join(" · ")}`);
  }
}
fuss.push("");
fuss.push("📲 Details & Einzel-Signale laufen separat ein. Volles Dashboard:");
fuss.push("https://chorvatkatai-sudo.github.io/makro-radar/");

// Telegram begrenzt auf 4096 Zeichen (UTF-16-Einheiten = JS .length; Emojis zählen 2).
// 4060 lässt etwas Reserve, verschenkt aber nicht unnötig Platz. TG_LIMIT nur zum Testen.
const LIMIT = Number(process.env.TG_LIMIT) || 4060;
const HINWEIS = "… (gekürzt — voller Text im Dashboard)";
let detailKurz = detail.slice();
const laenge = d => [...kopf, ...d, ...fuss].join("\n").length;
while (detailKurz.length && laenge(detailKurz) > LIMIT) {
  detailKurz.pop();                                   // von hinten Stichpunkte wegnehmen
  if (detailKurz.length && laenge([...detailKurz, HINWEIS]) <= LIMIT) { detailKurz.push(HINWEIS); break; }
}
const text = [...kopf, ...detailKurz, ...fuss].join("\n");

async function sende(t) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text: t, disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

if (DRY) { console.log(text); console.log("\nGESENDET:0 (DRY)"); process.exit(0); }
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

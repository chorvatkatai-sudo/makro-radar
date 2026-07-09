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

const z = [];
z.push("📰 Makro-Radar · Tagesüberblick");
z.push(`🗓️ ${tn.wochentag ? tn.wochentag + ", " : ""}${fmtDatum()}`);
if (tn.tenor) { z.push(""); z.push(`🧭 ${tn.tenor}`); }
if (Array.isArray(tn.heute) && tn.heute.length) {
  z.push(""); z.push("🔥 Heute:");
  for (const h of tn.heute) z.push(`• ${h}`);
}
if (Array.isArray(tn.gestern) && tn.gestern.length) {
  z.push(""); z.push("📅 Gestern/davor:");
  for (const g of tn.gestern) z.push(`• ${g}`);
}
// Bevorzugt die Markt-korrigierten Endscores (paare-markt.json, von fetch-kalender
// direkt davor geschrieben) — dieselben Werte wie im Dashboard. Fallback: briefing.paare.
const pm = leseJson(path.join(DATEN, "paare-markt.json"), null);
const paare = ((pm?.paare?.length ? pm.paare : briefing.paare) || [])
  .slice().sort((a, b) => Math.abs(b.score || 0) - Math.abs(a.score || 0));
if (paare.length) {
  z.push(""); z.push("📊 Paar-Einschätzung (Prognose der Woche):");
  for (const p of paare) {
    const sc = p.score || 0;
    z.push(`${ampel(sc)} ${p.paar}  ${prozent(sc)} ${label(sc)}${staerke(sc)}`);
  }
  z.push("50% = neutral · % = wie klar die Daten in eine Richtung zeigen");
}
z.push("");
z.push("📲 Details & Einzel-Signale laufen separat ein. Volles Dashboard:");
z.push("https://chorvatkatai-sudo.github.io/makro-radar/");
const text = z.join("\n");

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

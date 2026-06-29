// nfp-check.mjs — einmaliger Selbsttest der Pipeline rund um den US-Jobbericht (NFP):
// 1) Ist der NFP in der Historie und wurde sein Ist-Wert automatisch gefüllt (FRED/TV)?
// 2) Wurde dafür ein Telegram-Event-Signal verschickt (steht die Event-ID im Ledger)?
// Schickt das Ergebnis als Telegram-Bericht. Ohne TELEGRAM_TOKEN/CHAT -> nur Konsole.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEN = path.join(ROOT, "daten");
const DRY = process.argv.includes("--dry");
const TOKEN = process.env.TELEGRAM_TOKEN?.trim();
const CHAT = process.env.TELEGRAM_CHAT?.trim();
const leseJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };

const historie = leseJson(path.join(DATEN, "historie.json"), { events: {} });
const ledger = new Set(leseJson(path.join(DATEN, "benachrichtigt.json"), { gesendet: [] }).gesendet);

const grenze = new Date(Date.now() - 7 * 864e5);
// NFP-Event der letzten 7 Tage suchen (USD, Titel "Non-Farm…").
let nfpId = null, nfp = null;
for (const [id, e] of Object.entries(historie.events)) {
  if (e.land === "USD" && /Non-Farm|Nonfarm|NFP/i.test(e.titel) && new Date(e.datum) >= grenze && !isNaN(new Date(e.datum))) {
    if (!nfp || new Date(e.datum) > new Date(nfp.datum)) { nfpId = id; nfp = e; }
  }
}

const z = ["🔎 NFP-Check (automatisch)"];
if (!nfp) {
  z.push("");
  z.push("⚠️ Kein NFP-Event der letzten 7 Tage in der Historie gefunden.");
  z.push("Mögliche Gründe: Feed-Titel weicht ab, oder der Jobbericht steht noch aus.");
  z.push("→ Bitte kurz manuell prüfen (historie.json / Dashboard).");
} else {
  const gefuellt = nfp.actual !== null && nfp.actual !== "" && nfp.actual !== undefined;
  const signal = ledger.has(nfpId);
  z.push(`📅 ${String(nfp.datum).slice(0, 10)} · ${nfp.titel}`);
  z.push("");
  z.push(`1) Ist-Wert gefüllt: ${gefuellt ? "✅ " + nfp.actual + " (Quelle: " + (nfp.notiz || "manuell/unbekannt") + ")" : "❌ noch leer"}`);
  z.push(`2) Telegram-Signal verschickt: ${signal ? "✅ ja" : "❌ nein"}`);
  z.push("");
  if (gefuellt && signal) z.push("Verdict: ✅ Pipeline lief End-to-End (FRED/TV-Fill + Signal).");
  else if (gefuellt && !signal) z.push("Verdict: ⚠️ Wert da, aber KEIN Signal verschickt — Notify-Kette prüfen.");
  else if (!gefuellt && signal) z.push("Verdict: ⚠️ Signal da, aber Wert leer — ungewöhnlich, prüfen.");
  else z.push("Verdict: ❌ Wert NICHT automatisch gefüllt — FRED/Feed im Runner prüfen (auto:FRED?).");
}
const text = z.join("\n");
console.log(text);

if (!DRY && TOKEN && CHAT) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text, disable_web_page_preview: true }),
    });
    console.log(r.ok ? "\n→ Telegram gesendet." : "\n→ Telegram-Fehler " + r.status);
  } catch (e) { console.warn("\n→ Telegram fehlgeschlagen:", e.message); }
}

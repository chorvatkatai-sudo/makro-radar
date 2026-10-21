// klartext.mjs — gemeinsame Übersetzungs-Schicht für alle Telegram-Nachrichten:
// Währungskürzel → Alltagsdeutsch, Event-Titel → kurzer Klarname (via lexikon.json),
// und die Polarität ("bedeutet ein höherer Wert eine stärkere Währung?").
//
// Warum ein eigenes Modul (Session 11): Die Polaritäts-Logik stand doppelt in
// benachrichtige.mjs und event-reaktion.mjs — CLAUDE.md musste deshalb warnen
// "bei Änderungen BEIDE pflegen, Import ist unmöglich". Unmöglich war der Import
// nur, weil benachrichtige.mjs beim Laden sendet; dieses Modul ist nebenwirkungsfrei
// und darf von allen importiert werden. Einzige Quelle der Wahrheit ab jetzt.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));

export const FLAGGE = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CHF: "🇨🇭",
  CAD: "🇨🇦", AUD: "🇦🇺", NZD: "🇳🇿", CNY: "🇨🇳",
};

// Für Sätze über die WÄHRUNG ("viele wetten auf fallenden Euro").
export const WAEHRUNG = {
  USD: "Dollar", EUR: "Euro", GBP: "Pfund", JPY: "Yen", CHF: "Franken",
  CAD: "Kanada-Dollar", AUD: "Aussie-Dollar", NZD: "Kiwi-Dollar", CNY: "Yuan",
};

// Für Sätze über das LAND ("Neuseeland Inflation") — nicht dasselbe wie die Währung,
// "Kiwi-Dollar CPI" liest sich falsch.
export const LAND = {
  USD: "USA", EUR: "Eurozone", GBP: "UK", JPY: "Japan", CHF: "Schweiz",
  CAD: "Kanada", AUD: "Australien", NZD: "Neuseeland", CNY: "China",
};

export const waehrungName = c => WAEHRUNG[c] || c;
export const landName = c => LAND[c] || c;
export const flagge = c => FLAGGE[c] || "🏳️";

const lexikon = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(HIER, "lexikon.json"), "utf8")); }
  catch { return { begriffe: [], fallback: {} }; }
})();

/** Vollen Lexikon-Eintrag zum Event-Titel finden (sonst Fallback-Eintrag). */
export function findeBegriff(titel) {
  for (const b of lexikon.begriffe || []) {
    try { if (new RegExp(b.muster, "i").test(titel)) return b; } catch { /* kaputtes Muster ignorieren */ }
  }
  return lexikon.fallback || { name: titel, einfach: "", hoeher: "", niedriger: "" };
}

/**
 * Kurzer Klarname für Telegram-Zeilen: "CPI y/y" -> "Inflation".
 * Die Lexikon-Namen tragen die Fachbegriffe in Klammern ("Inflation
 * (Verbraucherpreise, CPI)") — für die Kurznachricht fliegt die Klammer raus.
 * Greift das Lexikon nicht (Fallback "Wirtschaftsdaten"), bleibt der Originaltitel
 * stehen: lieber "Retail Sales m/m" als nichtssagend "Wirtschaftsdaten".
 */
export function eventName(titel) {
  const b = findeBegriff(titel);
  if (!b.name || b.name === lexikon.fallback?.name) return String(titel || "").trim();
  return b.name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim() || b.name;
}

/**
 * Polarität aus dem Lexikon-Text "hoeher" ableiten: Was bedeutet ein HÖHERER Wert
 * für die Währung? true = stärker (bullish), false = schwächer, null = unklar/neutral.
 * Entscheidend ist, welches der beiden Schlüsselwörter ZUERST genannt wird.
 */
export function hoeherBullish(begriff) {
  const t = (begriff?.hoeher || "").toUpperCase();
  const iStark = t.indexOf("STÄRKER");
  const iSchwach = t.indexOf("SCHWÄCHER");
  if (iStark === -1 && iSchwach === -1) return null;
  if (iStark === -1) return false;
  if (iSchwach === -1) return true;
  return iStark < iSchwach;
}

/**
 * Text auf max. `limit` Zeichen bringen, möglichst an einem Satzende.
 * Bewusst KEINE Satz-Zerlegung per Regex: die Lexikon-Texte enthalten "..." und
 * Abkürzungen, daran brach ein `[^.!?]+[.!?]+`-Split mitten im Wort ab
 * ("Was kostet das Leben (Essen, Benzin, Miete..." statt des ganzen Satzes).
 */
export function kuerze(text, limit = 150) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= limit) return t;
  const kopf = t.slice(0, limit);
  // Letztes Satzende suchen, das nicht Teil eines "..." ist und weit genug hinten liegt.
  const satzEnde = Math.max(kopf.lastIndexOf(". "), kopf.lastIndexOf("! "), kopf.lastIndexOf("? "));
  if (satzEnde > limit * 0.4 && kopf[satzEnde - 1] !== ".") return t.slice(0, satzEnde + 1);
  const wortEnde = kopf.lastIndexOf(" ");
  return (wortEnde > 0 ? kopf.slice(0, wortEnde) : kopf).trimEnd() + "…";
}

/** Rohwert aus dem Feed deutsch setzen: "0.8%" -> "0,8 %", "-1.2%" -> "−1,2 %". */
export function zahlDe(s) {
  return String(s ?? "").trim()
    .replace(/\./g, ",")
    .replace(/\s*%/g, " %")
    .replace(/^-/, "−");            // echtes Minuszeichen, liest sich in Telegram besser
}

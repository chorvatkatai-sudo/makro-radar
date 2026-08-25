// prognose-zahlen.mjs — Track-Record der ZAHLEN-Prognosen (nicht der Kursrichtung).
//
// Hintergrund (Session 10): Das Selbstlernen misst bisher nur die FX-Richtung — also
// ausgerechnet den Teil, der nachweislich kaum über Zufall liegt. Die Zahlen-Calls
// ("Kern-CPI kommt eher kühler") sind laut Projekt-Historie der verlässliche Teil,
// wurden aber nie ausgewertet. Das holt dieses Skript nach.
//
// Zwei Wege, bewusst getrennt gehalten:
//  A) EXAKT — Briefings ab Session 10 können je Prognose ein maschinenlesbares Feld
//     `richtung` ("hoeher" | "niedriger" | "wie_erwartet") mitliefern. Dann ist die
//     Auswertung eindeutig, ohne Textdeutung.
//  B) VORLÄUFIG — für die Altbestände wird der ERSTE SATZ von `meineEinschaetzung`
//     klassifiziert (dort steht der Call: "Ich erwarte …"; die Einschränkungen kommen
//     danach). Nur EINDEUTIGE Fälle werden gewertet, alles andere zählt als
//     "nicht wertbar" — lieber weniger Datenpunkte als erfundene.
//
// Aufruf: node scripts/prognose-zahlen.mjs [--details]
// Schreibt daten/prognose-zahlen.json (wird in data.js gebacken).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEN = path.join(ROOT, "daten");
const DETAILS = process.argv.includes("--details");

const leseJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };

// ─── Währung aus dem Event-Text erkennen ────────────────────────────────────
const LAND = [
  [/\b(USA|US-|U\.S\.|Fed|FOMC|ISM|NFP)\b/i, "USD"],
  [/Eurozone|Euroraum|EZB|Deutschland|\(EUR\)/i, "EUR"],
  [/Großbritannien|UK-|BoE|Pfund|\(GBP\)/i, "GBP"],
  [/Kanada|BoC|Loonie|\(CAD\)/i, "CAD"],
  [/Australien|RBA|Aussie|\(AUD\)/i, "AUD"],
  [/Neuseeland|RBNZ|Kiwi|\(NZD\)/i, "NZD"],
  [/Japan|BoJ|BOJ|Yen|\(JPY\)/i, "JPY"],
  [/Schweiz|SNB|Franken|\(CHF\)/i, "CHF"],
  [/China|\(CNY\)/i, "CNY"],
];
const waehrungVon = txt => (LAND.find(([re]) => re.test(txt || "")) || [])[1] || null;

// ─── Termin "Dienstag 14.7., 14:30 Wiener Zeit" → 2026-07-14 ────────────────
function terminDatum(termin, briefingDatum) {
  const m = String(termin || "").match(/(\d{1,2})\.(\d{1,2})\./);
  if (!m) return null;
  const [, tag, monat] = m;
  const jahr = new Date(briefingDatum + "T00:00:00Z").getUTCFullYear();
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

// ─── Zahl aus Text ziehen ("+0,3%" → 0.3; "2,25 %" → 2.25) ─────────────────
function zahl(txt) {
  if (txt == null) return null;
  const m = String(txt).replace(/\s/g, "").match(/(-|−|\+)?(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[2].replace(",", "."));
  return (m[1] === "-" || m[1] === "−") ? -v : v;
}

// ─── Richtung des eigenen Calls aus dem ERSTEN SATZ klassifizieren ──────────
// Bewusst streng: kommen beide Richtungsfamilien vor, gilt der Call als unklar.
// Wortstämme statt Vollformen — die Texte schreiben "KÜHLEN Zahl", "schwachen
// Zahlen", "HALTEN". Reihenfolge egal, aber Exklusivität zählt (s. klassifiziere).
const HOEHER = /(höher|hoeher|heiß|heiss|hitzig|stärk|staerk|stark|zäh|zaeh|hartnäckig|hartnaeckig|klebrig|oberhalb|mehr als|kräftig|kraeftig|robust|beschleunig|erhöh|erhoeh|anzieh|aufwärts|aufwaerts)/i;
const NIEDRIGER = /(kühl|kuehl|niedriger|schwäch|schwaech|schwach|weicher|unterhalb|weniger als|abkühl|abkuehl|enttäusch|enttaeusch|nachgeb|rückläufig|ruecklaeufig|senkung|abwärts|abwaerts|bremst)/i;
// Zustimmung zum Konsens (inkl. Zinsentscheid "Halten", wenn auch der Markt Halten erwartet)
const NEUTRAL = /(wie erwartet|im Rahmen|unverändert|unveraendert|\bhalten\b|bestätigt den Konsens|bestaetigt den Konsens|auf Linie|ebenfalls|gesetzt|Konsens)/i;

function ersterSatz(text) {
  const t = String(text || "").trim();
  // Bis zum ersten Satzende — aber "Begründung:"/"Aber" beenden den Call ebenfalls.
  const stop = t.search(/(?:\.\s|\bBegründung\b|\bBegruendung\b|\bAber\b|\bVorsicht\b|\bAchtung\b|—)/);
  return stop > 0 ? t.slice(0, stop) : t;
}

const ZINSENTSCHEID = /Zinsentscheid|Zinsbeschluss|Rate Decision|Leitzins|Notenbank/i;

function klassifiziere(einschaetzung, eventText) {
  const satz = ersterSatz(einschaetzung);
  const h = HOEHER.test(satz), n = NIEDRIGER.test(satz), neu = NEUTRAL.test(satz);
  // Zinsentscheide sind ein Sonderfall: "Ich erwarte ein Halten" heißt Zustimmung
  // zum Konsens (der praktisch immer Halten lautet). "Ich sehe ERHÖHUNG" wäre nur
  // dann eine Abweichung, wenn der Konsens etwas anderes sagt — das ist aus dem
  // Text nicht sicher ableitbar, deshalb bleibt es bewusst ungewertet.
  if (ZINSENTSCHEID.test(eventText || "")) return /\bhalten\b|wie erwartet|unverändert|unveraendert/i.test(satz) ? "wie_erwartet" : null;
  if (neu && !h && !n) return "wie_erwartet";
  if (h && !n) return "hoeher";
  if (n && !h) return "niedriger";
  return null;                              // mehrdeutig -> nicht wertbar
}

// ─── Historie laden (Ist-Werte) ─────────────────────────────────────────────
// historie.events ist ein OBJEKT (Schlüssel = "datum|land|titel"), kein Array.
const histRoh = leseJson(path.join(DATEN, "historie.json"), { events: {} });
const historie = Object.values(histRoh.events || {}).filter(e => e && e.actual != null && e.actual !== "");

// Passenden Ist-Wert suchen: gleiche Währung, gleicher Tag, High-Impact.
function findeIst(waehrung, datum, eventText) {
  const tag = (historie || []).filter(e =>
    (e.land || e.waehrung) === waehrung &&
    String(e.datum || "").slice(0, 10) === datum &&
    e.impact === "High" && e.prognose != null && e.prognose !== "");
  if (!tag.length) return null;
  if (tag.length === 1) return tag[0];
  // Mehrere Zahlen am selben Tag: die nehmen, deren Titel im Event-Text vorkommt.
  const stich = ["Core", "Kern", "CPI", "Rate", "GDP", "BIP", "Employment", "Retail", "PCE", "PPI"];
  const treffer = tag.find(e => stich.some(s =>
    new RegExp(s, "i").test(e.titel || "") && new RegExp(s, "i").test(eventText || "")));
  return treffer || tag[0];
}

export function werteZahlenPrognosenAus() {
// ─── Prognosen einsammeln (über alle Archiv-Briefings, dedupliziert) ───────
const archivDir = path.join(DATEN, "briefing-archiv");
const dateien = fs.existsSync(archivDir) ? fs.readdirSync(archivDir).filter(f => f.endsWith(".json")).sort() : [];
const gesehen = new Map();
for (const f of dateien) {
  const b = leseJson(path.join(archivDir, f), null);
  if (!b?.prognosen) continue;
  for (const p of b.prognosen) {
    const key = `${p.event}|${p.termin}`;
    // Dieselbe Prognose steht in mehreren Tagesnews-Kopien — die FRÜHESTE zählt.
    if (!gesehen.has(key)) gesehen.set(key, { ...p, briefingDatum: b.datum, quelle: f });
  }
}

// ─── Auswerten ──────────────────────────────────────────────────────────────
const ergebnisse = [];
for (const p of gesehen.values()) {
  const waehrung = waehrungVon(`${p.event} ${p.prognoseMarkt || ""}`);
  const datum = terminDatum(p.termin, p.briefingDatum);
  // Richtung: exaktes Feld hat Vorrang, sonst vorsichtige Textdeutung.
  const exakt = ["hoeher", "niedriger", "wie_erwartet"].includes(p.richtung);
  const richtung = exakt ? p.richtung : klassifiziere(p.meineEinschaetzung, p.event);
  const eintrag = {
    event: p.event, termin: p.termin, datum, waehrung,
    richtung, methode: exakt ? "exakt" : "textdeutung",
    status: "nicht_wertbar", grund: null,
  };
  if (!richtung) { eintrag.grund = "Call im Text nicht eindeutig"; ergebnisse.push(eintrag); continue; }
  if (!waehrung || !datum) { eintrag.grund = "Währung/Termin nicht erkannt"; ergebnisse.push(eintrag); continue; }
  const ist = findeIst(waehrung, datum, p.event);
  if (!ist) { eintrag.grund = "kein Ist-Wert in der Historie"; ergebnisse.push(eintrag); continue; }

  const a = zahl(ist.actual), k = zahl(ist.prognose);
  if (a == null || k == null) { eintrag.grund = "Zahl nicht lesbar"; ergebnisse.push(eintrag); continue; }
  const diff = +(a - k).toFixed(3);
  // "wie erwartet" gilt als getroffen, wenn die Abweichung verschwindend ist.
  const toleranz = Math.max(0.05, Math.abs(k) * 0.02);
  const echt = Math.abs(diff) <= toleranz ? "wie_erwartet" : diff > 0 ? "hoeher" : "niedriger";
  Object.assign(eintrag, {
    status: "gewertet", titel: ist.titel, konsens: ist.prognose, ist: ist.actual,
    abweichung: diff, tatsaechlich: echt, treffer: richtung === echt,
  });
  ergebnisse.push(eintrag);
}

const gewertet = ergebnisse.filter(e => e.status === "gewertet");
const treffer = gewertet.filter(e => e.treffer).length;
const bilanz = liste => ({
  treffer: liste.filter(e => e.treffer).length,
  gesamt: liste.length,
  quote: liste.length ? Math.round(liste.filter(e => e.treffer).length / liste.length * 100) : null,
});
const nachMethode = m => bilanz(gewertet.filter(e => e.methode === m));

// WICHTIG für die Interpretation: Ein "Halten wie erwartet" bei einem Zinsentscheid
// ist so gut wie geschenkt (Notenbanken halten meistens, und der Markt weiß das) —
// solche Treffer würden die Quote schönen. Deshalb getrennt ausweisen. Und: Landet
// ein Wert exakt auf dem Konsens, gilt ein Richtungs-Lean als Fehltreffer; die
// eigentliche Prognoseleistung zeigt sich dort, wo der Wert WIRKLICH abwich.
const istZins = e => ZINSENTSCHEID.test(e.event || "");
const zinsentscheide = gewertet.filter(istZins);
const datenPrognosen = gewertet.filter(e => !istZins(e));
const mitAbweichung = datenPrognosen.filter(e => e.tatsaechlich !== "wie_erwartet");

const bericht = {
  stand: new Date().toISOString(),
  hinweis: "Track-Record der ZAHLEN-Prognosen (kam der Wert höher/niedriger als der Konsens?). 'exakt' = maschinenlesbares Feld im Briefing; 'textdeutung' = vorsichtige Klassifikation des ersten Satzes, nur bei eindeutigem Call.",
  gefunden: ergebnisse.length,
  gewertet: gewertet.length,
  nichtWertbar: ergebnisse.length - gewertet.length,
  treffer,
  quote: gewertet.length ? Math.round(treffer / gewertet.length * 100) : null,
  zinsentscheide: bilanz(zinsentscheide),
  datenPrognosen: bilanz(datenPrognosen),
  richtungBeiAbweichung: bilanz(mitAbweichung),
  exakt: nachMethode("exakt"),
  textdeutung: nachMethode("textdeutung"),
  letzte: gewertet.slice(-8).map(e => ({
    event: e.event, datum: e.datum, richtung: e.richtung, tatsaechlich: e.tatsaechlich,
    konsens: e.konsens, ist: e.ist, treffer: e.treffer,
  })),
};

fs.writeFileSync(path.join(DATEN, "prognose-zahlen.json"), JSON.stringify(bericht, null, 2));
return { bericht, ergebnisse };
}

// ─── Direktaufruf über die Kommandozeile ────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith("prognose-zahlen.mjs")) {
  const { bericht, ergebnisse } = werteZahlenPrognosenAus();
  const q = b => `${b.treffer}/${b.gesamt}${b.quote != null ? ` = ${b.quote}%` : ""}`;
  console.log(`Zahlen-Prognosen: ${bericht.gefunden} gefunden · ${bericht.gewertet} wertbar · ${bericht.treffer}/${bericht.gewertet} = ${bericht.quote}%`);
  console.log(`  davon Zinsentscheide (Halten wie erwartet = geschenkt): ${q(bericht.zinsentscheide)}`);
  console.log(`  echte Datenprognosen:                                   ${q(bericht.datenPrognosen)}`);
  console.log(`  davon Richtung richtig, WENN der Wert wirklich abwich:  ${q(bericht.richtungBeiAbweichung)}`);
  console.log(`  Methode — exakt: ${q(bericht.exakt)} · Textdeutung: ${q(bericht.textdeutung)}`);
  if (DETAILS) {
    for (const e of ergebnisse) {
      if (e.status === "gewertet") {
        console.log(`  ${e.treffer ? "✓" : "✗"} ${e.datum} ${e.waehrung} ${e.titel} | ich: ${e.richtung} | echt: ${e.tatsaechlich} (Konsens ${e.konsens} → Ist ${e.ist}) [${e.methode}]`);
      } else {
        console.log(`  – ${e.datum || "??"} ${e.waehrung || "??"} ${String(e.event).slice(0, 50)} | ${e.grund}`);
      }
    }
  }
}

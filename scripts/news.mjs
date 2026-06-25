// news.mjs — Holt aktuelle Forex-/Makro-Schlagzeilen aus kostenlosen RSS-Feeds
// und bündelt sie für die News-Box im Dashboard. Reine Anzeige (keine Wertung).
//
// Quellen (kostenlos, ohne Schlüssel):
//  - ForexLive  (schnelle Trader-Kommentare)
//  - FXStreet   (Analysen/News)
//  - Federal Reserve Pressemitteilungen
//
// Aufruf direkt:  node scripts/news.mjs        (schreibt daten/news.json)
// Als Modul:      import { holeNews } from "./news.mjs"

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEN = path.join(ROOT, "daten");

const FEEDS = [
  { quelle: "ForexLive", url: "https://www.forexlive.com/feed/news" },
  { quelle: "FXStreet",  url: "https://www.fxstreet.com/rss/news" },
  { quelle: "Fed",       url: "https://www.federalreserve.gov/feeds/press_all.xml" },
];

// --- Mini-RSS/Atom-Parser (ohne Abhängigkeiten) ---------------------------
function entferneCdata(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}
function entityDecode(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&#8217;/g, "’")
    .replace(/&#8211;/g, "–").replace(/&nbsp;/g, " ");
}
function reinText(s) {
  return entityDecode(entferneCdata(s)).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
function ersterTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1] : null;
}
function linkAus(block) {
  // RSS: <link>URL</link>; Atom: <link href="URL" .../>
  const rss = ersterTag(block, "link");
  if (rss && reinText(rss)) return reinText(rss);
  const atom = block.match(/<link[^>]*href="([^"]+)"/i);
  return atom ? atom[1] : null;
}

function parseFeed(xml, quelle) {
  const bloecke = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) || [];
  const out = [];
  for (const b of bloecke) {
    const titel = reinText(ersterTag(b, "title") || "");
    if (!titel) continue;
    const link = linkAus(b);
    const datumRoh = reinText(ersterTag(b, "pubDate") || ersterTag(b, "updated") || ersterTag(b, "published") || "");
    const d = datumRoh ? new Date(datumRoh) : null;
    out.push({ quelle, titel, link, datum: d && !isNaN(d) ? d.toISOString() : null });
  }
  return out;
}

async function holeFeed(feed) {
  try {
    const res = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0 (Makro-Dashboard, privat)", "Accept": "application/rss+xml, application/xml, text/xml, */*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseFeed(await res.text(), feed.quelle).slice(0, 12);
  } catch (e) {
    console.warn(`News ${feed.quelle} nicht erreichbar: ${e.message}`);
    return [];
  }
}

// --- Öffentliche Hauptfunktion --------------------------------------------
export async function holeNews({ max = 18 } = {}) {
  const listen = await Promise.all(FEEDS.map(holeFeed));
  const alle = listen.flat();
  // nach Datum absteigend (Einträge ohne Datum ans Ende)
  alle.sort((a, b) => (b.datum ? Date.parse(b.datum) : 0) - (a.datum ? Date.parse(a.datum) : 0));
  // einfache Dedup über Titel
  const gesehen = new Set();
  const eintraege = [];
  for (const e of alle) {
    const k = e.titel.toLowerCase().slice(0, 80);
    if (gesehen.has(k)) continue;
    gesehen.add(k);
    eintraege.push(e);
    if (eintraege.length >= max) break;
  }
  return { stand: new Date().toISOString(), quellen: FEEDS.map(f => f.quelle), eintraege };
}

// --- Standalone-Lauf -------------------------------------------------------
if (process.argv[1]?.endsWith("news.mjs")) {
  const n = await holeNews();
  fs.mkdirSync(DATEN, { recursive: true });
  fs.writeFileSync(path.join(DATEN, "news.json"), JSON.stringify(n, null, 2));
  console.log(`News: ${n.eintraege.length} Schlagzeilen (${n.quellen.join(", ")})`);
  n.eintraege.slice(0, 8).forEach(e => console.log(`  [${e.quelle}] ${e.titel.slice(0, 80)}`));
}

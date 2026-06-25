// marktdaten.mjs — Holt den Markt-KONTEXT, der unsere Briefings antreibt:
// die harten Treiber hinter den Forex-Bewegungen, bisher nur als Text im Briefing.
//
// Quellen (beide KOSTENLOS, OHNE Schlüssel):
//  1) Yahoo Finance Chart-API  https://query1.finance.yahoo.com/v8/finance/chart/<symbol>
//     → US-Dollar-Index (DXY), VIX (Angst-Barometer), Öl WTI/Brent, Gold,
//       US-Staatsanleihen-Renditen (2/10/30J), Bitcoin (Risiko-Stimmung)
//  2) CFTC COT (Commitments of Traders), Socrata-API publicreporting.cftc.gov
//     → wöchentliche Netto-Positionierung der Großspekulanten in FX-Futures
//       (EUR, JPY, GBP, CHF, CAD, AUD, NZD) — Crowding-/Reversal-Signal
//
// Aufruf direkt:  node scripts/marktdaten.mjs   (schreibt daten/marktdaten.json)
// Als Modul:      import { holeMarktdaten } from "./marktdaten.mjs"

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEN = path.join(ROOT, "daten");

// ---- Yahoo: Symbole, die für Forex-Makro zählen --------------------------
// scale: Faktor, mit dem Yahoos Rohwert auf den echten Wert kommt (Renditen-Indizes
// wie ^TNX liefern den Prozentwert teils ×10). Wird unten dynamisch korrigiert.
const YAHOO = [
  { key: "DXY",   sym: "DX-Y.NYB", name: "US-Dollar-Index",        einheit: "",   typ: "index" },
  { key: "VIX",   sym: "^VIX",      name: "VIX (Angst-Barometer)",  einheit: "",   typ: "index" },
  { key: "WTI",   sym: "CL=F",      name: "Öl WTI",                 einheit: "$",  typ: "rohstoff" },
  { key: "Brent", sym: "BZ=F",      name: "Öl Brent",               einheit: "$",  typ: "rohstoff" },
  { key: "Gold",  sym: "GC=F",      name: "Gold",                   einheit: "$",  typ: "rohstoff" },
  { key: "US02Y", sym: "2YY=F",     name: "US-Rendite 2 Jahre",     einheit: "%",  typ: "rendite" },
  { key: "US10Y", sym: "^TNX",      name: "US-Rendite 10 Jahre",    einheit: "%",  typ: "rendite" },
  { key: "US30Y", sym: "^TYX",      name: "US-Rendite 30 Jahre",    einheit: "%",  typ: "rendite" },
  { key: "BTC",   sym: "BTC-USD",   name: "Bitcoin",                einheit: "$",  typ: "krypto" },
];

async function holeYahoo(eintrag) {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(eintrag.sym)}?range=1mo&interval=1d`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Makro-Dashboard, privat)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const r = j?.chart?.result?.[0];
      if (!r) throw new Error("keine Daten");
      const closesRoh = (r.indicators?.quote?.[0]?.close || []).filter(x => x != null);
      if (!closesRoh.length) throw new Error("leere Kursreihe");
      let cur = r.meta?.regularMarketPrice ?? closesRoh[closesRoh.length - 1];
      let closes = [...closesRoh, cur].filter((v, i, a) => i === a.length - 1 ? v != null : true);
      // Renditen-Index ^TNX/^TYX liefert teils ×10 (z.B. 42.5 statt 4.25) → normalisieren
      if (eintrag.typ === "rendite" && cur > 25) { cur /= 10; closes = closes.map(c => c / 10); }
      const vorTag = closes.length >= 2 ? closes[closes.length - 2] : null;
      const vorWoche = closes.length >= 6 ? closes[closes.length - 6] : closes[0];   // ~5 Handelstage
      const proz = (a, b) => (a != null && b) ? +(((cur - b) / Math.abs(b)) * 100).toFixed(2) : null;
      return {
        name: eintrag.name, einheit: eintrag.einheit, typ: eintrag.typ,
        wert: +cur.toFixed(eintrag.typ === "rendite" ? 3 : (cur < 10 ? 4 : 2)),
        tagProzent: proz(cur, vorTag),
        wocheProzent: eintrag.typ === "rendite"
          ? (vorWoche != null ? +(cur - vorWoche).toFixed(2) : null)   // Renditen: Differenz in %-Punkten
          : proz(cur, vorWoche),
        renditeDelta: eintrag.typ === "rendite",                       // Flag fürs Dashboard (Pp statt %)
        verlauf: closes.slice(-22).map(c => +c.toFixed(eintrag.typ === "rendite" ? 3 : 2)),
      };
    } catch (err) {
      if (host === hosts[hosts.length - 1]) {
        console.warn(`Yahoo ${eintrag.key} (${eintrag.sym}) nicht erreichbar: ${err.message}`);
        return null;
      }
    }
  }
  return null;
}

// ---- CFTC COT: Netto-Positionierung der Großspekulanten in FX-Futures ----
const COT_MAP = {
  "EURO FX": "EUR",
  "JAPANESE YEN": "JPY",
  "BRITISH POUND": "GBP",
  "BRITISH POUND STERLING": "GBP",
  "SWISS FRANC": "CHF",
  "CANADIAN DOLLAR": "CAD",
  "AUSTRALIAN DOLLAR": "AUD",
  "NEW ZEALAND DOLLAR": "NZD",
  "NZ DOLLAR": "NZD",
  "U.S. DOLLAR INDEX": "USD",
};

async function holeCot() {
  const base = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";
  try {
    // neuestes Report-Datum
    let res = await fetch(base + "?$select=report_date_as_yyyy_mm_dd&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=1",
      { headers: { "User-Agent": "Mozilla/5.0 (Makro-Dashboard, privat)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const latest = (await res.json())[0]?.report_date_as_yyyy_mm_dd;
    if (!latest) throw new Error("kein Report-Datum");

    const cols = "contract_market_name,noncomm_positions_long_all,noncomm_positions_short_all," +
      "open_interest_all,change_in_noncomm_long_all,change_in_noncomm_short_all";
    const url = base + `?$where=report_date_as_yyyy_mm_dd='${latest}'&$select=${cols}&$limit=3000`;
    res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Makro-Dashboard, privat)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();

    const waehrungen = {};
    for (const x of rows) {
      const code = COT_MAP[(x.contract_market_name || "").trim().toUpperCase()];
      if (!code || waehrungen[code]) continue;
      const long = +x.noncomm_positions_long_all, short = +x.noncomm_positions_short_all;
      const net = long - short;
      const dNet = (+x.change_in_noncomm_long_all || 0) - (+x.change_in_noncomm_short_all || 0);
      waehrungen[code] = {
        net, dNet, long, short,
        oi: +x.open_interest_all || null,
        // Netto in % des Open Interest = wie einseitig ist das Spielfeld
        nettoAnteil: x.open_interest_all ? +((net / +x.open_interest_all) * 100).toFixed(1) : null,
        richtung: net > 0 ? "long" : net < 0 ? "short" : "neutral",
      };
    }
    return { stand: latest.slice(0, 10), waehrungen };
  } catch (err) {
    console.warn(`CFTC COT nicht erreichbar: ${err.message}`);
    return null;
  }
}

// ---- Öffentliche Hauptfunktion -------------------------------------------
export async function holeMarktdaten() {
  const [yahooErgebnisse, cot] = await Promise.all([
    Promise.all(YAHOO.map(holeYahoo)),
    holeCot(),
  ]);
  const kurse = {};
  YAHOO.forEach((e, i) => { if (yahooErgebnisse[i]) kurse[e.key] = yahooErgebnisse[i]; });

  // 2s10s-Kurve (Frühindikator/Rezessions-Signal) wenn beide Renditen da
  let kurve = null;
  if (kurse.US02Y && kurse.US10Y) {
    kurve = +(kurse.US10Y.wert - kurse.US02Y.wert).toFixed(2);   // in %-Punkten
  }

  return {
    stand: new Date().toISOString(),
    kurse,
    kurve2s10s: kurve,
    cot,
    quellen: ["Yahoo Finance (keyless)", "CFTC COT / publicreporting.cftc.gov (keyless)"],
  };
}

// ---- Standalone-Lauf ------------------------------------------------------
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` ||
    process.argv[1]?.endsWith("marktdaten.mjs")) {
  const md = await holeMarktdaten();
  fs.mkdirSync(DATEN, { recursive: true });
  fs.writeFileSync(path.join(DATEN, "marktdaten.json"), JSON.stringify(md, null, 2));
  const k = md.kurse;
  console.log("Markt-Kompass:",
    Object.keys(k).map(key => `${key}=${k[key].wert}${k[key].einheit}`).join("  "));
  if (md.kurve2s10s != null) console.log("2s10s-Kurve:", md.kurve2s10s, "Pp");
  if (md.cot) console.log("COT (" + md.cot.stand + "):",
    Object.entries(md.cot.waehrungen).map(([c, v]) => `${c} net=${v.net}`).join("  "));
}

// tv-istwerte.mjs — füllt NICHT-US-Ist-Werte automatisch aus dem TradingView-Feed nach.
// Ergänzt FRED (das nur US kann). BEWUSST KONSERVATIV: nur eindeutige Kategorien, deren
// Mapping gegen echte Werte verifiziert wurde (Stand Session 6). Mehrdeutiges (GDP-Maße,
// Core vs. Headline, SA/NSA) bleibt absichtlich draußen — sonst Mis-Fill-Risiko fürs
// Selbstlernen (siehe CLAUDE.md, Session 5: StatCan-CPI reproduzierte CAD-Werte falsch).
//
// Regeln: nur High-Impact, nur LEERE actual (nie überschreiben -> FRED/manuell haben Vorrang),
// exaktes Datum (YYYY-MM-DD) + Währung + Kategorie, markiert mit notiz "auto:TV <kat>".

// Kategorie aus einem ForexFactory-Historie-Titel (verifizierte, eindeutige Fälle):
function ffKategorie(titel) {
  if (/Policy Rate|Cash Rate|Official Bank Rate|Overnight Rate|Federal Funds Rate|Main Refinancing Rate|Bank Rate/i.test(titel)) return "rate";
  if (/^CPI y\/y$/i.test(titel)) return "cpiYoY";
  if (/^Unemployment Rate$/i.test(titel)) return "unemployment";
  if (/^Retail Sales m\/m$/i.test(titel)) return "retailMoM";
  return null;
}
// Kategorie aus einem TradingView-Titel:
function tvKategorie(titel) {
  if (/Interest Rate Decision/i.test(titel)) return "rate";
  if (/^Inflation Rate YoY/i.test(titel)) return "cpiYoY";
  if (/^Unemployment Rate/i.test(titel)) return "unemployment";
  if (/^Retail Sales MoM/i.test(titel)) return "retailMoM";
  return null;
}

export async function fuelleTvIstwerte(historie, { tage = 14 } = {}) {
  const bis = new Date();
  const von = new Date(bis.getTime() - tage * 864e5);
  const url = `https://economic-calendar.tradingview.com/events?from=${von.toISOString()}&to=${bis.toISOString()}`
            + `&countries=US,EU,GB,JP,CH,CA,AU,NZ,CN`;
  let rows;
  try {
    const res = await fetch(url, { headers: { "Origin": "https://www.tradingview.com", "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = (await res.json()).result || [];
  } catch (err) {
    return { skipped: true, grund: err.message, gefuellt: [] };
  }

  // TradingView-Werte nach Schlüssel  datum|waehrung|kategorie  ablegen (nur mit Ist-Wert).
  const tvWerte = new Map();
  for (const e of rows) {
    if (e.importance !== 1 || e.actual === null || e.actual === undefined) continue;
    const kat = tvKategorie(e.title || "");
    if (!kat) continue;
    const ccy = e.currency || e.country;
    const tag = String(e.date).slice(0, 10);
    tvWerte.set(`${tag}|${ccy}|${kat}`, e.actual);
  }

  const gefuellt = [];
  for (const ev of Object.values(historie.events)) {
    if (ev.impact !== "High") continue;
    if (ev.actual !== null && ev.actual !== "" && ev.actual !== undefined) continue;  // nie überschreiben
    const kat = ffKategorie(ev.titel);
    if (!kat) continue;
    const tag = String(ev.datum).slice(0, 10);
    const wert = tvWerte.get(`${tag}|${ev.land}|${kat}`);
    if (wert === undefined) continue;
    ev.actual = `${wert}%`;                          // alle abgedeckten Kategorien sind Prozent
    ev.notiz = `auto:TV ${kat} (${tag})`;
    gefuellt.push({ datum: tag, land: ev.land, titel: ev.titel, wert: ev.actual });
  }
  return { skipped: false, gefuellt };
}

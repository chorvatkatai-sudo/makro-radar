// kurslevel.mjs — technische Kurslevel je Major-Paar aus Yahoo-Tageskerzen:
// nächster Widerstand (Swing-Hoch über Preis), nächster Support (Swing-Tief unter Preis)
// und ATR14 (übliche Tagesbewegung). Für TP/SL-Orientierung in den Telegram-Signalen.
// KEYLESS. Bewusst einfache Fraktal-Pivots — robuste, nachvollziehbare Levels statt Magie.

const SYMBOL = {
  "EUR/USD": "EURUSD=X", "GBP/USD": "GBPUSD=X", "USD/JPY": "USDJPY=X", "AUD/USD": "AUDUSD=X",
  "USD/CAD": "USDCAD=X", "USD/CHF": "USDCHF=X", "NZD/USD": "NZDUSD=X",
};

async function holeKerzen(symbol) {
  for (const host of ["query1", "query2"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const r = (await res.json())?.chart?.result?.[0];
      const q = r?.indicators?.quote?.[0];
      if (!q) continue;
      const n = r.timestamp.length, hi = [], lo = [], cl = [];
      for (let i = 0; i < n; i++) {
        if (q.high[i] == null || q.low[i] == null) continue;
        hi.push(q.high[i]); lo.push(q.low[i]); cl.push(q.close[i] ?? q.high[i]);
      }
      if (hi.length > 20) return { hi, lo, cl };
    } catch { /* naechster Host */ }
  }
  return null;
}

// Fraktal-Pivots: high[i] groesser/gleich seine 2 Nachbarn je Seite (analog low).
function pivots(arr, istHoch) {
  const out = [];
  for (let i = 2; i < arr.length - 2; i++) {
    const f = arr[i];
    const ok = istHoch
      ? f >= arr[i-1] && f >= arr[i-2] && f >= arr[i+1] && f >= arr[i+2]
      : f <= arr[i-1] && f <= arr[i-2] && f <= arr[i+1] && f <= arr[i+2];
    if (ok) out.push(f);
  }
  return out;
}

export async function holeKurslevel(paar) {
  const sym = SYMBOL[paar];
  if (!sym) return null;
  const k = await holeKerzen(sym);
  if (!k) return null;
  const preis = k.cl[k.cl.length - 1];
  const phoch = pivots(k.hi, true), ptief = pivots(k.lo, false);
  // naechster Widerstand = kleinstes Swing-Hoch ueber dem Preis; Support = groesstes Swing-Tief darunter
  const ueber = phoch.filter(h => h > preis).sort((a, b) => a - b);
  const unter = ptief.filter(l => l < preis).sort((a, b) => b - a);
  const widerstand = ueber[0] ?? Math.max(...k.hi);
  const support = unter[0] ?? Math.min(...k.lo);
  // ATR14 (mittlere Tagesspanne der letzten 14 Tage)
  const m = Math.min(14, k.hi.length);
  let spanne = 0; for (let i = k.hi.length - m; i < k.hi.length; i++) spanne += k.hi[i] - k.lo[i];
  const atr = spanne / m;
  return { preis, widerstand, support, atr };
}

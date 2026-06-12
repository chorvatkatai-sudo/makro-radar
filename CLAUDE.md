# CLAUDE.md - MAKROÖKONOMIE FOREX

## Kontext-Hygiene (WICHTIG)
Dieses Projekt ist EIGENSTÄNDIG. Keine Konzepte, Konventionen, Pfade oder Erinnerungen aus ANDEREN Projekten übernehmen oder hineininterpretieren — auch nicht aus der FOREX APP (das ist ein separates Projekt mit eigenem Backtester!). Was nicht hier oder im Code dieses Ordners steht, gehört nicht zu diesem Projekt. Bei Unklarheit: nachfragen statt aus fremden Projekten ableiten.

## Projektwissen

### Auftrag (Session 1, 2026-06-12)
Forex-Makro-Dashboard für den User (Trader, will alles KINDERLEICHT erklärt — "wie für einen 6-Jährigen", kein Fachchinesisch, alles auf Deutsch):
- Täglich: Was steht heute an (nur High-Impact relevant), was bedeutet es, Auswirkung auf Währungspaare, bullish/bearish-Stimmung
- **Freitags: Wochenausblick + Claudes persönliche Einschätzung zu kommenden Zahlen (wie fällt sie aus? was passiert wenn höher/niedriger?)**
- Alles dauerhaft speichern (Gedächtnis) um Prognosen über Zeit zu verbessern

### Architektur (steht seit Session 1)
- `START.bat` → `scripts/fetch-kalender.mjs` (Node 24, kein Python!) → `dashboard/index.html`
- Datenquelle 1: ForexFactory-Feed `https://nfs.faireconomy.media/ff_calendar_thisweek.json` (kostenlos; NUR aktuelle Woche, KEINE Ist-Werte, nächste Woche existiert NICHT als Feed → 404)
- Datenquelle 2: TradingView `https://economic-calendar.tradingview.com/events?from=…&to=…&countries=US,EU,GB,JP,CH,CA,AU,NZ,CN` mit Header `Origin: https://www.tradingview.com` (kostenlos; nächste Woche + IST-WERTE nach Veröffentlichung; importance 1=High; Feld `currency` = Währungscode). Wird vom fetch-Skript für die „Nächste Woche"-Sektion genutzt (`daten/naechste-woche.json`). Könnte künftig auch Ist-Werte automatisch füllen (noch nicht gebaut — Titel weichen von FF ab, z.B. „Inflation Rate YoY" statt „CPI y/y")
- Gedächtnis: `daten/historie.json` (append-only, actual/notiz werden nie überschrieben). Ist-Werte nachtragen: `node scripts/setze-ist-wert.mjs <LAND> <TITEL-REGEX> <WERT> [DATUM-PREFIX]`
- Briefing: Claude schreibt `daten/briefing-aktuell.json` (Schema: datum, typ, titel, lage[], waehrungen{code:{stimmung:bullisch|bärisch|neutral,grund}}, wochenausblick{text[],termine[]}, prognosen[{event,termin,prognoseMarkt,meineEinschaetzung,wennHoeher,wennNiedriger}], lehren[]), archiviert Kopie nach `daten/briefing-archiv/`, dann `node scripts/fetch-kalender.mjs --lokal` zum Neubauen von data.js
- Erklärungen: `scripts/lexikon.json` (Regex-Muster → kinderleichte DE-Erklärung)
- Dashboard lokal testen: file:// ist im Playwright blockiert → Mini-Node-HTTP-Server auf Port 8377

### Session-Workflow für Briefings
1. `node scripts/fetch-kalender.mjs` (frische Kalenderdaten)
2. Websuche: Ist-Werte der letzten Tage + aktuelle Makro-Lage (+ freitags: nächste Woche, CME FedWatch)
3. Ist-Werte via setze-ist-wert.mjs nachtragen
4. briefing-aktuell.json schreiben + archivieren, `--lokal` neu bauen
5. Status hier in CLAUDE.md aktualisieren

### Status nach Session 1 (2026-06-12)
- System komplett gebaut und verifiziert (Screenshot-Test ok). Erstes Freitags-Briefing live.
- Makro-Lage: Nahost-Krieg → Öl-Schock. US-CPI 4,2% y/y (Core nur 0,2% m/m — zahm!), EZB hat erstmals seit 2023 ERHÖHT (2,40%), BOC hält 2,25%, UK-BIP -0,1%. Fed-Chef ist jetzt Kevin Warsh (seit Mai 2026).
- Nächste Woche (15.–19.6.): Superwoche — RBA+BOJ Di, UK-CPI+US-Retail+FOMC Mi (Warshs Debüt, 97% Halten bei 3,50–3,75%), SNB+BOE Do, Fr US-Feiertag (Juneteenth). WICHTIG: TradingView-Konsens erwartet BOJ-ERHÖHUNG auf 1,00% (andere Quellen: Halten) — Briefing-Prognose entsprechend auf „Erhöhung" angepasst, Auflösung Di 16.6. prüfen!
- TODO nächste Session: Ist-Werte UoM Consumer Sentiment (Fr 12.6.) nachtragen; Superwoche-Ergebnisse einpflegen; prüfen ob Prognosen eintrafen (lehren[] füllen)

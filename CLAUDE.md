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
- Briefing: Claude schreibt `daten/briefing-aktuell.json` (Schema: datum, typ, titel, lage[], waehrungen{code:{stimmung:bullisch|bärisch|neutral, **score** (ganzzahl -100..+100, meine Makro-Einschätzung für die Währung), grund}}, **paare[{paar:"EUR/USD", score:-100..+100 aus Sicht der Basiswährung (+ = Basis wird stärker = bullish fürs Paar, − = bearish), treiber (kurzer Makro-Grund)}]**, wochenausblick{text[],termine[]}, prognosen[{event,termin,prognoseMarkt,meineEinschaetzung,wennHoeher,wennNiedriger}], lehren[]), archiviert Kopie nach `daten/briefing-archiv/`, dann `node scripts/fetch-kalender.mjs --lokal` zum Neubauen von data.js
- **Major-Paare-Übersicht (oben im Dashboard, seit Session 2):** `dashboard/index.html` rendert aus `briefing.paare` die 7 Major-Paare (EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF, NZD/USD) als Bull/Bear-%-Karten (grün=bullish, rot=bearish), sortiert nach Signalstärke. Umrechnung: bullPct = 50 + score/2. Fehlt `paare`, wird je Paar aus den Währungs-`score`s berechnet (Basis − Gegenwährung, /2); fehlt auch `score`, Fallback aus `stimmung` (bullisch=+40/bärisch=−40/neutral=0). Am Handy sind die Karten kompakt — Begründung erst beim Antippen. **Jedes Freitags-Briefing soll `paare` füllen, damit das Scoring mit den gesammelten Daten über die Zeit besser wird.**
- Erklärungen: `scripts/lexikon.json` (Regex-Muster → kinderleichte DE-Erklärung)
- Dashboard lokal testen: file:// ist im Playwright blockiert → Mini-Node-HTTP-Server auf Port 8377

### Automatisierung (seit 2026-06-12)
- GitHub-Repo: `https://github.com/chorvatkatai-sudo/makro-radar` (**ÖFFENTLICH** seit 2026-06-12 wegen GitHub Pages — NIE Tokens/persönliche Daten committen; `.claude/` ist gitignored). Lokale Commits laufen unter der GitHub-noreply-Adresse (E-Mail-Privacy aktiv!). gh-CLI installiert unter `C:\Program Files\GitHub CLI\gh.exe`.
- **Handy-Webseite (GitHub Pages): https://chorvatkatai-sudo.github.io/makro-radar/** — wird aus `main` gebaut. Deshalb ist `dashboard/data.js` NICHT mehr gitignored, sondern wird committet (von Routine UND lokalen Sessions nach jedem Briefing!). START.bat verwirft lokale data.js-Änderungen vor dem Pull (Konfliktvermeidung).
- Cloud-Routine „Makro-Radar Freitags-Briefing" (`trig_01UsiZ86wkEZPCQpoA8JoVJu`, Modell: claude-opus-4-8): jeden Freitag 13:00 UTC (≈15:00 Wien) erstellt ein Cloud-Agent das Freitags-Briefing und pusht nach main. Verwaltung: https://claude.ai/code/routines
- `START.bat` macht vor dem Öffnen `git pull --rebase --autostash` — so landet das Cloud-Briefing automatisch lokal.
- WICHTIG für lokale Sessions: Am Ende committen UND pushen, sonst kollidiert der Freitags-Push des Cloud-Agenten. Generierte Dateien (dashboard/data.js, daten/naechste-woche.json) sind gitignored.

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

### Status nach Freitags-Briefing 2026-06-12 (aktualisierte Version)
- Alle Ist-Werte der Woche eingetragen: Core CPI 0.2% m/m / CPI 4.2% y/y / PPI 1.1% m/m (weit über Prognose!) / Core PPI 0.8% m/m / EUR Leitzins 2.40% / CAD 2.25% / GBP GDP -0.1% / UoM Sentiment 48.9 (beat!) / UoM Inflation Expectations 4.6%
- NEUE MAKRO-LAGE: Iran-Deal unmittelbar bevorstehend (14-Punkte-Entwurf einigt sich, Trump-Unterschrift evtl. dieses Wochenende) → Öl heute -3,4% auf ~$87, insgesamt -20% vom Jahreshoch! Wenn Deal hält → Inflation fällt von selbst.
- Superwoche-Prognosen: BOJ Erhöhung auf 1,00% (97,7%), RBA Halten bei 4,35% (93%), Fed Halten 3,50-3,75% (97,1%) + hawkisher Dot Plot erwartet, SNB Halten bei 0%, BOE Halten bei 3,75%
- NZD GDP: KORREKTUR — ist DONNERSTAG 18.6. (nicht Mittwoch wie in Session 1 irrtümlich vermerkt)
- TODO nächste Session: Superwoche-Ergebnisse einpflegen (BOJ, RBA, Fed, SNB, BOE, UK-CPI, US-Retail, NZD-GDP, UK-Beschäftigung); Iran-Deal-Status prüfen; Prognosen bewerten → lehren[] füllen

### Session-1-Abschluss (2026-06-12, Abend)
- Webseite live und vom User am Handy bestätigt: https://chorvatkatai-sudo.github.io/makro-radar/
- Komplett-Setup steht: Dashboard (lokal + Web), Freitags-Routine (Opus 4.8, getestet), Gedächtnis, Quellen-Doku. User ist zufrieden.

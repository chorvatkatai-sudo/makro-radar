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
- **Live-Kurse (seit Session 2):** Dashboard holt CLIENT-SEITIG (im Browser, immer frisch beim Öffnen) ECB-Tageskurse von `https://api.frankfurter.dev/v1/` (kostenlos, kein Key, CORS offen). Zeigt je Major-Paar aktuellen Preis + 7-Tage-%-Bewegung (grün/rot). Paarpreis aus EUR-Basis: `eurZu(quote)/eurZu(base)`.
- **Zins-Cockpit (seit Session 2):** `daten/leitzinsen.json` (gepflegt in Sessions/Briefings: satz als Zahl, anzeige, naechste Sitzung, erwartung, richtung rauf|runter|halten). Dashboard zeigt Karten sortiert nach Zinshöhe (Sortierung passiert im Dashboard-Code, JSON-Reihenfolge egal). **Bei jedem Briefing aktuell halten!** (NZD/RBNZ am 2026-06-14 auf 2,25% nachgetragen — Quelle RBNZ, Stand Mai 2026.)
- **Selbstlernen / Treffer-Quote (seit Session 2):** `daten/prognose-historie.json` (append-only). Das Build-Skript speichert je Vorhersage-Woche (= Montag nach briefing.datum) die `paare`-Scores und wertet ABGESCHLOSSENE Wochen online aus: Vorzeichen des Scores vs. echte FX-Bewegung (Mo→Fr via frankfurter), pro Paar Treffer/Fehler → Quote. Wird ins Dashboard als „Treffer-Quote" gebacken. Läuft automatisch beim Online-Lauf (nicht bei `--lokal`).
- **Überraschungs-Momentum (seit Session 2):** Build-Skript zählt je Währung aus `historie.json`, wie oft High-Impact-Ist-Werte über/unter Prognose lagen → Badge in den Stimmungskarten. Wird besser, je mehr Ist-Werte nachgetragen sind.
- Dashboard lokal testen: file:// ist im Playwright blockiert → Mini-Node-HTTP-Server auf Port 8377

### Automatisierung (seit 2026-06-12)
- GitHub-Repo: `https://github.com/chorvatkatai-sudo/makro-radar` (**ÖFFENTLICH** seit 2026-06-12 wegen GitHub Pages — NIE Tokens/persönliche Daten committen; `.claude/` ist gitignored). Lokale Commits laufen unter der GitHub-noreply-Adresse (E-Mail-Privacy aktiv!). gh-CLI installiert unter `C:\Program Files\GitHub CLI\gh.exe`.
- **Handy-Webseite (GitHub Pages): https://chorvatkatai-sudo.github.io/makro-radar/** — wird aus `main` gebaut. Deshalb ist `dashboard/data.js` NICHT mehr gitignored, sondern wird committet (von Routine UND lokalen Sessions nach jedem Briefing!). START.bat verwirft lokale data.js-Änderungen vor dem Pull (Konfliktvermeidung).
- Cloud-Routine „Makro-Radar Freitags-Briefing" (`trig_01UsiZ86wkEZPCQpoA8JoVJu`, Modell: claude-opus-4-8): jeden Freitag 13:00 UTC (≈15:00 Wien) erstellt ein Cloud-Agent das Freitags-Briefing und pusht nach main. Verwaltung: https://claude.ai/code/routines
- Cloud-Routine „Makro-Radar Tages-News" (`trig_011SMeqy1ReQb5YRcenGJSV7`, Modell: claude-opus-4-8, **seit 2026-06-24**): TÄGLICH 05:00 UTC (= 07:00 Wien im Sommer / 06:00 im Winter, da Cron in UTC fix). Schreibt NUR den `tagesnews`-Block (heute/gestern + ggf. paare/waehrungen anpassen), NICHT das volle Wochenbriefing. Konsultiert `prognoseQuote.proPaar` fürs Scoring. Pusht nach main → Handy-Webseite aktualisiert sich morgens von selbst. Die beiden Routinen sind getrennt; freitags laufen ggf. beide (Tages-News früh, Wochenbriefing nachmittags).
- `START.bat` macht vor dem Öffnen `git pull --rebase --autostash` — so landet das Cloud-Briefing automatisch lokal.
- WICHTIG für lokale Sessions: Am Ende committen UND pushen, sonst kollidiert der Freitags-Push des Cloud-Agenten. Generierte Dateien (dashboard/data.js, daten/naechste-woche.json) sind gitignored.

### Session-Workflow für Briefings
1. `node scripts/fetch-kalender.mjs` (frische Kalenderdaten)
2. Websuche: Ist-Werte der letzten Tage + aktuelle Makro-Lage (+ freitags: nächste Woche, CME FedWatch)
3. Ist-Werte via setze-ist-wert.mjs nachtragen
4. briefing-aktuell.json schreiben (inkl. `waehrungen[].score` + `paare[]`!) + archivieren; `daten/leitzinsen.json` aktualisieren; dann ONLINE `node scripts/fetch-kalender.mjs` (wertet abgeschlossene Prognose-Wochen aus) oder `--lokal` zum Neubauen
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

### Session 2 (2026-06-14) — Major-Paare-Scoring, helles Design, Makro-Ausbau
- ruflo/MCPs/Skills aktiviert (laufen auf Session-Ebene; ruflo-DBs `.swarm/`+`*.db` gitignored).
- **Major-Paare-Wochen-Score** ganz oben im Dashboard (7 Paare, bull/bear %, grün/rot, handy-kompakt mit Antippen). Quelle: `briefing.paare` + `waehrungen[].score`.
- **Helles Design als Standard** + ☀/🌙-Umschalter (localStorage). Dunkelmodus erhalten.
- 4 Makro-Features gebaut (alle vom User gewünscht): **Live-Kurse** (frankfurter.dev, client-seitig, 7-Tage-%), **Treffer-Quote/Selbstlernen** (`prognose-historie.json`, Auswertung Score-Vorzeichen vs. echte Bewegung), **Zins-Cockpit** (`leitzinsen.json`), **Überraschungs-Momentum** (aus historie.json).
- Alles getestet (Playwright, Desktop+Handy, hell). Live gepusht.
- NZD/RBNZ-Zinssatz nachgetragen (2,25%, OCR-Quelle RBNZ Mai 2026); Zins-Cockpit sortiert jetzt im Dashboard-Code nach Zinshöhe.
- TODO nächste Session: Superwoche-Ist-Werte nachtragen (füttert Momentum + nach Wochenende erste Treffer-Quote); Prognosen bewerten → lehren[].

### Status nach Freitags-Briefing 2026-06-19 (Cloud-Routine) — REGIME-WECHSEL zum starken Dollar
- **Feeds blockiert:** ForexFactory + TradingView den ganzen Lauf HTTP 403 → Kalender aus letztem Archiv (Woche 7.–13.6.). Superwoche-Events (15.–19.6.) stehen daher NICHT in historie.json, nur im Briefing-Text. Auto-Treffer-Quote (frankfurter) ebenfalls 403 → nicht gelaufen. Briefing per WebSearch recherchiert.
- **Superwoche-Ergebnisse (alle recherchiert):** BOJ ERHÖHT auf 1,00% (Di) ✓ | RBA hält 4,35% ✓ | Fed hält 3,50–3,75% (12:0), aber HAWKISHER Dot-Plot-Schwenk: Median-Zins 2026 von 3,4%→3,8% (jetzt Erhöhung statt Senkung erwartet), PCE-Prognose 2,7%→3,6% — DXY zurück über 100, EUR/USD ~60 Pips runter Richtung 1,15 | UK-CPI 2,8% y/y (kühler als 3,0% erwartet) ABER Dienstleistungen 3,2%→3,7% heiß | US-Retail Mai +0,9% (stark) | SNB hält 0% | BOE hält 3,75% (7:2, 2 wollten ERHÖHEN) | NZ-BIP +0,8% q/q (knapp verfehlt) / +1,5% y/y (Beat).
- **IRAN-DEAL am 19.6. in der Schweiz UNTERSCHRIEBEN** → Öl ~80$ WTI / ~83$ Brent (tiefster Stand seit Anf. März). Disinflationär — aber Fed schaut bewusst drüber hinweg (Falken-Dot-Plot).
- **Makro-Lage jetzt:** Falken-Fed treibt Dollar (Markt preist mögliche Erhöhung im Sept). USD bullisch (+45), EUR/GBP/CHF/CAD/NZD bärisch, JPY/AUD neutral. Paare pro-Dollar ausgerichtet (USD/CAD +32, USD/CHF +24, EUR/USD −28, NZD/USD −26, GBP/USD −24, USD/JPY +16, AUD/USD −18).
- **Prognose-Bilanz Vorwoche:** Notenbank-Calls fast alle getroffen (BOJ/Fed-Dot-Plot/RBA/SNB/BOE ✓), UK-CPI-Schlagzeile daneben (Kern/Services aber wie gewarnt heiß). FX-Paar-Scores der Vorwoche großteils FALSCH (EUR/USD bullish & USD/JPY bärisch — Dollar-Stärke übertönte alles). Lehre im Briefing: Fed-Tag → Dollar-Trend schlägt Einzel-Stories.
- **Nächste Woche (22.–26.6.):** Mo China-LPR + Kanada-CPI, Di Flash-PMIs (DE/EU/UK/US), Mi Australien-CPI, Do **US-PCE (DAS Event, Lieblings-Inflationswert der Fed)** + Australien-Jobs + US-BIP final, Fr Japan/Tokio-CPI.
- **TODO nächste lokale Session:** Sobald Feeds wieder gehen, Superwoche-Ist-Werte via setze-ist-wert.mjs nachtragen (BOJ 1,00%, Fed-Hold, RBA 4,35%, SNB 0%, BOE 3,75%, UK-CPI 2,8%, US-Retail +0,9%, NZ-BIP +0,8%); danach Online-Lauf für Treffer-Quote; PCE-Ergebnis (Do) bewerten → lehren[].

### Session 3 (2026-06-24, Mi) — Tagesüberblick-Button + Ist-Zustand-Auswertung
- **Feeds gehen wieder** (FF + TradingView 200): Online-Lauf erfolgreich, 88 Events Woche ab 21.6. in historie. Auto-Treffer-Quote lief: **Vorhersage-Woche 15.6. ausgewertet → nur 1/7 Paare richtig** (bestätigt die Lehre: die Pro-EUR/Anti-USD-Scores der 12.6.-Woche lagen falsch, Dollar-Stärke übertönte alles). Erste echte Quote ist jetzt im Dashboard.
- **NEUES FEATURE — Tagesüberblick „Heutige News" (Auftrag des Users):** Prominenter Button oben im Dashboard (unter dem Untertitel, vor den Major-Paaren) klappt eine Box auf mit: was ist HEUTE passiert, was GESTERN/davor, ein kurzer Tenor + kompakte Bull/Bear-Leiste aller 7 Paare. Datenquelle: neuer Block `briefing.tagesnews { stand, wochentag, tenor, heute[], gestern[] }`. Standard offen, Auf-/Zu-Zustand in localStorage (`makro-tagnews`). Paar-Leiste nutzt dieselben Scores wie die Major-Paare-Sektion (`paarliste`). Getestet (Playwright Desktop+Mobile 390px: Spalten einspaltig, Toggle+Persistenz, 7 Karten ok).
- **Schema-Erweiterung:** `briefing-aktuell.json` hat jetzt optional `tagesnews` (für tägliche Updates, ohne das Freitags-Wochenbriefing zu überschreiben). briefing.datum bleibt 19.6. (= Wochenbasis, damit das Selbstlern-Recording sauber bleibt); `tagesnews.stand` ist der Tages-Frischemarker.
- **Ist-Zustand 24.6.:** Dollar regiert (DXY ~101, 13-Mon-Hoch). Mo Kanada-CPI HEISS 3,2% y/y (nur Benzin, Kern ~2% am Ziel, BOC schaut drüber hinweg). Di Flash-PMIs = US-Industrie 55,7 (stark) vs. EZ 49,5 / DE 48,0 / UK-Services 48,7 (schrumpfen) → Dollar-Schub. Mi (heute) Australien-CPI Schlagzeile 4,0% (kühl) ABER Trimmed Mean 3,6% (heiß, höchster seit Sept 24). USD/JPY ~161,5 → JP-Finanzministerium warnt vor INTERVENTION. **Do 25.6. US-PCE = DAS Event.**
- **Paar-Updates heute:** USD/JPY +16→+12 (Interventionsrisiko deckelt), AUD/USD −18→−12 (klebriger Kern stützt RBA). Sonst pro-Dollar wie Freitag (hielt diese Woche).
- **Ist-Werte gesetzt:** CAD CPI m/m 0,5% + Median 2,1% + Trimmed 2,0%; AUD CPI y/y 4,0% / m/m −0,7% / Trimmed Mean m/m 0,5%. (Achtung: setze-ist-wert-Regex ist UNANKERED → „CPI m/m" traf auch „Core/Trimmed CPI m/m"; für punktgenau `^…$` nutzen.)
- **TODO nächste Session:** Morgen (Do) US-PCE-Ergebnis bewerten → lehren[] + tagesnews aktualisieren; Superwoche-Ist-Werte (15.–19.6.) noch immer offen (Events nicht im aktuellen Feed — ggf. manuell als Historie-Einträge anlegen).

### Session 3b (2026-06-24) — Treffer-Quote PRO PAAR ins Scoring (Rückkopplung)
- Build-Skript berechnet jetzt `prognoseQuote.proPaar` = je Major-Paar Treffer/Gesamt/Quote über ALLE ausgewerteten Wochen + `konfidenz`-Stufe (`neu` 0 Wo / `duenn` <3 Wo / `niedrig` ≤40% / `mittel` / `hoch` ≥60%) + `letzte[]` (max 6).
- Dashboard zeigt an JEDER Major-Paar-Karte eine **Track-Record-Zeile** („📊 Treffer-Quote dieses Paars: X% (t/g)", grün/rot/grau) und — erst ab belastbarer Stichprobe (nicht `duenn`) — einen **Konfidenz-Chip** neben dem Paarnamen (🎯 verlässlich / ⚠ nur X%). Bei zu wenig Daten ehrlich „noch dünn".
- **Bewusste Design-Entscheidung:** Die Bull/Bear-% (= meine Makro-Überzeugung) werden NICHT heimlich verbogen; die historische Verlässlichkeit wird transparent DANEBEN gezeigt. Beim Briefing-Schreiben soll ich proPaar konsultieren (Paare mit schlechtem Track-Record vorsichtiger/näher an 0 scoren). Aktuell n=1 Woche → alle „dünn", noch nicht aussagekräftig (ab ~4–5 Wochen).
- Getestet (Playwright): 7 Track-Zeilen, GBP/USD 100% (1/1), Rest 0%, Chips korrekt ausgeblendet solange dünn.

### Session 3 — Abschluss (2026-06-24, Abend)
- **Tägliche Tages-News-Cloud-Routine eingerichtet** (`trig_011SMeqy1ReQb5YRcenGJSV7`, opus-4-8, 05:00 UTC = 07:00 Wien): aktualisiert ab jetzt die News (heute/gestern + Bull/Bear) AUTOMATISCH jeden Morgen → User muss nicht mehr pro Tag eine Session starten. Erster Lauf: Do 25.6. ~07:02 Wien (= US-PCE-Tag). Details im Automatisierungs-Abschnitt oben.
- **GitHub-Pages-Build-Fix:** Die Pages-Builds nach b43acc0 standen erst auf `errored` („Page build failed.", transienter Jekyll-Fehler). `.nojekyll` ins Root committet (`10df8bb`) → Jekyll wird übersprungen, Deploys laufen verlässlich durch (wichtig wegen täglichem Routine-Push). Live-Seite verifiziert: `proPaar` + `tagesnews` (Stand 24.6.) sind online. Deploy-Status prüfbar via `gh api repos/chorvatkatai-sudo/makro-radar/pages/builds/latest`.
- **Stand der Daten heute:** starker Dollar (DXY ~101), USD/JPY ~161,5 mit Interventionsrisiko, AUD-Kern heiß (3,6%), Kanada-CPI 3,2% (nur Benzin). Briefing-Paare pro-Dollar; USD/JPY +12, AUD/USD −12.
- **Treffer-Quote bisher:** KW25 (Vorhersage ab 15.6.) = 1/7; KW26 (ab 22.6.) läuft, Auswertung nach Freitag.
- **Offene TODOs:** (1) Morgen US-PCE-Ergebnis bewerten → lehren[] (macht jetzt die Routine, ggf. prüfen ob sauber). (2) Superwoche-Ist-Werte 15.–19.6. fehlen weiter in historie (Events nicht im Feed). (3) Cron im Winter ggf. auf 06:00 UTC umstellen, damit 07:00 Wien bleibt.

# QUELLEN — Kostenlose Forex-Recherche

## Deine bestehenden Quellen
| Quelle | Was | Link |
|---|---|---|
| ForexFactory | Kalender (High Impact), Prognosen, Historie | forexfactory.com/calendar |
| FinancialJuice | Live-Newsfeed (Squawk) | financialjuice.com |
| Investing.com | Kalender + News | investing.com |
| MUFG FX | Bank-Research FX | mufgresearch.com/fx |
| ING Think | Bank-Research Makro/FX | think.ing.com |
| Danske Bank | Research (stark bei EUR/Skandi) | research.danskebank.com |
| Rabobank | Research | rabobank.com/knowledge |
| Scotiabank | Research (stark bei CAD) | gbm.scotiabank.com |
| Wells Fargo | US-Makro-Research | wellsfargo.com |

## Neue Empfehlungen — Bankberichte (kostenlos)
| Quelle | Stärke | Link |
|---|---|---|
| **Nordea e-Markets** | EUR, Skandi-Währungen, gute Makro-Previews | corporate.nordea.com/research |
| **SEB Research** | Skandi + G10-Makro | seb.se → Research / webbresearch.seb.se |
| **Swedbank Research** | Makro-Ausblicke | swedbank.com/research |
| **CIBC Capital Markets** | CAD-Spezialist Nr. 1 | cibccm.com/en/insights |
| **National Bank of Canada** | CAD-Makro | nbc.ca → Economic Analysis |
| **ANZ Research** | AUD/NZD/Asien | anz.com/institutional/insights |
| **Westpac IQ** | AUD/NZD, sehr gute Wochenausblicke | westpaciq.westpac.com.au |
| **NAB Markets Research** | AUD-Makro | business.nab.com.au → Markets Research |
| **Commerzbank Research** | EUR-Makro (Teile frei) | commerzbank.com → Research |
| **CaixaBank Research** | EUR-Peripherie | caixabankresearch.com |

## Neue Empfehlungen — Daten & Tools (kostenlos)
| Tool | Wofür | Link |
|---|---|---|
| **CME FedWatch** | Was der Markt für die Fed einpreist (Zins-Wahrscheinlichkeiten) — PFLICHT vor jedem FOMC | cmegroup.com → FedWatch |
| **ECB Watch** | Dasselbe für die EZB | ecb-watch.eu |
| **FRED (St. Louis Fed)** | Riesiges kostenloses US-Datenarchiv mit Charts + API — perfekt für unsere Historie | fred.stlouisfed.org |
| **Trading Economics** | Kalender + historische Daten aller Länder | tradingeconomics.com |
| **Forexlive** | Schnelle, ehrliche Markt-Kommentare (von Tradern für Trader) | forexlive.com |
| **FXStreet** | Kalender + Analysen + Previews | fxstreet.com |
| **Econoday** | US-Kalender mit sehr guten Erklärungen je Indikator | us.econoday.com |
| **DailyFX/IG** | Sentiment-Daten (wie sind Retail-Trader positioniert?) | dailyfx.com |
| **Original-Quellen** | BLS (US-Jobs/CPI), BEA (US-BIP), Eurostat, ONS (UK) — die Zahlen 30 Sek. vor den News-Seiten | bls.gov, bea.gov, ec.europa.eu/eurostat, ons.gov.uk |
| **Zentralbanken direkt** | Reden-Kalender + Statements: federalreserve.gov, ecb.europa.eu, bankofengland.co.uk, boj.or.jp, bankofcanada.ca, snb.ch, rba.gov.au, rbnz.govt.nz | — |

## Automatisierte Quellen des Dashboards
- **ForexFactory JSON-Feed** (kostenlos, ohne Anmeldung): `https://nfs.faireconomy.media/ff_calendar_thisweek.json`
  - Enthält: Termin, Land, Impact, Prognose, Vorwert — aber NUR die aktuelle Woche, KEINE Ist-Werte
- **TradingView-Kalender-API** (kostenlos, ohne Anmeldung): `https://economic-calendar.tradingview.com/events?from=...&to=...&countries=US,EU,GB,JP,CH,CA,AU,NZ,CN`
  - Header `Origin: https://www.tradingview.com` mitsenden
  - Liefert: beliebige Zeiträume (auch nächste Woche!), Prognose, Vorwert und nach Veröffentlichung auch IST-WERTE
  - importance: 1 = High, 0 = Medium, -1 = Low; `currency` = Währungscode direkt
- **Yahoo Finance Chart-API** (kostenlos, OHNE Schlüssel) — Markt-Kompass: `https://query1.finance.yahoo.com/v8/finance/chart/<symbol>?range=1mo&interval=1d` (Fallback `query2`, `User-Agent`-Header setzen)
  - Symbole: DXY `DX-Y.NYB`, VIX `^VIX`, Öl WTI `CL=F` / Brent `BZ=F`, Gold `GC=F`, US-Renditen `2YY=F`/`^TNX`/`^TYX`, Bitcoin `BTC-USD`
  - Achtung: Renditen-Indizes `^TNX`/`^TYX` liefern den Prozentwert teils ×10 (42,5 statt 4,25) → in `marktdaten.mjs` bei Wert>25 ÷10 normalisiert
  - Geholt von `scripts/marktdaten.mjs`, gespeichert in `daten/marktdaten.json`
- **CFTC COT** (Commitments of Traders, kostenlos, OHNE Schlüssel) — Großspekulanten-Positionierung: `https://publicreporting.cftc.gov/resource/6dca-aqww.json` (Socrata, Legacy Futures-Only)
  - Netto-Position der Non-Commercials (long − short) je Währungs-Future (EUR/JPY/GBP/CHF/CAD/AUD/NZD) + Wochenänderung; wöchentlich (Dienstags-Stand, freitags veröffentlicht)
  - Neuestes Datum via `?$order=report_date_as_yyyy_mm_dd DESC&$limit=1`, dann nach `report_date_as_yyyy_mm_dd` filtern
- **FRED-API** (St. Louis Fed, kostenlos MIT Schlüssel) — echte US-Ist-Werte automatisch nachtragen: `https://api.stlouisfed.org/fred/series/observations?series_id=<ID>&api_key=<KEY>&file_type=json`
  - Schlüssel: `FRED_API_KEY` (Env) oder gitignorierte Datei `scripts/.fred-key` — NIE committen (Repo öffentlich). Gratis-Key: https://fredaccount.stlouisfed.org/apikeys
  - Geholt von `scripts/fred.mjs` (im Online-Lauf von fetch-kalender.mjs); füllt nur leere actual-Felder in historie.json, markiert mit `notiz:auto:FRED`
  - Serien-Mapping siehe `INDIKATOREN` in fred.mjs (Core PPI = `WPSFD49116`, NICHT `WPSFD4131`)

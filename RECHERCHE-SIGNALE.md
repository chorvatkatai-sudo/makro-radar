# Tiefenrecherche: Welche Signale verbessern 1-Wochen-FX-Prognosen? (2026-07-10)

Deep-Research über 21 Primärquellen (ECB/Fed-Papers, Journal-Artikel, API-Dokus).
Verifikations-Status je Befund markiert: ✅ = 3-0 adversarial bestätigt · ⚠️ = Quelle
gelesen + Zitat vorhanden, aber Prüfer-Abstimmung am Session-Limit gescheitert ·
❌ = adversarial widerlegt.

## Kernbefunde (was die Evidenz wirklich sagt)

1. **✅ Demut zuerst:** Seit Meese-Rogoff (1983) schlagen Makro-Modelle auf kurzen
   Horizonten kaum einen Random Walk (ECB WP 88). Jedes Signal muss sich an unserer
   eigenen Treffer-Quote gegen die 50%-Linie beweisen — mehr Features ≠ besser.
2. **⚠️ Zins-ERWARTUNGEN sind der am besten belegte kurzfristige Treiber:**
   - Fed-Note 2017: +100bp in den 2J-US-Zinserwartungen ≈ +3,4% Dollar (USD/JPY am
     sensitivsten ~5%); das bilaterale 2J-OIS-Differential wirkt stärker (~6,7%).
   - Fed-Note 2024 (Straffungszyklus 2022): +1Pp relative Zinserwartung ≈ +1,7%
     Aufwertung, R² 0,26.
   - SSRN 4721897: Der „prospektive" (erwartete zukünftige) Zinsvorsprung schlägt
     den aktuellen Carry — vorausschauende Zinspfade > Ist-Zinsdifferenz.
   - **Konsequenz: genau das haben wir am 10.7. gebaut** (2J-Spread-Wochen-Δ je Paar
     als Zins-Tilt + Fed-Erwartung aus ZQ=F). Wichtig: Das ist GLEICHLAUF-Evidenz
     (contemporaneous), keine bewiesene Woche-voraus-Prognosekraft — als Tilt auf
     die Makro-Überzeugung korrekt eingesetzt, nicht als Standalone-Orakel.
3. **✅ 1-Wochen-Preis-Momentum ist das SCHWÄCHSTE getestete Signal** (Sharpe ~0,2;
   4-Wochen-Lookback wäre stärker, Sharpe ~1,05 — aber Studie 1997–2011 inkl. EM).
   ❌ Und post-publication (nach ~2010) ist FX-Faktor-Evidenz generell eingebrochen:
   Carry/Momentum/Value-Sharpe von +0,39 auf −0,32 gekippt; keine Autokorrelation
   mehr in Wochenreturns. **Konsequenz: KEIN Preis-Momentum-Feature bauen.**
4. **❌ Mehr Makro-Faktoren reinstapeln bringt nichts:** Elastic-Net-Studie — über
   Carry/Value/Momentum hinaus verbessert kein Zusatzfaktor (Inflation, Arbeitslosigkeit,
   P/E …) die Prognose. Deckt sich mit Befund 1.
5. **⚠️ Zinskurven-Faktoren (Nelson-Siegel Level/Slope/Curvature je Land):** prognostisch
   nur IN-SAMPLE, Monatsdaten, schlägt out-of-sample keinen Random Walk → höchstens
   Konditionierungs-Signal, kein Edge. Nicht bauen.
6. **⚠️ FX-Options-Risk-Reversals (25-Delta):** Das EINZIGE Options-Signal mit
   dokumentierter Erklärkraft ab 1-Wochen-Horizont (UW-Paper: implizite Skewness
   erklärt bedingte Verteilung der Folgerenditen). ABER: keine gratis/keyless
   Datenquelle gefunden (CME-FX-Options-Quotes sind kostenpflichtig/instabil zu
   scrapen). → Beobachtungsposten; bauen erst, wenn eine freie Quelle auftaucht.
7. **✅ Retail-Sentiment (Myfxbook Community Outlook):** brauchbare Gratis-Quelle
   (Login mit Gratis-Account → Session-Token; IP-gebunden ~1 Monat → pro Runner-Lauf
   frisch einloggen). Long/Short-% je Paar. Für Prognosekraft auf Wochenhorizont gibt
   es KEINE publizierte Evidenz — deshalb bei uns bewusst NUR Anzeige (Contrarian-
   Warnung ab 75%), kein Score-Einfluss, bis das eigene Tracking etwas zeigt.
8. **⚠️ Gratis-Backup-Quellen für Zinsdaten** (falls TradingView-Scanner ausfällt):
   Bank of Canada Valet API (keyless, CA-2J = `BD.CDN.2YR.DQ.YLD`,
   `https://www.bankofcanada.ca/valet/observations/BD.CDN.2YR.DQ.YLD/json`),
   ECB Data Portal (`data-api.ecb.europa.eu/service/data/...`, keyless, vom
   Recherche-Agent empirisch HTTP-200-verifiziert), Bank of England IADB.
   Atlanta-Fed „Market Probability Tracker" als Fed-Pfad-Referenz.

## Priorisierte Empfehlung (Evidenz × Umsetzbarkeit)

| # | Feature | Evidenz | Status |
|---|---------|---------|--------|
| 1 | 2J-Zinsdifferenz-Wochen-Δ je Paar als Zins-Tilt | stark (Fed-Notes, mehrere) | ✅ GEBAUT 10.7. |
| 2 | Fed-Erwartung aus FF-Futures (Umpreisungs-Δ) | stark (2J-Horizont optimal) | ✅ GEBAUT 10.7. |
| 3 | Retail-Sentiment contrarian (Anzeige) | schwach/keine — Experiment | ✅ GEBAUT, wartet auf Account |
| 4 | Risk-Reversals (25Δ) als Skew-Signal | vielversprechend (1-Wo-Horizont!) | ⛔ keine Gratis-Quelle |
| 5 | Preis-Momentum, Carry/Value-Faktoren, Zinskurven-Faktoren, mehr Makro-Reihen | negativ/eingebrochen | ⛔ BEWUSST NICHT bauen |

**Fazit:** Die Recherche bestätigt den eingeschlagenen Weg — Zinserwartungs-Features
sind der am besten belegte Hebel und sind gebaut; der Rest der Kandidatenliste ist
entweder ohne freie Datenquelle (Risk-Reversals) oder empirisch tot (Momentum/Faktoren).
Der größte verbleibende Hebel ist KEIN neues Feature, sondern Disziplin: Treffer-Quote
gegen 50% tracken (läuft), Kalibrierung nutzen (ab 4 Wochen), nichts Unbelegtes ins
Scoring lassen.

# MAKRO-RADAR — Forex-Dashboard

Dein persönliches Makro-Dashboard: Was steht heute an, was bedeutet es (in normalem Deutsch), und wie ist die Stimmung pro Währung.

## Bedienung (das Wichtigste)

0. **Am Handy / unterwegs:** https://chorvatkatai-sudo.github.io/makro-radar/ — zeigt immer den Stand des letzten Briefings (aktualisiert sich automatisch nach jedem Freitags-Lauf). Tipp: Am Handy „Zum Startbildschirm hinzufügen", dann ist es wie eine App.
1. **Doppelklick auf `START.bat`** → holt die aktuellen Kalenderdaten und öffnet das Dashboard im Browser.
2. **Klick auf ein Event** im Dashboard → Erklärung in einfachem Deutsch (was ist das, warum wichtig, was passiert wenn höher/niedriger).
3. **Briefings kommen von Claude:** Starte eine Claude-Code-Session in diesem Ordner und sag z.B.:
   - „Tages-Briefing" → Claude recherchiert die Lage, schreibt das Briefing, trägt Ist-Werte nach
   - „Freitags-Briefing" → zusätzlich Wochenausblick + persönliche Einschätzungen zu kommenden Zahlen

## Struktur

```
START.bat                    ← Doppelklick: aktualisieren + öffnen
dashboard/index.html         ← das Dashboard (öffnet im Browser)
dashboard/data.js            ← generierte Daten (nicht von Hand anfassen)
scripts/fetch-kalender.mjs   ← holt den ForexFactory-Kalender, pflegt das Gedächtnis
scripts/setze-ist-wert.mjs   ← trägt Ist-Werte nach (nutzt Claude in Sessions)
scripts/lexikon.json         ← Begriffs-Erklärungen in einfachem Deutsch
daten/historie.json          ← DAS GEDÄCHTNIS: alle Events, Prognosen, Ist-Werte, Notizen
daten/briefing-aktuell.json  ← das aktuelle Briefing (zeigt das Dashboard an)
daten/briefing-archiv/       ← alle alten Briefings (zum Zurückblättern)
daten/kalender-archiv/       ← Rohdaten jeder Woche
QUELLEN.md                   ← alle kostenlosen Quellen + Empfehlungen
```

## Wie das Gedächtnis funktioniert

- Jeder Lauf von `fetch-kalender.mjs` speichert alle Events dauerhaft in `daten/historie.json` (nichts wird je gelöscht oder überschrieben).
- Ist-Werte trägt Claude in Sessions nach: `node scripts/setze-ist-wert.mjs USD "Core CPI m/m" 0.2%`
- So entsteht über Monate eine eigene Datenbank: Prognose vs. Ist vs. Marktreaktion → Grundlage für immer bessere Einschätzungen.

## Grenzen (ehrlich gesagt)

- ForexFactory liefert nur die aktuelle Woche ohne Ist-Werte. Die **nächste Woche** kommt deshalb vom kostenlosen TradingView-Kalender (eigene Sektion im Dashboard). Ist-Werte der laufenden Woche ergänzt Claude in den Sessions.
- Die Briefings entstehen **nicht automatisch**, sondern wenn du eine Session startest. Empfehlung: morgens kurz „Tages-Briefing", freitags „Freitags-Briefing".
- Einschätzungen (bullisch/bärisch, Prognosen) sind Meinungen auf Datenbasis, keine Anlageberatung.

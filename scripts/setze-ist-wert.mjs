// setze-ist-wert.mjs — Trägt einen Ist-Wert (actual) in daten/historie.json nach.
// Aufruf: node scripts/setze-ist-wert.mjs <LAND> <TITEL-REGEX> <WERT> [DATUM-PREFIX]
// Beispiel: node scripts/setze-ist-wert.mjs USD "Core CPI m/m" 0.2% 2026-06-10

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datei = path.join(ROOT, "daten", "historie.json");
const [land, muster, wert, datumPrefix] = process.argv.slice(2);

if (!land || !muster || !wert) {
  console.log("Aufruf: node scripts/setze-ist-wert.mjs <LAND> <TITEL-REGEX> <WERT> [DATUM-PREFIX]");
  process.exit(1);
}

const historie = JSON.parse(fs.readFileSync(datei, "utf8"));
const re = new RegExp(muster, "i");
const getroffen = [];
for (const e of Object.values(historie.events)) {
  if (e.land === land && re.test(e.titel) && (!datumPrefix || e.datum.startsWith(datumPrefix))) {
    e.actual = wert;
    getroffen.push(e);
    console.log(`OK: ${e.datum} ${e.land} ${e.titel} -> Ist: ${wert}`);
  }
}
if (!getroffen.length) { console.log("Kein passendes Event gefunden."); process.exit(0); }
// Footgun-Schutz: ein unankerter Regex wie "CPI m/m" trifft auch "Core/Trimmed CPI m/m".
// Bei Mehrfachtreffern laut warnen, damit nicht versehentlich der falsche Wert gesetzt wird.
if (getroffen.length > 1) {
  console.warn(`\n⚠ WARNUNG: Muster "${muster}" hat ${getroffen.length} Events getroffen (alle auf ${wert} gesetzt!).`);
  console.warn("  Falls nur EINES gemeint war, exakt ankern, z. B.:  ^CPI m/m$");
  console.warn("  Getroffene Titel: " + getroffen.map(e => `"${e.titel}"`).join(", "));
}
fs.writeFileSync(datei, JSON.stringify(historie, null, 2));

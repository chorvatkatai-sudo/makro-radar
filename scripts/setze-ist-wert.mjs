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
let treffer = 0;
for (const e of Object.values(historie.events)) {
  if (e.land === land && re.test(e.titel) && (!datumPrefix || e.datum.startsWith(datumPrefix))) {
    e.actual = wert;
    treffer++;
    console.log(`OK: ${e.datum} ${e.land} ${e.titel} -> Ist: ${wert}`);
  }
}
if (!treffer) console.log("Kein passendes Event gefunden.");
fs.writeFileSync(datei, JSON.stringify(historie, null, 2));

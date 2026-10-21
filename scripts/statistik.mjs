// statistik.mjs — der Münzwurf-Test, zentral an einer Stelle.
//
// Warum eigenes Modul (Session 11): Derselbe exakte Binomialtest lag dreimal im
// Projekt (fetch-kalender.mjs für das Zufallsband, event-reaktion.mjs für den
// p-Wert) und FEHLTE genau dort, wo er am meisten geschadet hat: die Konfidenz-
// Stufen je Paar stuften allein nach der Quote ein, ab 3 Wochen Stichprobe. So
// bekam EUR/CHF mit 4 von 5 Treffern das Etikett "hoch / verlässlich" — bei n=5
// ist das statistisch nichts.
//
// Durchgehende Leitlinie des Projekts (siehe CLAUDE.md, Lehre aus Session 10):
// vor jeder Quote fragen, wie viele UNABHÄNGIGE Beobachtungen es wirklich sind.

/** Binomialkoeffizient n über k (multiplikativ, kein Overflow bei unseren Größen). */
const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };

/**
 * Zweiseitiger EXAKTER Binomial-p-Wert gegen eine faire Münze (p=0,5).
 * Summiert alle Ergebnisse, die mindestens so unwahrscheinlich sind wie das
 * beobachtete. Ohne diesen Wert liest sich ein "3/4 = 75 %" wie eine Regel,
 * obwohl es vier Münzwürfe sind.
 */
export function binomP(k, n) {
  if (!n) return 1;
  const pmf = i => C(n, i) * Math.pow(0.5, n);
  const schwelle = pmf(k) + 1e-12;
  let p = 0;
  for (let i = 0; i <= n; i++) if (pmf(i) <= schwelle) p += pmf(i);
  return Math.min(1, p);
}

/**
 * 95-%-Trefferband einer fairen Münze bei n Versuchen: [lo, hi].
 * Liegt das Ergebnis INNERHALB, ist es nicht von Zufall zu unterscheiden.
 */
export function zufallsband(n) {
  if (!n) return [0, 0];
  const pmf = i => C(n, i) * Math.pow(0.5, n);
  let lo = 0, hi = n, kum = 0;
  for (let i = 0; i <= n; i++) { kum += pmf(i); if (kum > 0.025) { lo = i; break; } }
  kum = 0;
  for (let i = n; i >= 0; i--) { kum += pmf(i); if (kum > 0.025) { hi = i; break; } }
  return [lo, hi];
}

// Kleinste Stichprobe, die überhaupt signifikant werden KANN: bei n=5 liegt der
// zweiseitige p-Wert selbst bei 5/5 noch bei 0,0625. Alles darunter ist "duenn",
// egal wie gut die Quote aussieht.
export const MIN_AUSSAGEKRAEFTIG = 6;

/**
 * Konfidenz-Etikett für eine Trefferquote — bewusst streng.
 *   "neu"     = noch keine Wertung
 *   "duenn"   = Stichprobe kann per Konstruktion nicht signifikant werden
 *   "mittel"  = genug Fälle, aber nicht von einem Münzwurf zu unterscheiden
 *   "hoch"    = signifikant BESSER als Zufall
 *   "niedrig" = signifikant SCHLECHTER als Zufall (auch das ist eine Information)
 */
export function konfidenzStufe(treffer, gesamt) {
  if (!gesamt) return "neu";
  if (gesamt < MIN_AUSSAGEKRAEFTIG) return "duenn";
  const p = binomP(treffer, gesamt);
  if (p >= 0.05) return "mittel";
  return treffer / gesamt > 0.5 ? "hoch" : "niedrig";
}

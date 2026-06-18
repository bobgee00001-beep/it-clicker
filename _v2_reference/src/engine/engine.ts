// Pure, deterministische Game-Engine. KEINE UI-/Framework-Imports.
// Jede Funktion ist eine reine Transformation des States. Die Engine besitzt
// das Zeitmodell (tick), die UI interpoliert nur.
import { SCALE, type GameState, type GeneratorDef, type AchievementDef } from './types';
import {
  GENERATORS,
  UPGRADES,
  ACHIEVEMENTS,
  ENGINE_VERSION,
  OFFLINE_CAP_MS,
  PRESTIGE_THRESHOLD_SCALED,
  SHARE_MULT_BASE,
  getGenerator,
  getUpgrade,
} from './config';

export function createInitialState(nowMs: number): GameState {
  return {
    cyclesScaled: 0n,
    totalEarnedScaled: 0n,
    clickPowerScaled: 1n * SCALE, // 1 Cycle pro Klick (Basis, vor Upgrades)
    generators: {},
    upgrades: {},
    achievements: {},
    clicks: 0n,
    shares: 0n,
    prodRemainder: 0n,
    lastSavedMs: nowMs,
    version: ENGINE_VERSION,
  };
}

export function genCount(s: GameState, id: string): number {
  return s.generators[id] ?? 0;
}

export function upgradeLevel(s: GameState, id: string): number {
  return s.upgrades[id] ?? 0;
}

// --- Rationale Multiplikatoren (exakt, gcd-reduziert) ---------------------
// Faktoren werden als (num/den)-Rationale komponiert und nach jedem Schritt
// per gcd gekürzt, damit die Zahlen klein bleiben (Sparring deepseek-v4-pro #2:
// unreduzierte Produkte => Bignum-Explosion / Verify-DoS). Multiplikation ist
// kommutativ => Komposition ist reihenfolge-unabhängig => deterministisch.
type Rational = { num: bigint; den: bigint };

function gcdBig(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a === 0n ? 1n : a;
}

function mulReduce(r: Rational, num: bigint, den: bigint): Rational {
  const n = r.num * num;
  const d = r.den * den;
  const g = gcdBig(n, d);
  return { num: n / g, den: d / g };
}

// Komponiert alle gekauften Upgrade-Faktoren nach Wirkungs-Scope. factor wird
// je Level multiplikativ angewandt (Phase 2a: Level 0/1; gestaffelt später).
function multipliers(s: GameState): {
  global: Rational;
  perGen: Record<string, Rational>;
  click: Rational;
} {
  let global: Rational = { num: 1n, den: 1n };
  let click: Rational = { num: 1n, den: 1n };
  const perGen: Record<string, Rational> = {};
  for (const u of UPGRADES) {
    const level = upgradeLevel(s, u.id);
    for (let i = 0; i < level; i++) {
      if (u.target.kind === 'globalProd') {
        global = mulReduce(global, u.factorNum, u.factorDen);
      } else if (u.target.kind === 'click') {
        click = mulReduce(click, u.factorNum, u.factorDen);
      } else {
        const gid = u.target.genId;
        perGen[gid] = mulReduce(perGen[gid] ?? { num: 1n, den: 1n }, u.factorNum, u.factorDen);
      }
    }
  }
  // Freigeschaltete Achievements: permanenter Bonus, gleiche Rational-Komposition.
  for (const a of ACHIEVEMENTS) {
    if ((s.achievements[a.id] ?? 0) < 1) continue;
    if (a.target.kind === 'globalProd') {
      global = mulReduce(global, a.factorNum, a.factorDen);
    } else if (a.target.kind === 'click') {
      click = mulReduce(click, a.factorNum, a.factorDen);
    } else {
      const gid = a.target.genId;
      perGen[gid] = mulReduce(perGen[gid] ?? { num: 1n, den: 1n }, a.factorNum, a.factorDen);
    }
  }
  // Prestige: jede Share = +2% global, als exakter Rational-Faktor.
  if (s.shares > 0n) {
    global = mulReduce(global, SHARE_MULT_BASE + s.shares, SHARE_MULT_BASE);
  }
  return { global, perGen, click };
}

// Achievement-Bedingung prüfen — rein integer, deterministisch.
function achievementMet(s: GameState, a: AchievementDef): boolean {
  const c = a.condition;
  switch (c.kind) {
    case 'totalEarned':
      return s.totalEarnedScaled >= c.atLeastScaled;
    case 'genCount':
      return genCount(s, c.genId) >= c.atLeast;
    case 'totalGenerators': {
      let total = 0;
      for (const def of GENERATORS) total += genCount(s, def.id);
      return total >= c.atLeast;
    }
    case 'shares':
      return s.shares >= c.atLeast;
    case 'clicks':
      return s.clicks >= c.atLeast;
  }
}

// Schaltet neu erfüllte Achievements frei. PURE & IDEMPOTENT (gleicher State -> gleiches
// Ergebnis; doppelte Auswertung schadet nicht). Single-Pass — Achievements lesen nur
// State-Felder, kein Cascade. Wird NUR auf Online-Transitionen aufgerufen (tick, click,
// buy, prestige), NIE im Offline-Pfad (harte Whitelist, Sparring deepseek #3/#4).
export function evaluateAchievements(s: GameState): GameState {
  let unlocked: Record<string, number> | null = null;
  for (const a of ACHIEVEMENTS) {
    if ((s.achievements[a.id] ?? 0) >= 1) continue; // bereits frei -> permanent, nie re-checken
    if (achievementMet(s, a)) {
      if (!unlocked) unlocked = { ...s.achievements };
      unlocked[a.id] = 1;
    }
  }
  return unlocked ? { ...s, achievements: unlocked } : s; // unverändert -> selbe Referenz
}

// Kosten der NÄCHSTEN Einheit, scaled. KANONISCH ist die iterative Rekurrenz:
//   cost_0 = base;  cost_{n+1} = floor(cost_n * growthNum / growthDen)
// d.h. nach JEDEM Schritt wird gefloort — NICHT floor(base * growth^owned).
// Beides divergiert (server: owned=4 -> 17489 hier vs 17490 closed-form). Ein
// Re-Verifier MUSS exakt diese Rekurrenz nachbilden, sonst driften die Kosten.
export function nextCostScaled(def: GeneratorDef, owned: number): bigint {
  let cost = def.baseCostScaled;
  for (let i = 0; i < owned; i++) {
    cost = (cost * def.costGrowthNum) / def.costGrowthDen;
  }
  return cost;
}

// Passive Produktion pro Sekunde (scaled). Nur das ist offline-fähig (Whitelist).
// KANONISCH: ein einziger Floor PRO GENERATOR (Sparring #7 bestätigt) —
//   effRate_g = floor( baseRate_g * count_g * globalNum * genNum / (globalDen * genDen) )
// Multiplikation VOR Division, eine Division je Generator. Reihenfolge-unabhängig.
export function productionPerSecScaled(s: GameState): bigint {
  const m = multipliers(s);
  let rate = 0n;
  for (const def of GENERATORS) {
    const count = BigInt(genCount(s, def.id));
    if (count === 0n) continue;
    const g = m.perGen[def.id] ?? { num: 1n, den: 1n };
    const num = def.baseRateScaled * count * m.global.num * g.num;
    const den = m.global.den * g.den;
    rate += num / den; // ein Floor pro Generator
  }
  return rate;
}

// Effektive Klick-Power = floor( Basis * clickNum / clickDen ). Basis bleibt im
// State; der Multiplikator wird abgeleitet (keine mutierte Effektiv-Zahl).
export function effectiveClickScaled(s: GameState): bigint {
  const m = multipliers(s);
  return (s.clickPowerScaled * m.click.num) / m.click.den;
}

export function click(s: GameState): GameState {
  const gain = effectiveClickScaled(s);
  return evaluateAchievements({
    ...s,
    cyclesScaled: s.cyclesScaled + gain,
    totalEarnedScaled: s.totalEarnedScaled + gain,
    clicks: s.clicks + 1n,
  });
}

export function canAfford(s: GameState, id: string): boolean {
  const def = getGenerator(id);
  if (!def) return false;
  return s.cyclesScaled >= nextCostScaled(def, genCount(s, id));
}

export function buyGenerator(s: GameState, id: string): GameState {
  const def = getGenerator(id);
  if (!def) return s;
  const owned = genCount(s, id);
  const cost = nextCostScaled(def, owned);
  if (s.cyclesScaled < cost) return s;
  return evaluateAchievements({
    ...s,
    cyclesScaled: s.cyclesScaled - cost,
    generators: { ...s.generators, [id]: owned + 1 },
  });
}

export function canAffordUpgrade(s: GameState, id: string): boolean {
  const def = getUpgrade(id);
  if (!def) return false;
  if (upgradeLevel(s, id) >= def.maxLevel) return false; // schon maximal
  return s.cyclesScaled >= def.costScaled;
}

export function buyUpgrade(s: GameState, id: string): GameState {
  const def = getUpgrade(id);
  if (!def) return s;
  const level = upgradeLevel(s, id);
  if (level >= def.maxLevel) return s; // No-Op: bereits maximal
  if (s.cyclesScaled < def.costScaled) return s; // No-Op: zu teuer
  return evaluateAchievements({
    ...s,
    cyclesScaled: s.cyclesScaled - def.costScaled,
    upgrades: { ...s.upgrades, [id]: level + 1 },
  });
}

// Kanonische Produktions-Akkumulation mit Rest-Übertrag. PARTITIONSUNABHÄNGIG:
//   accrue(rate, T, 0) liefert dasselbe Total wie die Summe beliebig vieler
//   accrue-Schritte über T, weil der beim Floor verlorene Sub-Unit-Anteil als
//   `remainder` in den nächsten Schritt getragen wird. Genau das macht
//   Online-Ticks bit-identisch zur Offline-Closed-Form — auch für Raten, die
//   KEIN Vielfaches von 1000n sind (z.B. 333n). Reine Integer-Arithmetik.
export function accrue(
  rateScaled: bigint,
  dtMs: number,
  remainder: bigint,
): { gainScaled: bigint; remainder: bigint } {
  const total = rateScaled * BigInt(Math.trunc(dtMs)) + remainder;
  return { gainScaled: total / 1000n, remainder: total % 1000n };
}

// Produktion über dtMs auf den State anwenden (mit Übertrag). Intern für tick/offline.
function produce(s: GameState, dtMs: number): { state: GameState; gainedScaled: bigint } {
  const rate = productionPerSecScaled(s); // scaled / s
  const { gainScaled, remainder } = accrue(rate, dtMs, s.prodRemainder);
  return {
    state: {
      ...s,
      cyclesScaled: s.cyclesScaled + gainScaled,
      totalEarnedScaled: s.totalEarnedScaled + gainScaled,
      prodRemainder: remainder,
    },
    gainedScaled: gainScaled,
  };
}

// Sim um dtMs vorrücken. Deterministisch gegeben (state, dtMs). Nur passive Produktion.
// Kein Early-Return bei gain==0: der Übertrag muss IMMER fortgeschrieben werden.
export function tick(s: GameState, dtMs: number): GameState {
  if (dtMs <= 0) return s;
  return evaluateAchievements(produce(s, dtMs).state); // Achievement-Eval: NUR online
}

// Offline-Earnings: NUR passive Produktion (harte Whitelist aus DESIGN.md),
// über Δt akkumuliert (gleiche accrue-Logik wie online), gedeckelt. Keine
// Auto-Buyer/Achievements/Zufall offline. Math.trunc gegen fraktionale lastSavedMs.
export function applyOffline(
  s: GameState,
  nowMs: number,
): { state: GameState; gainedScaled: bigint; elapsedMs: number } {
  const elapsedMs = Math.max(0, Math.min(Math.trunc(nowMs - s.lastSavedMs), OFFLINE_CAP_MS));
  const { state: produced, gainedScaled } = produce(s, elapsedMs);
  return { state: { ...produced, lastSavedMs: nowMs }, gainedScaled, elapsedMs };
}

// --- Prestige (IPO-Layer) -------------------------------------------------
// Exakter Integer-Quadratwurzel-Floor (Newton). Deterministisch, kein Float —
// ein Re-Verifier MUSS bit-identisch dieselbe Wurzel ziehen. isqrt(n) = floor(√n).
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError('isqrt: negativ');
  if (n < 2n) return n;
  // Startwert via Bit-Länge (2^ceil(bits/2)), dann Newton bis Fixpunkt.
  let x = 1n << ((BigInt(n.toString(2).length) + 1n) / 2n);
  while (true) {
    const y = (x + n / x) / 2n;
    if (y >= x) break;
    x = y;
  }
  return x;
}

// Shares aus der LIFETIME-Produktion: floor(√(totalEarned / THRESHOLD)).
export function sharesFor(totalEarnedScaled: bigint): bigint {
  if (totalEarnedScaled <= 0n) return 0n;
  return isqrt(totalEarnedScaled / PRESTIGE_THRESHOLD_SCALED);
}

// Zusätzliche Shares bei JETZIGEM Prestige (über die bereits gebankten hinaus).
// Da totalEarnedScaled die Lifetime ist (wird NIE resettet), ist das monoton:
// nach Prestige sofort 0, man muss mehr verdienen für die nächste Share.
export function prestigeGain(s: GameState): bigint {
  const gain = sharesFor(s.totalEarnedScaled) - s.shares;
  return gain > 0n ? gain : 0n;
}

export function canPrestige(s: GameState): boolean {
  return prestigeGain(s) > 0n;
}

// Prestige ("IPO"): bankt die Gain-Shares, resettet den Run (Cycles, Generatoren,
// Upgrades, Übertrag, Klick-Basis). totalEarnedScaled (Lifetime) + shares bleiben.
// Explizite Online-Aktion — kein Offline-Trigger (Whitelist).
export function applyPrestige(s: GameState): GameState {
  const gain = prestigeGain(s);
  if (gain <= 0n) return s; // No-Op: noch nichts zu holen
  const fresh = createInitialState(s.lastSavedMs);
  return evaluateAchievements({
    ...fresh,
    totalEarnedScaled: s.totalEarnedScaled, // Lifetime bleibt
    achievements: s.achievements, // PERMANENT über Prestige (nie zurückgesetzt)
    clicks: s.clicks, // Lifetime-Klicks bleiben
    shares: s.shares + gain,
    version: s.version,
  });
}

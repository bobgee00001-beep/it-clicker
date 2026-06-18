// Kanonische Numerik: alles im autoritativen Pfad ist Integer (bigint) in
// Fixed-Point. SCALE = Untereinheiten pro Cycle. break_infinity wird NUR fürs
// Display benutzt (siehe ../lib/format.ts), nie hier in der Engine.
export const SCALE = 1000n; // milli-cycles

export type Scaled = bigint; // cycles * SCALE

export interface GeneratorDef {
  id: string;
  name: string;
  flavor: string;
  baseCostScaled: Scaled; // Kosten der ersten Einheit
  costGrowthNum: bigint; // Kostenwachstum Zähler (z.B. 115)
  costGrowthDen: bigint; // Kostenwachstum Nenner (z.B. 100) -> 1.15x
  baseRateScaled: Scaled; // Produktion pro Sekunde pro Einheit
}

// Wohin ein Upgrade-Multiplikator wirkt.
export type UpgradeTarget =
  | { kind: 'generator'; genId: string } // boostet einen Generator
  | { kind: 'globalProd' } // boostet alle Generatoren
  | { kind: 'click' }; // boostet Klick-Power

// Upgrades sind EXAKTE rationale Faktoren (factorNum/factorDen), nie Floats.
// factor wird je Level multiplikativ angewandt. Phase 2a: maxLevel=1 (one-time);
// State hält trotzdem ein Level (number), damit gestaffelte Upgrades später
// OHNE State-Migration nachrüstbar sind (Sparring deepseek-v4-pro #8).
export interface UpgradeDef {
  id: string;
  name: string;
  flavor: string;
  costScaled: Scaled; // einmalige Kosten (skaliert nicht)
  maxLevel: number;
  target: UpgradeTarget;
  factorNum: bigint;
  factorDen: bigint;
}

// Achievement-Bedingung — rein integer, deterministisch auswertbar aus dem State.
export type AchievementCondition =
  | { kind: 'totalEarned'; atLeastScaled: bigint }
  | { kind: 'genCount'; genId: string; atLeast: number }
  | { kind: 'totalGenerators'; atLeast: number }
  | { kind: 'shares'; atLeast: bigint }
  | { kind: 'clicks'; atLeast: bigint };

// Achievement = auto-freigeschalteter, PERMANENTER Bonus (exakter Rational-Faktor,
// im selben Multiplier-Stack wie Upgrades/Shares). Trigger NUR online (Whitelist).
export interface AchievementDef {
  id: string;
  name: string;
  flavor: string;
  condition: AchievementCondition;
  target: UpgradeTarget;
  factorNum: bigint;
  factorDen: bigint;
}

export interface GameState {
  cyclesScaled: Scaled;
  totalEarnedScaled: Scaled;
  clickPowerScaled: Scaled; // BASIS-Cycles pro Klick (vor Upgrades; effektiv via effectiveClickScaled)
  generators: Record<string, number>; // id -> Anzahl
  upgrades: Record<string, number>; // id -> gekauftes Level (0 = nicht gekauft)
  achievements: Record<string, number>; // id -> 1 wenn freigeschaltet (permanent)
  clicks: bigint; // Lifetime-Klickzähler (für Klick-Achievements; nie reset)
  // Prestige-Währung ("Shares" / IPO-Layer). Persistiert über Prestige-Resets,
  // gibt einen permanenten globalen Produktions-Multiplikator. Aus der LIFETIME
  // totalEarnedScaled via Integer-sqrt abgeleitet (deterministisch, kein Float).
  shares: bigint;
  // Sub-Unit-Produktions-Übertrag (0..999). Trägt die beim Floor verlorene
  // Teilproduktion in den nächsten Tick — macht die Akkumulation
  // partitionsunabhängig: Summe N kleiner Ticks == ein großer Tick == Offline.
  // INVARIANTE: wird NIE bei Rate-Wechsel (Kauf) resettet, nur bei Full-Reset
  // (Sparring deepseek-v4-pro #5) — sonst bricht Online/Offline-Identität.
  prodRemainder: Scaled;
  lastSavedMs: number; // Wall-Clock des letzten Saves (für Offline-Rechnung)
  version: number;
}

// Deterministische Achievement-Evaluation. Wird von engine.ts konsumiert;
// achievements.ts darf keine engine-Logik importieren (content/config OK).
// Verwendet nur existierende Zustands-Felder — KEINE Date.now()-Abhängigkeit.
import {
  SCALE,
  type GameState,
  type AchievementDef,
  type AchievementCondition,
  type AchievementTarget,
} from './types';
import { ACHIEVEMENTS, UPGRADES } from './config';

/** Rekursive Achievement-Bedingung auswerten. */
export function achievementMet(s: GameState, def: AchievementDef): boolean {
  return evaluateCondition(s, def.condition);
}

function evaluateCondition(s: GameState, c: AchievementCondition): boolean {
  switch (c.kind) {
    case 'threshold': {
      const value = metricValue(s, c.metric);
      if (typeof value === 'bigint') {
        return value >= BigInt(c.threshold);
      }
      return value >= c.threshold;
    }
    case 'composite':
      return c.all.every((child) => evaluateCondition(s, child));
    case 'boolean-flag':
      return booleanFlagValue(s, c.flag);
    case 'timegate':
      return timegateMet(s, c.gate);
    // --- Legacy-Kinds aus v2-Skelett / migration-paths.md §6.2 ----------
    case 'totalEarned':
      return s.totalEarnedScaled >= c.atLeastScaled;
    case 'genCount':
      return (s.generators[c.genId] ?? 0) >= c.atLeast;
    case 'totalGenerators': {
      let total = 0;
      for (const gDef of GENERATORS_FROM_UPGRADES) {
        total += s.generators[gDef.id] ?? 0;
      }
      return total >= c.atLeast;
    }
    case 'shares':
      return s.shares >= c.atLeast;
    case 'clicks':
      return s.clicks >= c.atLeast;
    case 'ticketsResolved':
      return s.ticketsResolved >= c.atLeast;
    case 'ticketsExpired':
      return s.ticketsExpired >= c.atLeast;
    case 'fastTickets':
      return s.fastTickets >= c.atLeast;
    case 'p1AutoClosed':
      return s.p1AutoClosed >= c.atLeast;
    case 'mondayClicks':
      return s.mondayClicks >= c.atLeast;
    case 'sessionClicks':
      return s.sessionClicks >= c.atLeast;
    case 'maxCyclesNoUpgrades':
      return s.maxCyclesWithoutUpgrades >= c.atLeastScaled;
    case 'maxSimultaneousP1':
      return s.maxSimultaneousP1 >= c.atLeast;
    case 'maxSpendIn60s':
      return s.maxSpendIn60s >= c.atLeastScaled;
    case 'successfulDeploys':
      return s.successfulDeploys >= c.atLeast;
    case 'failedDeploys':
      return s.failedDeploys >= c.atLeast;
    case 'rollbacksPerformed':
      return s.rollbacksPerformed >= c.atLeast;
    case 'cleanMonitoringWindows':
      return s.cleanMonitoringWindows >= c.atLeast;
    case 'prestigeCount':
      return s.prestige >= c.atLeast;
    case 'anyUpgradeBought':
      return s.upgradesEverBought;
    case 'pagerDutyTriggered':
      return s.pagerDutyTriggered;
    case 'legacyCodeTriggered':
      return s.legacyCodeTriggered;
    case 'allCategoriesMaxed':
      return s.allCategoriesMaxed;
    case 'sev1Survived':
      return s.sev1Survived;
    case 'migrationMaster':
      return s.passiveEarnedSinceLastClick >= 100_000n * SCALE && s.totalEarnedScaled >= 1_000_000n * SCALE;
    case 'unicornStartup':
      return s.totalEarnedScaled >= 10_000_000n * SCALE && s.sessionPlayTime < 30 * 60 * 1000;
    case 'rollbackReady':
      return s.rollbacksPerformed >= 1 || s.cleanMonitoringWindows >= 1;
    case 'teamLead': {
      for (const wid of c.workerIds) {
        if ((s.upgrades[wid] ?? 0) < 1) return false;
      }
      return true;
    }
    default: {
      // Exhaustiveness-Check: unbekannte Kinds ergeben false, aber TypeScript
      // warnt, falls wir ein Kind vergessen haben.
      const _exhaustive: never = c;
      return Boolean(_exhaustive) && false;
    }
  }
}

// Generator-Defs für totalGenerators-Zählung (kann nicht engine/config
// importieren, da zirkulär; aus UPGRADES mit kind='generator' ableiten).
const GENERATORS_FROM_UPGRADES: { id: string }[] = UPGRADES.filter(
  (u): u is (typeof u) & { target: { kind: 'generator'; genId: string } } => u.target.kind === 'generator',
).map((u) => ({ id: u.target.genId }));

type MetricId =
  | 'clicks'
  | 'totalEarned'
  | 'sessionClicks'
  | 'ticketsResolved'
  | 'ticketsExpired'
  | 'fastTickets'
  | 'p1AutoClosed'
  | 'mondayClicks'
  | 'maxSimultaneousP1'
  | 'successfulDeploys'
  | 'failedDeploys'
  | 'rollbacksPerformed'
  | 'cleanMonitoringWindows'
  | 'prestigeCount'
  | 'shares'
  | 'totalGenerators';

function metricValue(s: GameState, metric: MetricId): bigint | number {
  switch (metric) {
    case 'clicks':
      return s.clicks;
    case 'totalEarned':
      return s.totalEarnedScaled;
    case 'sessionClicks':
      return s.sessionClicks;
    case 'ticketsResolved':
      return s.ticketsResolved;
    case 'ticketsExpired':
      return s.ticketsExpired;
    case 'fastTickets':
      return s.fastTickets;
    case 'p1AutoClosed':
      return s.p1AutoClosed;
    case 'mondayClicks':
      return s.mondayClicks;
    case 'maxSimultaneousP1':
      return s.maxSimultaneousP1;
    case 'successfulDeploys':
      return s.successfulDeploys;
    case 'failedDeploys':
      return s.failedDeploys;
    case 'rollbacksPerformed':
      return s.rollbacksPerformed;
    case 'cleanMonitoringWindows':
      return s.cleanMonitoringWindows;
    case 'prestigeCount':
      return s.prestige;
    case 'shares':
      return s.shares;
    case 'totalGenerators': {
      let total = 0;
      for (const g of GENERATORS_FROM_UPGRADES) total += s.generators[g.id] ?? 0;
      return total;
    }
    default: {
      const _exhaustive: never = metric;
      return Number(_exhaustive);
    }
  }
}

type BooleanFlagId =
  | 'upgradesEverBought'
  | 'sev1Survived'
  | 'pagerDutyTriggered'
  | 'legacyCodeTriggered'
  | 'allCategoriesMaxed';

function booleanFlagValue(s: GameState, flag: BooleanFlagId): boolean {
  switch (flag) {
    case 'upgradesEverBought':
      return s.upgradesEverBought;
    case 'sev1Survived':
      return s.sev1Survived;
    case 'pagerDutyTriggered':
      return s.pagerDutyTriggered;
    case 'legacyCodeTriggered':
      return s.legacyCodeTriggered;
    case 'allCategoriesMaxed':
      return s.allCategoriesMaxed;
    default: {
      const _exhaustive: never = flag;
      return Boolean(_exhaustive);
    }
  }
}

type TimegateId = 'pagerDuty' | 'mondayMorning';

function timegateMet(s: GameState, gate: TimegateId): boolean {
  switch (gate) {
    case 'pagerDuty':
      return s.pagerDutyTriggered;
    case 'mondayMorning':
      return s.mondayClicks >= 100;
    default: {
      const _exhaustive: never = gate;
      return Boolean(_exhaustive);
    }
  }
}

/** Schaltet neu erfüllte Achievements frei. Single-Pass, idempotent, pure. */
export function evaluateAchievements(
  s: GameState,
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
): GameState {
  let unlocked: Record<string, number> | null = null;
  for (const a of defs) {
    if ((s.achievements[a.id] ?? 0) >= 1) continue;
    if (achievementMet(s, a)) {
      if (!unlocked) unlocked = { ...s.achievements };
      unlocked[a.id] = 1;
    }
  }
  return unlocked ? { ...s, achievements: unlocked } : s;
}

/**
 * Aggregierter Multiplikator für einen Target-Typ.
 * @param type - 'click' | 'globalProd' | 'generator:<id>' | 'itsm:...' | 'clickAdd'
 * @returns Faktor als number (z.B. 1.05 für +5%).
 */
export function getAchievementMultiplier(s: GameState, type: string): number {
  let num = 1n;
  let den = 1n;
  for (const a of ACHIEVEMENTS) {
    if ((s.achievements[a.id] ?? 0) < 1) continue;
    const targetKey = targetKeyOf(a.target);
    if (targetKey === type) {
      num *= a.factorNum;
      den *= a.factorDen;
    }
  }
  return Number(num) / Number(den);
}

function targetKeyOf(target: AchievementTarget): string {
  switch (target.kind) {
    case 'generator':
      return `generator:${target.genId}`;
    case 'globalProd':
      return 'globalProd';
    case 'click':
      return 'click';
    case 'clickAdd':
      return 'clickAdd';
    case 'itsm':
      return `itsm:${target.itsmType}`;
    default: {
      const _exhaustive: never = target;
      return String(_exhaustive);
    }
  }
}

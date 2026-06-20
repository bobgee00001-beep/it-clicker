import {
  SCALE,
  type GeneratorDef,
  type UpgradeDef,
  type AchievementDef,
} from './types';

export const ENGINE_VERSION = 5; // v5: v1-State-Shape + Tickets/Achievements/Release/Observability
export const TICK_MS = 100; // Sim-Schrittweite

// --- Prestige (IPO-Layer) -------------------------------------------------
// Shares = isqrt(totalEarnedScaled / PRESTIGE_THRESHOLD_SCALED). Erste Share bei
// 1.000.000 Cycles Lifetime-Ertrag; danach quadratisch teurer (isqrt-Kurve).
export const PRESTIGE_THRESHOLD_SCALED = 1_000_000n * SCALE; // = 1e9 (milli-cycles)
// Jede Share = +2% globale Produktion: Faktor (SHARE_MULT_BASE + shares) / SHARE_MULT_BASE.
export const SHARE_MULT_BASE = 50n;

// Content-Module importieren (keine zirkulären Abhängigkeiten — content/ hat keine engine-Imports).
import {
  GENERATORS as CONTENT_GENERATORS,
  UPGRADES as CONTENT_UPGRADES,
} from '../content/upgrades';
import { ACHIEVEMENTS as CONTENT_ACHIEVEMENTS } from '../content/achievements';
import { TICKET_TITLES, SLA_SECONDS_BY_TYPE } from '../content/tickets';
import { SOUND_THEMES } from '../content/sounds';
import {
  OFFLINE_PENALTY,
  MAX_OFFLINE_SECONDS,
  OFFLINE_MIN_MS,
  OFFLINE_CAP_MS,
  SEV1_THRESHOLD_TICKETS,
  SEV1_TIMER_SECONDS,
  GENESIS_TICKET_INTERVAL_MS,
  TICKET_SPAWN_INTERVAL_MS,
  TICKET_SPAWN_MIN_MS,
  TICKET_SPAWN_MAX_MS,
  TICKET_MAX_OPEN,
  TICKET_SPAWN_CHANCE_P3,
  TICKET_SPAWN_CHANCE_P2,
  SAVE_VERSION,
  PRESTIGE_THRESHOLD_CYCLES,
  RELEASE_STAGES,
  RELEASE_STAGE_DURATION_SECONDS,
  RELEASE_DEPLOY_BONUS_SECONDS,
  MONITORING_WINDOW_SECONDS,
  SHOP_TAB_IDS,
  TAB_NAMES,
  INITIAL_ERROR_BUDGET,
  INITIAL_OBSERVABILITY_SCORE,
  INITIAL_UPTIME,
  INITIAL_ERROR_RATE,
  EVENT_LOG_MAX_ENTRIES,
  BASE_DEPLOY_RISK,
  MAX_DEPLOY_RISK,
  CLEAN_WINDOWS_FOR_QUALITY,
} from '../content/constants';
import {
  REWARD_CYCLES_BY_TYPE,
  TICKET_SPAWN_WEIGHTS,
  MAX_CONCURRENT_TICKETS,
} from '../content/tickets';

export {
  TICKET_TITLES,
  SLA_SECONDS_BY_TYPE,
  SOUND_THEMES,
  OFFLINE_PENALTY,
  MAX_OFFLINE_SECONDS,
  OFFLINE_CAP_MS,
  OFFLINE_MIN_MS,
  SEV1_THRESHOLD_TICKETS,
  SEV1_TIMER_SECONDS,
  GENESIS_TICKET_INTERVAL_MS,
  TICKET_SPAWN_INTERVAL_MS,
  TICKET_SPAWN_MIN_MS,
  TICKET_SPAWN_MAX_MS,
  TICKET_MAX_OPEN,
  TICKET_SPAWN_CHANCE_P3,
  TICKET_SPAWN_CHANCE_P2,
  SAVE_VERSION,
  PRESTIGE_THRESHOLD_CYCLES,
  RELEASE_STAGES,
  RELEASE_STAGE_DURATION_SECONDS,
  RELEASE_DEPLOY_BONUS_SECONDS,
  MONITORING_WINDOW_SECONDS,
  SHOP_TAB_IDS,
  TAB_NAMES,
  INITIAL_ERROR_BUDGET,
  INITIAL_OBSERVABILITY_SCORE,
  INITIAL_UPTIME,
  INITIAL_ERROR_RATE,
  EVENT_LOG_MAX_ENTRIES,
  BASE_DEPLOY_RISK,
  MAX_DEPLOY_RISK,
  CLEAN_WINDOWS_FOR_QUALITY,
  REWARD_CYCLES_BY_TYPE,
  TICKET_SPAWN_WEIGHTS,
  MAX_CONCURRENT_TICKETS,
};

// Runtime-Konstanten: arrays + lookup-Hilfsfunktionen.
export const GENERATORS: GeneratorDef[] = CONTENT_GENERATORS;
export const UPGRADES: UpgradeDef[] = CONTENT_UPGRADES;
export const ACHIEVEMENTS: AchievementDef[] = CONTENT_ACHIEVEMENTS;

export function getGenerator(id: string): GeneratorDef | undefined {
  return GENERATORS.find((g) => g.id === id);
}

export function getUpgrade(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

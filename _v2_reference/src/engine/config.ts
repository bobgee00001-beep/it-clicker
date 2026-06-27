import {
  SCALE,
  type GeneratorDef,
  type UpgradeDef,
  type AchievementDef,
} from './types';

export const ENGINE_VERSION = 6; // v6: + deterministischer Deploy-RNG (SplitMix64, counter-basiert)
export const TICK_MS = 100; // Sim-Schrittweite

// Save-Format-Grenze: ab dieser Version ist `upgrades` kanonisch und enthaelt
// auch hybride IDs (server/vm/ssd), die gleichzeitig Generatoren sind. Vorher
// (v1..v4, "Legacy-Flat") wurden Generator-Kaeufe im `upgrades`-Feld vermischt
// und mussten bei Migration in `generators` umgelenkt werden — danach NICHT
// mehr. Wenn ENGINE_VERSION weiter steigt (v7, v8, ...) bleibt dieser Wert
// FIX auf 5; ein neuer "Legacy"-Cut wuerde eine neue Konstante rechtfertigen.
//
// WICHTIG: Das Migration-Gate (legacyFlat = fromVersion < FIRST_NATIVE_VERSION)
// haengt an DIESER Konstante, NICHT an ENGINE_VERSION. Sonst wuerde ein
// natives v5-Save nach Bump auf ENGINE_VERSION=6 als legacyFlat=true
// klassifiziert und die Generator↔Upgrade-Umlenkung wieder aktiviert —
// exakt die Korruption, die PR #10 (#7416f86) gefixt hat.
export const FIRST_NATIVE_VERSION = 5;

// Default-Seed fuer den deterministischen Deploy-Roll (Phase-3-Leaderboard).
// FIX gewaehlt, damit Saves ohne rngSeed-Feld deterministisch denselben
// Roll-Verlauf haben. Server (Phase 3) kann diesen Wert ueberschreiben
// (Seed-Pinning), aber Client darf ihn nicht selbst waehlen — sonst kann
// ein cheater einen guenstigen Seed suchen.
//
// 64-bit non-zero, exakt in u64-Range (16 Hex-Ziffern = 64 bit, NICHT 80).
// WICHTIG: dieser Wert MUSS <= 2^64-1 sein — sonst kappen & MASK_64 in
// prng.ts stillschweigend die oberen Bits, und ein Server-Validator, der
// rngSeed als literalen State nimmt (ohne mod 2^64), wuerde divergieren.
// Audit-fest: Wert als 0xC0FFEE5EEDC0FFEEn (Hex) = dezimal 13830554477654798062
// (immer unter 2^64 = 18446744073709551616).
export const RNG_DEFAULT_SEED = 0xC0FFEE5EEDC0FFEEn;

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
  HARDWARE_UPGRADES,
  CLOUD_UPGRADES,
  AI_UPGRADES,
  CLICK_UPGRADES,
  ITSM_UPGRADES,
  WORKER_UPGRADES,
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

export const TAB_UPGRADES: Record<(typeof SHOP_TAB_IDS)[number], UpgradeDef[]> = {
  hardware: HARDWARE_UPGRADES,
  cloud: CLOUD_UPGRADES,
  ai: AI_UPGRADES,
  click: CLICK_UPGRADES,
  itsm: ITSM_UPGRADES,
  workers: WORKER_UPGRADES,
};

export function getGenerator(id: string): GeneratorDef | undefined {
  return GENERATORS.find((g) => g.id === id);
}

export function getUpgrade(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

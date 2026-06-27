// Save/Load + Export/Import.
// Pure functions for serialize/deserialize/exportPayload/importPayload.
// localStorage is only touched by clearCorruptSave() and the legacy save()/load()/clearSave() wrappers.
// deserialize/importPayload auto-migrate v1/v2/v3/v4/v5 via migrate.ts.
import { SCALE, type GameState, type Ticket, type SpendEvent } from './types';
import { ENGINE_VERSION, RNG_DEFAULT_SEED } from './config';
import { createEventLog, type EventLog } from './eventLog';
import { migrateSavePayload } from './migrate';
import { toU64 } from './prng';

const KEY = 'it-clicker-v2:save';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isStorageLike(value: unknown): value is StorageLike {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as StorageLike).getItem === 'function' &&
    typeof (value as StorageLike).setItem === 'function' &&
    typeof (value as StorageLike).removeItem === 'function'
  );
}

function getStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && isStorageLike(window.localStorage)) {
      return window.localStorage;
    }
  } catch {
    /* ignore storage access errors */
  }

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  if (descriptor && 'value' in descriptor && isStorageLike(descriptor.value)) {
    return descriptor.value;
  }

  return null;
}

export type ExportPayload = {
  version: number;
  exportedAt: string;
  data: string;
};

export type ImportPayload = {
  version: number;
  data: unknown;
};

// Intern: numeric fields stored as BigInt strings so JSON.stringify works.
const BIGINT_FIELDS: (keyof GameState)[] = [
  'cyclesScaled',
  'totalEarnedScaled',
  'workerEarnedScaled',
  'clickPowerScaled',
  'prodRemainder',
  'clicks',
  'maxSpendIn60s',
  'passiveEarnedSinceLastClick',
  'maxCyclesWithoutUpgrades',
  'shares',
  // Determinismus-Kern (Phase-3 Leaderboard): rngSeed und deployCounter
  // sind bigint und werden wie die Scaled-Felder als String serialisiert.
  // Re-Verifier liest sie via toNonNegBigInt zurueck (in migrate.ts).
  'rngSeed',
  'deployCounter',
];

// Helfer: bestätige number >= 0.
function toNonNegInt(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  return fallback;
}

function toNonNegFloat(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  return fallback;
}

function toBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

// Bestätige SoundThemeId, ReleaseStatus, DeploymentQuality — strikte Whitelists.
function toSoundThemeId(v: unknown, fallback: GameState['selectedSound']): GameState['selectedSound'] {
  const valid: GameState['selectedSound'][] = ['none', 'dialup', 'mechanical', 'retro', 'scifi'];
  if (typeof v === 'string' && (valid as string[]).includes(v)) return v as GameState['selectedSound'];
  return fallback;
}

function toReleaseStatus(v: unknown, fallback: GameState['releaseStatus']): GameState['releaseStatus'] {
  const valid: GameState['releaseStatus'][] = [
    'idle',
    'building',
    'testing',
    'security',
    'deploying',
    'observing',
    'success',
    'failed',
  ];
  if (typeof v === 'string' && (valid as string[]).includes(v)) return v as GameState['releaseStatus'];
  return fallback;
}

function toDeploymentQuality(
  v: unknown,
  fallback: GameState['lastDeploymentQuality'],
): GameState['lastDeploymentQuality'] {
  const valid: GameState['lastDeploymentQuality'][] = ['No deploys yet', 'clean', 'degraded', 'failed', 'rolled back', 'bad'];
  if (typeof v === 'string' && (valid as string[]).includes(v)) return v as GameState['lastDeploymentQuality'];
  return fallback;
}

// Nur nicht-negative Ganzzahl-Strings ("123") oder sichere Integer-Numbers
// werden akzeptiert; alles andere (negativ, "1.5", NaN, >MAX_SAFE als Number,
// Müll) fällt auf den Default zurück.
function toNonNegBigInt(v: unknown, fallback: bigint): bigint {
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  return fallback;
}

// Generatoren auf { id: nicht-negative Ganzzahl } reduzieren.
function sanitizeGenerators(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [id, count] of Object.entries(v as Record<string, unknown>)) {
    if (typeof count === 'number' && Number.isInteger(count) && count >= 0) {
      out[id] = count;
    }
  }
  return out;
}

// Upgrades: nur positive Integer-Level behalten (keine ID-Whitelist hier —
// unbekannte IDs schaden nicht, die Engine ignoriert sie beim Auswerten).
function sanitizeUpgrades(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  const obj = v as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [id, level] of Object.entries(obj)) {
    if (typeof level === 'number' && Number.isInteger(level) && level > 0) {
      out[id] = level;
    }
  }
  return out;
}

// Achievements: jede ID mit positivem Integer-Level gilt als freigeschaltet (=1).
// Keine ID-Whitelist hier — unbekannte IDs werden von der Engine ignoriert.
function sanitizeAchievements(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  const obj = v as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [id, level] of Object.entries(obj)) {
    if (typeof level === 'number' && Number.isInteger(level) && level > 0) {
      out[id] = 1;
    }
  }
  return out;
}

function sanitizeEventLog(v: unknown): EventLog {
  if (v && typeof v === 'object' && 'entries' in v && Array.isArray((v as Record<string, unknown>).entries)) {
    const obj = v as Record<string, unknown>;
    const entries = (obj.entries as unknown[]).filter(
      (e) =>
        e &&
        typeof e === 'object' &&
        typeof (e as Record<string, unknown>).message === 'string' &&
        typeof (e as Record<string, unknown>).timestamp === 'number',
    );
    const maxEntries =
      typeof obj.maxEntries === 'number' && Number.isInteger(obj.maxEntries) && obj.maxEntries > 0
        ? obj.maxEntries
        : 100;
    const filterCategory =
      obj.filterCategory === null || typeof obj.filterCategory === 'string'
        ? (obj.filterCategory as EventLog['filterCategory'])
        : null;
    return { entries: entries as EventLog['entries'], maxEntries, filterCategory };
  }
  return createEventLog();
}

/**
 * Wandelt GameState in einen JSON-String um.
 * BigInt-Felder werden als Strings serialisiert; das Feld `version` wird mit
 * ENGINE_VERSION gestempelt.
 */
export function serialize(s: GameState): string {
  const payload: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(s)) {
    if (BIGINT_FIELDS.includes(k as keyof GameState)) {
      payload[k] = (val as bigint).toString();
    } else {
      payload[k] = val;
    }
  }
  payload.version = ENGINE_VERSION;
  return JSON.stringify(payload);
}

/**
 * Parst einen JSON-String und migriert ihn automatisch nach v5.
 * Bei korruptem/unlesbarem Input wird null zurückgegeben (niemals geworfen).
 */
export function deserialize(raw: string): GameState | null {
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (o === null || typeof o !== 'object') return null;
  const migrated = migrateSavePayload(o);
  return migrated.data;
}

/**
 * Baut den Meta-Export-Wrapper um ein serialisiertes Save.
 */
export function exportPayload(s: GameState): ExportPayload {
  return {
    version: ENGINE_VERSION,
    exportedAt: new Date().toISOString(),
    data: serialize(s),
  };
}

/**
 * Liest einen Import-Wrapper-String, migriert die enthaltenen Daten und
 * gibt den v5 GameState zurück (null bei Korruption).
 */
export function importPayload(json: string): GameState | null {
  let o: unknown;
  try {
    o = JSON.parse(json);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const wrapper = o as Record<string, unknown>;
  const data = wrapper.data;
  if (typeof data !== 'string') {
    // Akzeptiere auch ungewrappte/flache alte Payloads zur Abwärtskompatibilität.
    const migrated = migrateSavePayload(o);
    return migrated.data;
  }
  return deserialize(data);
}

/**
 * Entfernt den localStorage-Schlüssel, falls ein Browser-Kontext vorliegt.
 * Kein throw, keine Op bei SSR/Node.
 */
export function clearCorruptSave(): void {
  const storage = getStorage();
  try {
    if (storage) {
      storage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Legacy: direkte Deserialisierung mit internem Fallback-Sanitizer (wenn
 * migrate.ts nicht verfügbar sein sollte). Heute delegiert an migrateSavePayload.
 */
export function legacyDeserialize(raw: string): GameState | null {
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  return {
    cyclesScaled: toNonNegBigInt(r.cyclesScaled, 0n),
    totalEarnedScaled: toNonNegBigInt(r.totalEarnedScaled, 0n),
    workerEarnedScaled: toNonNegBigInt(r.workerEarnedScaled, 0n),
    clickPowerScaled: toNonNegBigInt(r.clickPowerScaled, 1n * SCALE),
    prodRemainder: toNonNegBigInt(r.prodRemainder, 0n),
    generators: sanitizeGenerators(r.generators),
    upgrades: sanitizeUpgrades(r.upgrades),
    upgradesEverBought: toBool(r.upgradesEverBought, false),
    achievements: sanitizeAchievements(r.achievements),
    clicks: toNonNegBigInt(r.clicks, 0n),
    sessionClicks: toNonNegInt(r.sessionClicks, 0),
    prestige: toNonNegInt(r.prestige, 0),
    prestigePoints: toNonNegInt(r.prestigePoints, 0),
    multiplier: toNonNegFloat(r.multiplier, 1),
    tickets: Array.isArray(r.tickets) ? (r.tickets as Ticket[]) : [],
    ticketsResolved: toNonNegInt(r.ticketsResolved, 0),
    ticketsExpired: toNonNegInt(r.ticketsExpired, 0),
    sev1Active: toBool(r.sev1Active, false),
    sev1Timer: toNonNegFloat(r.sev1Timer, 0),
    sev1Survived: toBool(r.sev1Survived, false),
    cpsPenalty: toNonNegFloat(r.cpsPenalty, 1),
    cpsPenaltyTimer: toNonNegFloat(r.cpsPenaltyTimer, 0),
    achievementProgress:
      typeof r.achievementProgress === 'object' && r.achievementProgress !== null
        ? { ...(r.achievementProgress as Record<string, number>) }
        : {},
    p1AutoClosed: toNonNegInt(r.p1AutoClosed, 0),
    fastTickets: toNonNegInt(r.fastTickets, 0),
    maxSpendIn60s: toNonNegBigInt(r.maxSpendIn60s, 0n),
    spendEvents: Array.isArray(r.spendEvents) ? (r.spendEvents as SpendEvent[]) : [],
    allCategoriesMaxed: toBool(r.allCategoriesMaxed, false),
    maxSimultaneousP1: toNonNegInt(r.maxSimultaneousP1, 0),
    mondayClicks: toNonNegInt(r.mondayClicks, 0),
    passiveEarnedSinceLastClick: toNonNegBigInt(r.passiveEarnedSinceLastClick, 0n),
    pagerDutyTriggered: toBool(r.pagerDutyTriggered, false),
    pagerDutyDate: typeof r.pagerDutyDate === 'string' ? r.pagerDutyDate : null,
    legacyCodeTriggered: toBool(r.legacyCodeTriggered, false),
    maxCyclesWithoutUpgrades: toNonNegBigInt(r.maxCyclesWithoutUpgrades, 0n),
    deploysStarted: toNonNegInt(r.deploysStarted, 0),
    successfulDeploys: toNonNegInt(r.successfulDeploys, 0),
    failedDeploys: toNonNegInt(r.failedDeploys, 0),
    lastDeployAt: toNonNegInt(r.lastDeployAt as number | undefined, 0) || null,
    releaseStatus: toReleaseStatus(r.releaseStatus, 'idle'),
    releaseStageIndex:
      typeof r.releaseStageIndex === 'number' && Number.isInteger(r.releaseStageIndex)
        ? r.releaseStageIndex
        : -1,
    releaseStageTimer: toNonNegFloat(r.releaseStageTimer, 0),
    releaseDeployBonusTimer: toNonNegFloat(r.releaseDeployBonusTimer, 0),
    releaseDeployBonusMultiplier: toNonNegFloat(r.releaseDeployBonusMultiplier, 1),
    releaseMessage: typeof r.releaseMessage === 'string' ? r.releaseMessage : 'Change Window bereit.',
    rollbacksPerformed: toNonNegInt(r.rollbacksPerformed, 0),
    lastRollbackAt: toNonNegInt(r.lastRollbackAt as number | undefined, 0) || null,
    errorBudget: toNonNegFloat(r.errorBudget, 100),
    observabilityScore: toNonNegFloat(r.observabilityScore, 82),
    activeIncidents: toNonNegInt(r.activeIncidents, 0),
    uptime: toNonNegFloat(r.uptime, 99.95),
    errorRate: toNonNegFloat(r.errorRate, 0.05),
    monitoringTimer: toNonNegFloat(r.monitoringTimer, 0),
    rollbackAvailable: toBool(r.rollbackAvailable, false),
    cleanMonitoringWindows: toNonNegInt(r.cleanMonitoringWindows, 0),
    lastDeploymentQuality: toDeploymentQuality(r.lastDeploymentQuality, 'No deploys yet'),
    observabilityMessage:
      typeof r.observabilityMessage === 'string'
        ? r.observabilityMessage
        : 'Keine aktive Release-Beobachtung.',
    lastReleaseEvidence:
      typeof r.lastReleaseEvidence === 'string'
        ? r.lastReleaseEvidence
        : 'Noch keine Release-Evidenz.',
    masterVolume: toNonNegFloat(r.masterVolume, 1.0),
    muted: toBool(r.muted, false),
    selectedSound: toSoundThemeId(r.selectedSound, 'none'),
    sessionStart: toNonNegInt(r.sessionStart, Date.now()),
    sessionPlayTime: toNonNegFloat(r.sessionPlayTime, 0),
    lastOnline: toNonNegInt(r.lastOnline, 0),
    lastTick: toNonNegInt(r.lastTick, Date.now()),
    lastTicketSpawn: toNonNegInt(r.lastTicketSpawn, Date.now()),
    currentTab: typeof r.currentTab === 'string' ? r.currentTab : 'hardware',
    shares: toNonNegBigInt(r.shares, 0n),
    lastSavedMs: toNonNegInt(r.lastSavedMs, Date.now()),
    // Determinismus-Kern: rngSeed und deployCounter aus Save (oder Default).
    // rngSeed MUSS aus dem Save kommen, sonst verliert der Spieler seine
    // Roll-History. deployCounter MUSS aus dem Save kommen, sonst weicht
    // der naechste Roll vom Server-Validator ab.
    // toU64 (Georg's Politur #2, 2026-06-26): kanonisiert rngSeed auf exakte
    // u64-Range, damit der State-Wert dem entspricht, was splitmix64 intern
    // sieht. Sonst: prng maskiert deterministisch, aber der literal State-
    // Wert koennte > 2^64 sein und ein Server-Validator ohne mod-2^64
    // wuerde divergieren.
    rngSeed: toU64(r.rngSeed !== undefined ? toNonNegBigInt(r.rngSeed, RNG_DEFAULT_SEED) : RNG_DEFAULT_SEED),
    deployCounter: toNonNegBigInt(r.deployCounter, 0n),
    version: Number.isInteger(r.version) ? (r.version as number) : ENGINE_VERSION,
    eventLog: sanitizeEventLog(r.eventLog),
  };
}

export function save(s: GameState): void {
  const storage = getStorage();
  try {
    if (storage) {
      storage.setItem(KEY, serialize({ ...s, lastSavedMs: Date.now() }));
    }
  } catch {
    /* localStorage nicht verfügbar — ignorieren */
  }
}

export function load(): GameState | null {
  const storage = getStorage();
  try {
    if (storage) {
      const raw = storage.getItem(KEY);
      return raw ? deserialize(raw) : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  const storage = getStorage();
  try {
    if (storage) {
      storage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
}

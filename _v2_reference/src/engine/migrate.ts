// Migration: v1-Save-Formate (Flat + Meta-Wrap) -> v2-GameState (ENGINE_VERSION = 6).
// Pure functions, keine DOM-Calls, kein localStorage, kein console.log.
// Logger-Hook: optionaler onIssue-Callback erzeugt EventLog-Einträge.

import {
  SCALE,
  type GameState,
  type Ticket,
  type DeploymentQuality,
  type SoundThemeId,
  type ReleaseStatus,
} from './types';
import { ENGINE_VERSION, FIRST_NATIVE_VERSION, UPGRADES, ACHIEVEMENTS, GENERATORS, RNG_DEFAULT_SEED } from './config';
import { createEventLog, type EventLog, type Severity, type EventCategory } from './eventLog';
import { numberOr, boolOr, stringOr, toNonNegBigInt } from '../lib/fallbacks';
import { toU64 } from './prng';

const MIGRATION_ISSUE_CATEGORY: EventCategory = 'system';
const MIGRATION_ISSUE_SEVERITY: Severity = 'warning';

export type MigrationIssue = {
  message: string;
  field?: string;
  received?: unknown;
  fallback?: unknown;
};

export type MigrationLogger = (issue: MigrationIssue) => void;

export type MigrationResult =
  | { data: GameState; migrated: true; fromVersion: number }
  | { data: GameState; migrated: false; fromVersion: number };

// Intern: Logger, der ein EventLog erzeugt (rein, deterministisch außer Timestamp).
function makeIssueLogger(baseLog?: EventLog): { log: MigrationLogger; eventLog: EventLog } {
  let eventLog = baseLog ?? createEventLog();
  const log: MigrationLogger = (issue) => {
    eventLog = createEventLogEntry(
      eventLog,
      issue.field
        ? `Migration: ${issue.message} (field=${issue.field}, fallback=${String(issue.fallback)})`
        : `Migration: ${issue.message}`,
    );
  };
  return { log, get eventLog() {
    return eventLog; } };
}

function createEventLogEntry(log: EventLog, message: string): EventLog {
  const safeMessage = typeof message === 'string' ? message : String(message);
  const entry = {
    id: `mig_${log.entries.length}_${Date.now().toString(36)}`,
    timestamp: Date.now(),
    message: safeMessage,
    severity: MIGRATION_ISSUE_SEVERITY,
    category: MIGRATION_ISSUE_CATEGORY,
  };
  const nextEntries = [...log.entries, entry];
  if (nextEntries.length > log.maxEntries) {
    nextEntries.shift();
  }
  return { ...log, entries: nextEntries };
}

/** Wandelt eine v1-Plain-Version in ein Record um. */
function asRecord(payload: unknown): Record<string, unknown> | null {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return null;
}

/** Ermittelt Quell-State aus Flat-Format oder Meta-Wrap-Format. */
function extractSourceState(payload: unknown): {
  root: Record<string, unknown>;
  state: Record<string, unknown>;
} | null {
  const root = asRecord(payload);
  if (!root) return null;

  // Meta-Wrap: { meta: {...}, state: {...} }
  if ('state' in root) {
    const state = asRecord(root.state);
    if (state) return { root, state };
  }

  // Flat-Format: root IST der State.
  return { root, state: root };
}

/** Ermittelt die Quell-Version. v1 nutzte teils `version`, teils `saveVersion`. */
function detectSourceVersion(root: Record<string, unknown>, state: Record<string, unknown>): number {
  const legacy = numberOr(root.version, NaN);
  if (Number.isInteger(legacy) && legacy >= 1) return legacy;

  const saveVer = numberOr(state.saveVersion, NaN);
  if (Number.isInteger(saveVer) && saveVer >= 1) return saveVer;

  const stateVer = numberOr(state.version, NaN);
  if (Number.isInteger(stateVer) && stateVer >= 1) return stateVer;

  return 1;
}

// --- Sanitizer-Helfer für Records ---

function sanitizeScaled(state: Record<string, unknown>, key: string, fallback: bigint, issues: MigrationIssue[]): bigint {
  const v = state[key];
  const legacyScaledKeys = new Set([
    'cyclesScaled',
    'totalEarnedScaled',
    'workerEarnedScaled',
    'clickPowerScaled',
    'maxSpendIn60s',
    'passiveEarnedSinceLastClick',
    'maxCyclesWithoutUpgrades',
    'prodRemainder',
  ]);
  if (legacyScaledKeys.has(key)) {
    const legacyKey = key.replace('Scaled', '');
    if (v === undefined && legacyKey !== key && state[legacyKey] !== undefined) {
      const legacy = toNonNegBigInt(state[legacyKey], fallback);
      if (legacy !== fallback) return legacy * SCALE;
    }
  }
  const converted = toNonNegBigInt(v, fallback);
  if (converted !== fallback && v !== undefined) return converted;
  if (v !== undefined && converted === fallback && String(v) !== String(fallback)) {
    // Nur pushen — die Schluss-Schleife in buildGameState meldet alle
    // gesammelten Issues am Ende. Doppelreport via reportIssueRef hier
    // entfernt, weil das Timing (Sanitizer-Returns laufen NACH dem
    // ursprueglichen issues-Loop) genau dieses Problem verursacht hat.
    issues.push({ message: `invalid scaled value (key=${key})`, field: key, received: v, fallback });
  }
  return converted;
}

// reportIssueRef + _setReportIssue werden nicht mehr aktiv genutzt
// (Sanitizer melden am Ende ueber die issues-Schleife in buildGameState),
// bleiben aber fuer Rueckwaertskompatibilitaet / externe Tests erhalten.
let reportIssueRef: (issue: MigrationIssue) => void = () => {};
function _setReportIssue(report: (issue: MigrationIssue) => void) {
  reportIssueRef = report;
}

function sanitizeNonNegInt(state: Record<string, unknown>, key: string, fallback: number, issues: MigrationIssue[]): number {
  const v = state[key];
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (v !== undefined && v !== null) issues.push({ message: 'invalid integer', field: key, received: v, fallback });
  return fallback;
}

/**
 * Sanitizer mit Sentinel-Support.
 *
 * Manche Felder haben einen LEGITIMEN Sentinel-Wert (z.B. releaseStageIndex = -1
 * bedeutet "noch kein Release-Train gestartet"). Ein normaler NonNeg-Sani-
 * tizer wuerde -1 als invalid ablehnen und auf Fallback (0) zurueckfallen —
 * dann haengt der Caller an einem Nach-pruef-Hack (`=== 0 && input === -1`),
 * der fragil ist und trotzdem ein Warning produziert.
 *
 * Diese Variante erkennt den Sentinel-Wert vor dem NonNeg-Check und gibt
 * ihn unveraendert zurueck, OHNE ein Issue zu melden (der Sentinel ist
 * legitim, kein Korruptions-Symptom).
 *
 * @param sentinel Optionaler Sentinel-Wert (z.B. -1 fuer "noch nicht aktiv").
 *                 Wenn `state[key] === sentinel`, wird der Sentinel-Wert
 *                 unveraendert zurueckgegeben und KEIN Issue gemeldet.
 */
function sanitizeIntWithSentinel(
  state: Record<string, unknown>,
  key: string,
  fallback: number,
  sentinel: number | undefined,
  issues: MigrationIssue[],
): number {
  const v = state[key];
  // Sentinel zuerst pruefen — legitim, kein Issue.
  if (sentinel !== undefined && v === sentinel) return sentinel;
  // Sonst normaler NonNeg-Integer-Pfad.
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (v !== undefined && v !== null) issues.push({ message: 'invalid integer', field: key, received: v, fallback });
  return fallback;
}

function sanitizeNonNegFloat(state: Record<string, unknown>, key: string, fallback: number, issues: MigrationIssue[]): number {
  const v = state[key];
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (v !== undefined && v !== null) issues.push({ message: 'invalid float', field: key, received: v, fallback });
  return fallback;
}

function sanitizeBool(state: Record<string, unknown>, key: string, fallback: boolean, issues: MigrationIssue[]): boolean {
  const v = state[key];
  if (typeof v === 'boolean') return v;
  if (v !== undefined && v !== null) issues.push({ message: 'invalid boolean', field: key, received: v, fallback });
  return fallback;
}

function sanitizeString(state: Record<string, unknown>, key: string, fallback: string, issues: MigrationIssue[]): string {
  const v = state[key];
  if (typeof v === 'string') return v;
  if (v !== undefined) issues.push({ message: 'invalid string', field: key, received: v, fallback });
  return fallback;
}

function sanitizeNullableString(state: Record<string, unknown>, key: string, fallback: string | null, issues: MigrationIssue[]): string | null {
  const v = state[key];
  if (v === null || typeof v === 'string') return v;
  if (v !== undefined) issues.push({ message: 'invalid nullable string', field: key, received: v, fallback });
  return fallback;
}

function sanitizeNullableNumber(state: Record<string, unknown>, key: string, fallback: number | null, issues: MigrationIssue[]): number | null {
  const v = state[key];
  if (v === null) return null;
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (v !== undefined && v !== null) issues.push({ message: 'invalid nullable integer', field: key, received: v, fallback });
  return fallback;
}

function sanitizeDeploymentQuality(
  state: Record<string, unknown>,
  key: string,
  fallback: DeploymentQuality,
  issues: MigrationIssue[],
): DeploymentQuality {
  const v = state[key];
  const valid: DeploymentQuality[] = ['No deploys yet', 'clean', 'degraded', 'failed', 'rolled back', 'bad'];
  if (typeof v === 'string' && (valid as string[]).includes(v)) return v as DeploymentQuality;
  if (v !== undefined) issues.push({ message: 'invalid deployment quality', field: key, received: v, fallback });
  return fallback;
}

function sanitizeSoundThemeId(
  state: Record<string, unknown>,
  key: string,
  fallback: SoundThemeId,
  issues: MigrationIssue[],
): SoundThemeId {
  const v = state[key];
  const valid: SoundThemeId[] = ['none', 'dialup', 'mechanical', 'retro', 'scifi'];
  if (typeof v === 'string' && (valid as string[]).includes(v)) return v as SoundThemeId;
  if (v !== undefined) issues.push({ message: 'invalid sound theme', field: key, received: v, fallback });
  return fallback;
}

function sanitizeReleaseStatus(
  state: Record<string, unknown>,
  key: string,
  fallback: ReleaseStatus,
  issues: MigrationIssue[],
): ReleaseStatus {
  const v = state[key];
  const valid: ReleaseStatus[] = ['idle', 'building', 'testing', 'security', 'deploying', 'observing', 'success', 'failed'];
  if (typeof v === 'string' && (valid as string[]).includes(v)) return v as ReleaseStatus;
  if (v !== undefined) issues.push({ message: 'invalid release status', field: key, received: v, fallback });
  return fallback;
}

// Legacy: v1 speicherte Generator-Counts teils im `generators`-Feld (Server),
// teils als Upgrades. Nur IDs, die echte Generatoren sind, landen in generators;
// alles andere wird in upgrades migriert (oder fallengelassen, falls unbekannt).
// Legacy v1 generator IDs that should be migrated from the `upgrades` map into
// `generators`. Includes all current v2 generator IDs plus known aliases used by
// older v1 saves (`cloud` was a common user-facing name for the `vm` generator).
const V1_GENERATOR_ALIASES: Record<string, string> = {
  cloud: 'vm',
};

function resolveV1GeneratorId(id: string): string | undefined {
  if (GENERATORS.some((g) => g.id === id)) return id;
  return V1_GENERATOR_ALIASES[id];
}

// Legacy: v1 speicherte Generator-Counts teils im `generators`-Feld (Server),
// teils als Upgrades. Nur IDs, die echte Generatoren (oder bekannte v1-Aliase)
// sind, landen in generators; alles andere wird in upgrades migriert (oder
// fallengelassen, falls unbekannt).
function sanitizeGenerators(
  state: Record<string, unknown>,
  generatorPurchasesFromUpgrades: Record<string, number>,
  issues: MigrationIssue[],
): Record<string, number> {
  const v = state.generators;
  if (!v || typeof v !== 'object') {
    if (v !== undefined) issues.push({ message: 'invalid record', field: 'generators', received: v, fallback: {} });
    return { ...generatorPurchasesFromUpgrades };
  }
  const validGeneratorIds = new Set(GENERATORS.map((g) => g.id));
  const obj = v as Record<string, unknown>;
  const out: Record<string, number> = { ...generatorPurchasesFromUpgrades };
  const droppedKeys: string[] = [];
  for (const [id, count] of Object.entries(obj)) {
    const canonical = resolveV1GeneratorId(id);
    if (!canonical || !validGeneratorIds.has(canonical)) {
      droppedKeys.push(id);
      continue;
    }
    if (typeof count === 'number' && Number.isInteger(count) && count >= 0) {
      out[canonical] = count;
    }
  }
  if (droppedKeys.length > 0) {
    issues.push({ message: 'dropped non-generator keys from v1 generators field', field: 'generators', received: droppedKeys, fallback: out });
  }
  return out;
}

// Extract generator purchase counts stored inside the legacy v1 `upgrades` map.
// These IDs are valid v1 generator IDs (including hybrid upgrades and legacy
// aliases) and belong in the v2 `generators` field, not in `upgrades`.
function extractGeneratorPurchasesFromUpgrades(
  state: Record<string, unknown>,
  issues: MigrationIssue[],
  legacyFlat: boolean,
): Record<string, number> {
  // Nur das Legacy-Flat-Format vermischte Generatoren und Upgrades. Native nie.
  if (!legacyFlat) return {};
  const v = state.upgrades;
  if (!v || typeof v !== 'object') return {};
  const obj = v as Record<string, unknown>;
  const out: Record<string, number> = {};
  const movedKeys: string[] = [];
  for (const [id, count] of Object.entries(obj)) {
    const canonical = resolveV1GeneratorId(id);
    if (!canonical) continue;
    if (typeof count === 'number' && Number.isInteger(count) && count >= 0) {
      out[canonical] = count;
      movedKeys.push(id);
    }
  }
  if (movedKeys.length > 0) {
    issues.push({ message: 'moved generator IDs from v1 upgrades to generators', field: 'upgrades', received: movedKeys, fallback: out });
  }
  return out;
}

// Legacy: v1 speicherte sowohl echte Upgrades als auch Generator-Käufe im
// `upgrades`-Feld. Generator-IDs (und deren Aliase) werden in `generators`
// umgelenkt, nur bekannte echte Upgrade-IDs verbleiben hier.
function sanitizeUpgrades(
  state: Record<string, unknown>,
  issues: MigrationIssue[],
  legacyFlat: boolean,
): Record<string, number> {
  const v = state.upgrades;
  if (!v || typeof v !== 'object') {
    if (v !== undefined) issues.push({ message: 'invalid record', field: 'upgrades', received: v, fallback: {} });
    return {};
  }
  const validUpgradeIds = new Set(UPGRADE_IDS);
  const obj = v as Record<string, unknown>;
  const out: Record<string, number> = {};
  const droppedKeys: string[] = [];
  for (const [id, level] of Object.entries(obj)) {
    // NUR bei v1: Generator-Käufe leben in `generators`; hier überspringen, auch
    // wenn sie einen v2-Hybrid-Upgrade-Twin haben. Ab v2 ist `upgrades` kanonisch
    // -> ein echtes Upgrade mit Generator-Twin-ID (server/vm/ssd) bleibt erhalten.
    if (legacyFlat && resolveV1GeneratorId(id)) continue;
    if (!validUpgradeIds.has(id)) {
      droppedKeys.push(id);
      continue;
    }
    if (typeof level === 'number' && Number.isInteger(level) && level >= 0) {
      out[id] = level;
    }
  }
  if (droppedKeys.length > 0) {
    issues.push({ message: 'dropped unknown upgrade keys', field: 'upgrades', received: droppedKeys, fallback: out });
  }
  return out;
}

// v1 sometimes stored Set-like fields as string[] (e.g. achievements: ['first_click']).
// Convert: each array element becomes a record key with value 1 (unlocked).
function sanitizeAchievements(state: Record<string, unknown>, key: string, issues: MigrationIssue[]): Record<string, number> {
  const v = state[key];
  if (!v || typeof v !== 'object') {
    if (v !== undefined) issues.push({ message: 'invalid record', field: key, received: v, fallback: {} });
    return {};
  }

  if (Array.isArray(v)) {
    const out: Record<string, number> = {};
    const dropped: string[] = [];
    for (const elem of v) {
      if (typeof elem !== 'string') continue;
      if (!ACHIEVEMENT_IDS.includes(elem)) {
        dropped.push(elem);
        continue;
      }
      out[elem] = 1;
    }
    if (dropped.length > 0) {
      issues.push({ message: 'dropped unknown keys (from array)', field: key, received: dropped, fallback: out });
    }
    return out;
  }

  const obj = v as Record<string, unknown>;
  const out: Record<string, number> = {};
  let dropped = 0;
  const droppedKeys: string[] = [];
  for (const id of Object.keys(obj)) {
    if (!ACHIEVEMENT_IDS.includes(id)) {
      dropped++;
      droppedKeys.push(id);
      continue;
    }
    const level = obj[id];
    if (typeof level === 'number' && Number.isInteger(level) && level >= 0) {
      out[id] = level;
    }
  }
  if (dropped > 0) {
    issues.push({ message: 'dropped unknown keys', field: key, received: droppedKeys, fallback: out });
  }
  return out;
}

function sanitizeTickets(state: Record<string, unknown>, key: string, issues: MigrationIssue[]): Ticket[] {
  const v = state[key];
  if (!Array.isArray(v)) {
    if (v !== undefined) issues.push({ message: 'invalid tickets array', field: key, received: v, fallback: [] });
    return [];
  }
  const out: Ticket[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const t = raw as Record<string, unknown>;
    const type = t.type;
    if (type !== 'p3' && type !== 'p2' && type !== 'p1') continue;
    const legacyReward = t.rewardScaled !== undefined ? t.rewardScaled : t.reward;
    const reward = toNonNegBigInt(legacyReward, 0n);
    out.push({
      id: typeof t.id === 'string' ? t.id : `mig_${out.length}`,
      type,
      title: typeof t.title === 'string' ? t.title : `${type.toUpperCase()} Ticket`,
      sla: numberOr(t.sla, 0),
      maxSla: numberOr(t.maxSla, 0),
      rewardScaled: reward,
      autoCloseTimer: numberOr(t.autoCloseTimer, 0),
      spawnTime: numberOr(t.spawnTime, 0),
    });
  }
  return out;
}

function sanitizeSpendEvents(state: Record<string, unknown>, key: string): { time: number; amountScaled: bigint }[] {
  const v = state[key];
  if (!Array.isArray(v)) return [];
  const out: { time: number; amountScaled: bigint }[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.time === 'number' && Number.isFinite(e.time)) {
      out.push({ time: e.time, amountScaled: toNonNegBigInt(e.amountScaled, 0n) });
    }
  }
  return out;
}

function sanitizeEventLog(state: Record<string, unknown>, key: string): EventLog {
  const v = state[key];
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

// --- Migration-Chain: Default-Injection pro Version ---

const UPGRADE_IDS = UPGRADES.map((u) => u.id);
const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

/** Injiziert fehlende Felder für Version 1 -> 2. */
function injectV1ToV2(state: Record<string, unknown>): Record<string, unknown> {
  const next = { ...state };
  if (!('achievements' in next)) next.achievements = {};
  if (!('achievementProgress' in next)) next.achievementProgress = {};
  if (!('upgradesEverBought' in next)) next.upgradesEverBought = false;
  if (!('prestigePoints' in next)) next.prestigePoints = 0;
  return next;
}

/** Injiziert fehlende Felder für Version 2 -> 3. */
function injectV2ToV3(state: Record<string, unknown>): Record<string, unknown> {
  const next = { ...state };
  if (!('sev1Survived' in next)) next.sev1Survived = false;
  if (!('ticketsResolved' in next)) next.ticketsResolved = 0;
  if (!('ticketsExpired' in next)) next.ticketsExpired = 0;
  if (!('p1AutoClosed' in next)) next.p1AutoClosed = 0;
  if (!('fastTickets' in next)) next.fastTickets = 0;
  return next;
}

/** Injiziert fehlende Felder für Version 3 -> 4. */
function injectV3ToV4(state: Record<string, unknown>): Record<string, unknown> {
  const next = { ...state };
  if (!('allCategoriesMaxed' in next)) next.allCategoriesMaxed = false;
  if (!('maxSimultaneousP1' in next)) next.maxSimultaneousP1 = 0;
  if (!('mondayClicks' in next)) next.mondayClicks = 0;
  if (!('pagerDutyTriggered' in next)) next.pagerDutyTriggered = false;
  if (!('legacyCodeTriggered' in next)) next.legacyCodeTriggered = false;
  return next;
}

/** Injiziert fehlende Felder für Version 4 -> 5 (v2-Engine). */
function injectV4ToV5(state: Record<string, unknown>): Record<string, unknown> {
  const next = { ...state };
  // Release Train
  if (!('deploysStarted' in next)) next.deploysStarted = 0;
  if (!('successfulDeploys' in next)) next.successfulDeploys = 0;
  if (!('failedDeploys' in next)) next.failedDeploys = 0;
  if (!('lastDeployAt' in next)) next.lastDeployAt = null;
  if (!('releaseStatus' in next)) next.releaseStatus = 'idle';
  if (!('releaseStageIndex' in next)) next.releaseStageIndex = -1;
  if (!('releaseStageTimer' in next)) next.releaseStageTimer = 0;
  if (!('releaseDeployBonusTimer' in next)) next.releaseDeployBonusTimer = 0;
  if (!('releaseDeployBonusMultiplier' in next)) next.releaseDeployBonusMultiplier = 1;
  if (!('releaseMessage' in next)) next.releaseMessage = 'Change Window bereit.';
  if (!('rollbacksPerformed' in next)) next.rollbacksPerformed = 0;
  if (!('lastRollbackAt' in next)) next.lastRollbackAt = null;
  // Observability
  if (!('errorBudget' in next)) next.errorBudget = 100;
  if (!('observabilityScore' in next)) next.observabilityScore = 82;
  if (!('activeIncidents' in next)) next.activeIncidents = 0;
  if (!('uptime' in next)) next.uptime = 99.95;
  if (!('errorRate' in next)) next.errorRate = 0.05;
  if (!('monitoringTimer' in next)) next.monitoringTimer = 0;
  if (!('rollbackAvailable' in next)) next.rollbackAvailable = false;
  if (!('cleanMonitoringWindows' in next)) next.cleanMonitoringWindows = 0;
  if (!('lastDeploymentQuality' in next)) next.lastDeploymentQuality = 'No deploys yet';
  if (!('observabilityMessage' in next)) next.observabilityMessage = 'Keine aktive Release-Beobachtung.';
  if (!('lastReleaseEvidence' in next)) next.lastReleaseEvidence = 'Noch keine Release-Evidenz.';
  // Audio
  if (!('masterVolume' in next)) next.masterVolume = 1.0;
  if (!('muted' in next)) next.muted = false;
  if (!('selectedSound' in next)) next.selectedSound = 'none';
  // Session/Timing
  if (!('sessionStart' in next)) next.sessionStart = Date.now();
  if (!('sessionPlayTime' in next)) next.sessionPlayTime = 0;
  if (!('lastOnline' in next)) next.lastOnline = 0;
  if (!('lastTick' in next)) next.lastTick = Date.now();
  if (!('lastTicketSpawn' in next)) next.lastTicketSpawn = Date.now();
  // v2-spezifisch
  if (!('prodRemainder' in next)) next.prodRemainder = '0';
  if (!('shares' in next)) next.shares = '0';
  if (!('lastSavedMs' in next)) next.lastSavedMs = Date.now();
  if (!('eventLog' in next)) next.eventLog = createEventLog();
  if (!('currentTab' in next)) next.currentTab = 'hardware';
  return next;
}

/** Injiziert fehlende Felder für Version 5 -> 6 (deterministischer Deploy-RNG). */
function injectV5ToV6(state: Record<string, unknown>): Record<string, unknown> {
  const next = { ...state };
  // Determinismus-Kern (Phase-3 Leaderboard). v5-Saves haben diese Felder
  // NICHT — wir setzen rngSeed auf den fixen Default (alle Clients starten
  // mit demselben Seed → Server-Validator in Phase 3 kann den Roll-Verlauf
  // reproduzieren) und deployCounter auf 0 (Saves vor v6 hatten gar keinen
  // Counter; ein "alter" Spieler faengt bei Deploy #1 an).
  if (!('rngSeed' in next)) next.rngSeed = RNG_DEFAULT_SEED;
  if (!('deployCounter' in next)) next.deployCounter = 0n;
  return next;
}

function applyDefaultChain(state: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  let next = { ...state };
  if (fromVersion < 2) next = injectV1ToV2(next);
  if (fromVersion < 3) next = injectV2ToV3(next);
  if (fromVersion < 4) next = injectV3ToV4(next);
  if (fromVersion < 5) next = injectV4ToV5(next);
  if (fromVersion < 6) next = injectV5ToV6(next);
  return next;
}

// --- Haupt-Migration ---

/**
 * Migriert ein v1/v2 Save-Payload in einen v5 GameState.
 *
 * Unterstützt:
 *   - Flat-Format: { version, cycles, upgrades, ... }
 *   - Meta-Wrap-Format: { meta: { version, ... }, state: { ... } }
 *
 * NaN/Infinity/undefined in numerischen Feldern werden via lib/fallbacks
 * auf sichere Defaults zurückgesetzt.
 *
 * Korrupte Payloads (kein version field erkennbar) werden als fromVersion=1
 * behandelt und mit Defaults aufgefüllt; es wird nie geworfen.
 *
 * @returns { data: GameState, migrated: boolean, fromVersion: number }
 */
export function migrateSavePayload(
  payload: unknown,
  options?: { onIssue?: MigrationLogger },
): MigrationResult {
  const extracted = extractSourceState(payload);
  const issues: MigrationIssue[] = [];
  const logger = options?.onIssue;

  if (!extracted) {
    issues.push({ message: 'payload is not an object; treating as v1 defaults' });
    const empty = buildGameState({}, issues, logger, true);
    return { data: empty, migrated: true, fromVersion: 1 };
  }

  const { root, state } = extracted;
  const fromVersion = detectSourceVersion(root, state);

  if (fromVersion > ENGINE_VERSION) {
    issues.push({ message: `save version ${fromVersion} > engine version ${ENGINE_VERSION}; clamping to defaults` });
    const empty = buildGameState({}, issues, logger, false);
    return { data: empty, migrated: true, fromVersion };
  }

  const withDefaults = applyDefaultChain(state, fromVersion);
  const migrated = fromVersion !== ENGINE_VERSION;
  // Generator<->Upgrade-Umlenkung NUR für das Legacy-Flat-Format (Vorgänger-
  // Saves saveVersion 1..FIRST_NATIVE_VERSION-1 = 1..4), das Generator-Käufe
  // ins `upgrades`-Feld mischte. Native Saves (>=FIRST_NATIVE_VERSION = 5,
  // incl. v6) haben getrennte generators/upgrades und dürfen NICHT umgedeutet
  // werden — sonst Datenverlust bei Hybrid-IDs (server/vm/ssd).
  //
  // KRITISCH: Gate haengt an FIRST_NATIVE_VERSION, NICHT an ENGINE_VERSION.
  // Vor diesem Fix war `fromVersion < ENGINE_VERSION`, was mit ENGINE_VERSION=6
  // ein natives v5-Save (fromVersion=5) als legacyFlat=true klassifiziert
  // haette — exakt die Korruption, die PR #10 (#7416f86) gefixt hat.
  // FIRST_NATIVE_VERSION = 5 bleibt FIX ueber alle kuenftigen Bumps; eine
  // neue Legacy-Epoche wuerde eine neue Konstante rechtfertigen.
  const result = buildGameState(withDefaults, issues, logger, fromVersion < FIRST_NATIVE_VERSION);
  return { data: result, migrated, fromVersion };
}

function buildGameState(
  state: Record<string, unknown>,
  issues: MigrationIssue[],
  externalLogger?: MigrationLogger,
  // Nur das Legacy-Flat-Format (Vorgänger-Saves saveVersion < FIRST_NATIVE_VERSION
  // = 1..4) lagerte Generator-Käufe im `upgrades`-Feld. Für native Saves
  // (>=FIRST_NATIVE_VERSION = 5) ist `upgrades` kanonisch und darf NICHT
  // umgedeutet werden — sonst gingen legitime Upgrades mit Generator-Twin-ID
  // (server/vm/ssd) beim Laden verloren (Roundtrip-Korruption). Default false
  // = sicher (kein Umlenken).
  legacyFlat: boolean = false,
): GameState {
  const issueLogger = makeIssueLogger();

  // Issue-Meldung an beide Logger (interner EventLog + optionaler externer Hook).
  // Wichtig: NIE `log`/`eventLog` in lokale Variablen destrukturieren — der
  // interne `let eventLog` wird durch log() mit einem NEUEN Objekt ueber-
  // schrieben (createEventLogEntry gibt {...log, entries: nextEntries} zurueck).
  // Eine fruehe Const-Referenz auf das alte Objekt veraltet sofort und sieht
  // alle spaeteren Meldungen NICHT. Nur ueber den Getter issueLogger.eventLog
  // lesen, dann sieht man den aktuellen Stand.
  const report = (issue: MigrationIssue) => {
    issueLogger.log(issue);
    externalLogger?.(issue);
  };
  _setReportIssue(report);
  // Fruehe issues aus extractSourceState (z.B. 'payload is not an object')
  // sofort melden. Die Sanitizer im Return-Statement sammeln ihre Issues im
  // selben `issues`-Array und werden am ENDE durchgereicht (s.u.) — so kommen
  // 'invalid integer', 'invalid boolean', 'invalid tickets array' etc. jetzt
  // auch im externen Hook UND im internen EventLog an (vorher: stumm
  // verschluckt, weil die Sanitizer NACH dem issues-Loop liefen).
  for (const issue of issues) report(issue);
  // Snapshot der bisherigen issues-Laenge, damit die Schluss-Iteration nur die
  // NEU hinzugekommenen Sanitizer-Issues meldet — sonst Doppelreport fuer
  // Caller-Issues.
  const initialIssuesLength = issues.length;

  // Legacy: v1 saved generator purchases in `upgrades`. Pull those out first
  // so sanitizeGenerators can merge them with any explicit v1 `generators` field.
  const generatorPurchasesFromUpgrades = extractGeneratorPurchasesFromUpgrades(state, issues, legacyFlat);
  const upgrades = sanitizeUpgrades(state, issues, legacyFlat);
  const generators = sanitizeGenerators(state, generatorPurchasesFromUpgrades, issues);
  const achievements = sanitizeAchievements(state, 'achievements', issues);

  // Legacy: v1 hat `totalClicks` statt `clicks`.
  const clicksRaw = state.clicks !== undefined ? state.clicks : state.totalClicks;
  const clicks = toNonNegBigInt(clicksRaw, 0n);

  const nowMs = Date.now();
  // releaseStageIndex hat einen legitimen Sentinel-Wert: -1 bedeutet "noch
  // kein Release-Train gestartet" (siehe types.ts + release.ts canStartDeploy).
  // sanitizeIntWithSentinel erkennt -1 vor dem NonNeg-Check und gibt es un-
  // veraendert zurueck, OHNE ein Issue zu melden — saubere Loesung statt
  // dem frueheren `sanitizeNonNegInt + Nach-pruef-Hack auf input === -1`.
  const RELEASE_STAGE_INDEX_SENTINEL = -1 as const;

  const built: GameState = {
    cyclesScaled: sanitizeScaled(state, 'cyclesScaled', 0n, issues),
    totalEarnedScaled: sanitizeScaled(state, 'totalEarnedScaled', 0n, issues),
    workerEarnedScaled: sanitizeScaled(state, 'workerEarnedScaled', 0n, issues),
    clickPowerScaled: sanitizeScaled(state, 'clickPowerScaled', 1n * SCALE, issues),
    generators,
    upgrades,
    upgradesEverBought: sanitizeBool(state, 'upgradesEverBought', Object.keys(upgrades).length > 0, issues) || Object.keys(upgrades).length > 0,
    clicks,
    sessionClicks: sanitizeNonNegInt(state, 'sessionClicks', 0, issues),
    prestige: sanitizeNonNegInt(state, 'prestige', 0, issues),
    prestigePoints: sanitizeNonNegInt(state, 'prestigePoints', 0, issues),
    multiplier: sanitizeNonNegFloat(state, 'multiplier', 1, issues),
    tickets: sanitizeTickets(state, 'tickets', issues),
    ticketsResolved: sanitizeNonNegInt(state, 'ticketsResolved', 0, issues),
    ticketsExpired: sanitizeNonNegInt(state, 'ticketsExpired', 0, issues),
    sev1Active: sanitizeBool(state, 'sev1Active', false, issues),
    sev1Timer: sanitizeNonNegFloat(state, 'sev1Timer', 0, issues),
    sev1Survived: sanitizeBool(state, 'sev1Survived', false, issues),
    cpsPenalty: sanitizeNonNegFloat(state, 'cpsPenalty', 1, issues),
    cpsPenaltyTimer: sanitizeNonNegFloat(state, 'cpsPenaltyTimer', 0, issues),
    achievements,
    achievementProgress: sanitizeAchievements(state, 'achievementProgress', issues),
    p1AutoClosed: sanitizeNonNegInt(state, 'p1AutoClosed', 0, issues),
    fastTickets: sanitizeNonNegInt(state, 'fastTickets', 0, issues),
    maxSpendIn60s: sanitizeScaled(state, 'maxSpendIn60s', 0n, issues),
    spendEvents: sanitizeSpendEvents(state, 'spendEvents'),
    allCategoriesMaxed: sanitizeBool(state, 'allCategoriesMaxed', false, issues),
    maxSimultaneousP1: sanitizeNonNegInt(state, 'maxSimultaneousP1', 0, issues),
    mondayClicks: sanitizeNonNegInt(state, 'mondayClicks', 0, issues),
    passiveEarnedSinceLastClick: sanitizeScaled(state, 'passiveEarnedSinceLastClick', 0n, issues),
    pagerDutyTriggered: sanitizeBool(state, 'pagerDutyTriggered', false, issues),
    pagerDutyDate: sanitizeNullableString(state, 'pagerDutyDate', null, issues),
    legacyCodeTriggered: sanitizeBool(state, 'legacyCodeTriggered', false, issues),
    maxCyclesWithoutUpgrades: sanitizeScaled(state, 'maxCyclesWithoutUpgrades', 0n, issues),
    deploysStarted: sanitizeNonNegInt(state, 'deploysStarted', 0, issues),
    successfulDeploys: sanitizeNonNegInt(state, 'successfulDeploys', 0, issues),
    failedDeploys: sanitizeNonNegInt(state, 'failedDeploys', 0, issues),
    lastDeployAt: sanitizeNullableNumber(state, 'lastDeployAt', null, issues),
    releaseStatus: sanitizeReleaseStatus(state, 'releaseStatus', 'idle', issues),
    releaseStageIndex: sanitizeIntWithSentinel(state, 'releaseStageIndex', 0, RELEASE_STAGE_INDEX_SENTINEL, issues),
    releaseStageTimer: sanitizeNonNegFloat(state, 'releaseStageTimer', 0, issues),
    releaseDeployBonusTimer: sanitizeNonNegFloat(state, 'releaseDeployBonusTimer', 0, issues),
    releaseDeployBonusMultiplier: sanitizeNonNegFloat(state, 'releaseDeployBonusMultiplier', 1, issues),
    releaseMessage: sanitizeString(state, 'releaseMessage', 'Change Window bereit.', issues),
    rollbacksPerformed: sanitizeNonNegInt(state, 'rollbacksPerformed', 0, issues),
    lastRollbackAt: sanitizeNullableNumber(state, 'lastRollbackAt', null, issues),
    errorBudget: sanitizeNonNegFloat(state, 'errorBudget', 100, issues),
    observabilityScore: sanitizeNonNegFloat(state, 'observabilityScore', 82, issues),
    activeIncidents: sanitizeNonNegInt(state, 'activeIncidents', 0, issues),
    uptime: sanitizeNonNegFloat(state, 'uptime', 99.95, issues),
    errorRate: sanitizeNonNegFloat(state, 'errorRate', 0.05, issues),
    monitoringTimer: sanitizeNonNegFloat(state, 'monitoringTimer', 0, issues),
    rollbackAvailable: sanitizeBool(state, 'rollbackAvailable', false, issues),
    cleanMonitoringWindows: sanitizeNonNegInt(state, 'cleanMonitoringWindows', 0, issues),
    lastDeploymentQuality: sanitizeDeploymentQuality(state, 'lastDeploymentQuality', 'No deploys yet', issues),
    observabilityMessage: sanitizeString(state, 'observabilityMessage', 'Keine aktive Release-Beobachtung.', issues),
    lastReleaseEvidence: sanitizeString(state, 'lastReleaseEvidence', 'Noch keine Release-Evidenz.', issues),
    masterVolume: sanitizeNonNegFloat(state, 'masterVolume', 1.0, issues),
    muted: sanitizeBool(state, 'muted', false, issues),
    selectedSound: sanitizeSoundThemeId(state, 'selectedSound', 'none', issues),
    sessionStart: sanitizeNonNegInt(state, 'sessionStart', nowMs, issues),
    sessionPlayTime: sanitizeNonNegFloat(state, 'sessionPlayTime', 0, issues),
    lastOnline: sanitizeNonNegInt(state, 'lastOnline', 0, issues),
    lastTick: sanitizeNonNegInt(state, 'lastTick', nowMs, issues),
    lastTicketSpawn: sanitizeNonNegInt(state, 'lastTicketSpawn', nowMs, issues),
    currentTab: sanitizeString(state, 'currentTab', 'hardware', issues),
    prodRemainder: sanitizeScaled(state, 'prodRemainder', 0n, issues),
    shares: sanitizeScaled(state, 'shares', 0n, issues),
    lastSavedMs: sanitizeNonNegInt(state, 'lastSavedMs', nowMs, issues),
    // Determinismus-Kern (Phase-3 Leaderboard). Roundtrip-stabil:
    //   - Wenn das eingehende Save rngSeed/deployCounter hat → übernehmen
    //     (Spieler behält seine Seed-History + Counter-Position).
    //   - Wenn nicht (z.B. v5-Save oder partial payload) → Defaults aus
    //     injectV5ToV6 wurden bereits gesetzt; hier nur sanitisieren.
    //   - sanitizeScaled akzeptiert bigint und string-kodierte bigints.
    //   - toNonNegBigInt akzeptiert ebenfalls beide Formen.
    //   - toU64 (Georg's Politur #2, 2026-06-26): kanonisiert rngSeed auf
    //     exakt u64-Range, damit der State-Wert dem entspricht, was splitmix64
    //     intern sieht. Sonst: prng maskiert deterministisch, aber der State-
    //     Wert koennte literal > 2^64 sein und ein Server-Validator ohne
    //     mod-2^64 wuerde divergieren.
    rngSeed: toU64(sanitizeScaled(state, 'rngSeed', RNG_DEFAULT_SEED, issues)),
    deployCounter: toNonNegBigInt(state.deployCounter, 0n),
    version: ENGINE_VERSION,
    // Initiale Snapshot — wird nach der Schluss-Iteration ueberschrieben
    // (siehe return). Hier trotzdem den Getter nutzen, um nicht versehentlich
    // eine veraltete Const-Referenz zu setzen.
    eventLog: issueLogger.eventLog,
  };
  // Schluss-Iteration: nur die Sanitizer-Issues, die WAHREND des Return-Objekt-
  // Aufbaus NEU in `issues` gepusht wurden. Damit landen 'invalid integer',
  // 'invalid boolean', 'invalid tickets array', 'dropped unknown
  // upgrade/achievement IDs' etc. sowohl im internen eventLog als auch im
  // externen Hook — vorher gingen sie stillschweigend verloren, weil die
  // urspruegliche issues-Schleife VOR den Sanitizer-Calls lief.
  for (let i = initialIssuesLength; i < issues.length; i++) report(issues[i]);
  // Aktuellen eventLog aus dem Logger lesen (alle report()-Aufrufe mutieren
  // den internen let eventLog; das eventLog-Feld in `built` wurde aber VOR
  // diesen Meldungen gesetzt — jetzt ueberschreiben mit dem finalen Stand).
  return { ...built, eventLog: issueLogger.eventLog };
}

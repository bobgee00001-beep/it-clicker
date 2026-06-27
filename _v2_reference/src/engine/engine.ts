// Pure, deterministische Game-Engine. KEINE UI-/Framework-Imports.
// Jede Funktion ist eine reine Transformation des States. Die Engine besitzt
// das Zeitmodell (tick), die UI interpoliert nur.
import { SCALE, type GameState, type GeneratorDef, type AchievementDef, type TicketType } from './types';
import {
  GENERATORS,
  UPGRADES,
  ACHIEVEMENTS,
  ENGINE_VERSION,
  OFFLINE_CAP_MS,
  PRESTIGE_THRESHOLD_SCALED,
  SHARE_MULT_BASE,
  RNG_DEFAULT_SEED,
  getGenerator,
  getUpgrade,
} from './config';
import { workerCpsScaled, isWorker } from './workers';
import { cpsPerTicketBonus } from './itsm';
import { effectiveClickScaled as clickBoostEffectiveClickScaled } from './clickBoost';
import {
  spawnTicket as engineSpawnTicket,
  updateTickets,
  updateSev1,
  checkSev1Threshold,
  decayCpsPenalty,
} from './tickets';
import { createEventLog, addEvent, type EventLog } from './eventLog';
import {
  checkPagerDuty,
  checkMondayMorning,
  trackFastTicket,
  trackSpend,
  trackMaxCyclesNoUpgrades,
  resetMaxCyclesNoUpgrades,
  trackMondayClick,
} from './timegates';
import { updateReleaseTrain } from './release';
import { updateObservability } from './observability';

export function resolveTicket(s: GameState, idx: number, nowMs?: number): GameState {
  if (idx < 0 || idx >= s.tickets.length) return s;
  const t = s.tickets[idx];
  const resolveTimeMs =
    typeof nowMs === 'number' && t.spawnTime > 0 ? Math.max(0, nowMs - t.spawnTime) : FAST_TICKET_THRESHOLD_MS + 1;
  const reward = t.rewardScaled * BigInt(Math.max(1, Math.trunc(s.multiplier)));
  const nextTickets = [...s.tickets];
  nextTickets.splice(idx, 1);
  const resolved: GameState = {
    ...s,
    cyclesScaled: s.cyclesScaled + reward,
    totalEarnedScaled: s.totalEarnedScaled + reward,
    tickets: nextTickets,
    ticketsResolved: s.ticketsResolved + 1,
    lastTicketSpawn: s.lastTicketSpawn,
  };
  const tracked = trackFastTicket(resolved, resolveTimeMs);
  return withResolvedEvent(tracked, t);
}

const FAST_TICKET_THRESHOLD_MS = 2000;

/** Ticket entfernen mit CPS-Penalty (expliziter Expire, falls nötig). */
export function expireTicket(s: GameState, idx: number): GameState {
  if (idx < 0 || idx >= s.tickets.length) return s;
  const t = s.tickets[idx];
  const nextTickets = [...s.tickets];
  nextTickets.splice(idx, 1);
  const penalized: GameState = {
    ...s,
    tickets: nextTickets,
    ticketsExpired: s.ticketsExpired + 1,
    cpsPenalty: 0.8,
    cpsPenaltyTimer: 30,
    lastTicketSpawn: s.lastTicketSpawn,
  };
  return withExpiredEvent(penalized, 1);
}
export { createEventLog, addEvent, setFilter, clear, filteredEntries, eventCount } from './eventLog';
export type { EventLog, GameEvent, Severity, EventCategory } from './eventLog';

export function createInitialState(nowMs: number): GameState {
  return {
    cyclesScaled: 0n,
    totalEarnedScaled: 0n,
    workerEarnedScaled: 0n,
    clickPowerScaled: 1n * SCALE,
    generators: {},
    upgrades: {},
    upgradesEverBought: false,
    achievements: {},
    clicks: 0n,
    sessionClicks: 0,
    prestige: 0,
    prestigePoints: 0,
    multiplier: 1,
    tickets: [],
    ticketsResolved: 0,
    ticketsExpired: 0,
    sev1Active: false,
    sev1Timer: 0,
    sev1Survived: false,
    cpsPenalty: 1,
    cpsPenaltyTimer: 0,
    achievementProgress: {},
    p1AutoClosed: 0,
    fastTickets: 0,
    maxSpendIn60s: 0n,
    spendEvents: [],
    allCategoriesMaxed: false,
    maxSimultaneousP1: 0,
    mondayClicks: 0,
    passiveEarnedSinceLastClick: 0n,
    pagerDutyTriggered: false,
    pagerDutyDate: null,
    legacyCodeTriggered: false,
    maxCyclesWithoutUpgrades: 0n,
    deploysStarted: 0,
    successfulDeploys: 0,
    failedDeploys: 0,
    lastDeployAt: null,
    releaseStatus: 'idle',
    releaseStageIndex: -1,
    releaseStageTimer: 0,
    releaseDeployBonusTimer: 0,
    releaseDeployBonusMultiplier: 1,
    releaseMessage: 'Change Window bereit.',
    rollbacksPerformed: 0,
    lastRollbackAt: null,
    // Determinismus-Kern (Phase-3 Leaderboard): rngSeed ist eine fixe
    // 64-bit-Konstante aus config, deployCounter startet bei 0 und steigt
    // pro Deploy in startDeploy(). Strikt ONLINE — offline ändert sich der
    // Counter NICHT (Whitelist: applyOffline ruft updateReleaseTrain nicht).
    rngSeed: RNG_DEFAULT_SEED,
    deployCounter: 0n,
    errorBudget: 100,
    observabilityScore: 82,
    activeIncidents: 0,
    uptime: 99.95,
    errorRate: 0.05,
    monitoringTimer: 0,
    rollbackAvailable: false,
    cleanMonitoringWindows: 0,
    lastDeploymentQuality: 'No deploys yet',
    observabilityMessage: 'Keine aktive Release-Beobachtung.',
    lastReleaseEvidence: 'Noch keine Release-Evidenz.',
    masterVolume: 1.0,
    muted: false,
    selectedSound: 'none',
    sessionStart: nowMs,
    sessionPlayTime: 0,
    lastOnline: 0,
    lastTick: nowMs,
    lastTicketSpawn: nowMs,
    currentTab: 'hardware',
    shares: 0n,
    prodRemainder: 0n,
    lastSavedMs: nowMs,
    version: ENGINE_VERSION as 5,
    eventLog: createEventLog(),
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

function reduceRat(r: Rational): Rational {
  const g = gcdBig(r.num, r.den);
  return { num: r.num / g, den: r.den / g };
}

function mulRat(a: Rational, b: Rational): Rational {
  return reduceRat({ num: a.num * b.num, den: a.den * b.den });
}

// Float-Faktor (z.B. 1.5, 0.8) EINMAL exakt in einen Rational über den festen
// Nenner 1000 konvertieren — danach reine Integer-Arithmetik (kein Float im
// Akkumulationspfad). Ein Re-Verifier bildet round(x*1000)/1000 deterministisch
// nach. Für die kanonischen Werte ist das exakt (1.5 -> 3/2, 0.8 -> 4/5).
function floatToRational(x: number): Rational {
  return reduceRat({ num: BigInt(Math.round(x * 1000)), den: 1000n });
}

// Kombinierter temporaler CPS-Faktor (Deploy-Bonus × SLA-Penalty) bei gegebenen
// Aktiv-Flags. Multiplikation ist kommutativ => reihenfolge-unabhängig => det.
function temporalFactor(s: GameState, penaltyOn: boolean, bonusOn: boolean): Rational {
  let f: Rational = { num: 1n, den: 1n };
  if (penaltyOn && s.cpsPenalty !== 1) f = mulRat(f, floatToRational(s.cpsPenalty));
  if (bonusOn && s.releaseDeployBonusMultiplier !== 1) f = mulRat(f, floatToRational(s.releaseDeployBonusMultiplier));
  return f;
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
  // Multiplikator-Komposition ist kommutativ => Reihenfolge-unabhängig.
  // Per-Generator-Upgrades (inkl. Worker) nutzen die perGen-Rational.
  for (const u of UPGRADES) {
    const level = upgradeLevel(s, u.id);
    for (let i = 0; i < level; i++) {
      if (u.target.kind === 'globalProd') {
        global = mulReduce(global, u.factorNum, u.factorDen);
      } else if (u.target.kind === 'click') {
        click = mulReduce(click, u.factorNum, u.factorDen);
      } else if (u.target.kind === 'generator' && !isWorker(u.target.genId)) {
        const gid = u.target.genId;
        perGen[gid] = mulReduce(perGen[gid] ?? { num: 1n, den: 1n }, u.factorNum, u.factorDen);
      } // clickAdd / itsm / worker-generators werden separat behandelt.
    }
  }
  // Freigeschaltete Achievements: permanenter Bonus, gleiche Rational-Komposition.
  for (const a of ACHIEVEMENTS) {
    if ((s.achievements[a.id] ?? 0) < 1) continue;
    if (a.target.kind === 'globalProd') {
      global = mulReduce(global, a.factorNum, a.factorDen);
    } else if (a.target.kind === 'click') {
      click = mulReduce(click, a.factorNum, a.factorDen);
    } else if (a.target.kind === 'generator' && !isWorker(a.target.genId)) {
      const gid = a.target.genId;
      perGen[gid] = mulReduce(perGen[gid] ?? { num: 1n, den: 1n }, a.factorNum, a.factorDen);
    } // clickAdd / itsm / worker-achievements werden separat behandelt.
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
    default:
      return false;
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

// Passive Basisrate pro Sekunde (scaled) OHNE temporale Faktoren. Das ist die
// offline-whitelisted Rate (DESIGN: offline NUR passive Produktion).
// KANONISCH: ein einziger Floor PRO GENERATOR —
//   effRate_g = floor( baseRate_g * count_g * globalNum * genNum / (globalDen * genDen) )
// Multiplikation VOR Division, eine Division je Generator. Reihenfolge-unabhängig.
export function productionPassiveRateScaled(s: GameState): bigint {
  const m = multipliers(s);
  let rate = 0n;
  for (const def of GENERATORS) {
    // Worker-Generatoren laufen als Auto-Clicker, nicht als passive Produktion.
    if (isWorker(def.id)) continue;
    const count = BigInt(genCount(s, def.id));
    if (count === 0n) continue;
    const g = m.perGen[def.id] ?? { num: 1n, den: 1n };
    // Zusammengesetzte Rationale: global * perGen.
    const composedNum = m.global.num * g.num;
    const composedDen = m.global.den * g.den;
    // Einzelner Floor pro Generator: floor(baseRate * count * composedNum / composedDen).
    const num = def.baseRateScaled * count * composedNum;
    rate += num / composedDen;
  }
  // ITSM-Autoticket-Bonus: +1% CPS pro Ticket × Quellen — als BONUS auf die Rate
  // (factor = 1 + bonus), NICHT als Faktor < 1. (Früher: rate*bonus => 99%-Nerf.)
  const autoTicketBonus = cpsPerTicketBonus(s);
  if (autoTicketBonus !== 0) {
    const factorNum = 10000n + BigInt(Math.round(autoTicketBonus * 10000));
    rate = (rate * factorNum) / 10000n;
  }
  return rate;
}

// Effektive (angezeigte) Produktion pro Sekunde inkl. aktuell AKTIVER temporaler
// Faktoren (Deploy-Bonus / SLA-Penalty). Für UI & Tests. Die zeit-korrekte
// Integration über ein dt passiert segmentiert in produce(), nicht hier.
export function productionPerSecScaled(s: GameState): bigint {
  const base = productionPassiveRateScaled(s);
  const penaltyOn = s.cpsPenaltyTimer > 0 && s.cpsPenalty !== 1;
  const bonusOn = s.releaseDeployBonusTimer > 0 && s.releaseDeployBonusMultiplier !== 1;
  const f = temporalFactor(s, penaltyOn, bonusOn);
  return (base * f.num) / f.den;
}

// Effektive Klick-Power = (Basis + Additive) × Click-Multiplikatoren.
// Basis bleibt im State; der Multiplikator wird abgeleitet (keine mutierte
// Effektiv-Zahl). Click-Additives und -Multiplikatoren werden in
// engine/clickBoost.ts verwaltet.
export function effectiveClickScaled(s: GameState): bigint {
  return clickBoostEffectiveClickScaled(s);
}

export function click(s: GameState, now?: Date): GameState {
  const gain = effectiveClickScaled(s);
  const clicked: GameState = {
    ...s,
    cyclesScaled: s.cyclesScaled + gain,
    totalEarnedScaled: s.totalEarnedScaled + gain,
    clicks: s.clicks + 1n,
    sessionClicks: s.sessionClicks + 1,
  };
  const tracked = trackMondayClick(clicked, now ?? new Date(0));
  return evaluateAchievements(tracked);
}

/** Öffentlicher Ticket-Spawn inkl. EventLog-Eintrag + SEV1-Threshold-Check. */
export function spawnTicket(s: GameState, rng?: () => number): GameState {
  const prevCount = s.tickets.length;
  let next = engineSpawnTicket(s, rng);
  if (next.tickets.length > prevCount) {
    const t = next.tickets[next.tickets.length - 1];
    next = {
      ...next,
      eventLog: addEvent(
        next.eventLog,
        `${t.title} (${t.type.toUpperCase()}) eingegangen.`,
        t.type === 'p1' ? 'critical' : t.type === 'p2' ? 'warning' : 'info',
        'ticket',
        { ticketId: t.id, type: t.type },
      ),
    };
  }
  return checkSev1Threshold(next);
}

function withExpiredEvent(s: GameState, count: number): GameState {
  if (count === 0 || !s.eventLog) return s;
  return {
    ...s,
    eventLog: addEvent(
      s.eventLog,
      `${count} Ticket(s) abgelaufen (SLA-Breach).`,
      'critical',
      'ticket',
      { expiredCount: count },
    ),
  };
}

function withResolvedEvent(s: GameState, t: { title: string; type: TicketType }): GameState {
  if (!s.eventLog) return s;
  return {
    ...s,
    eventLog: addEvent(
      s.eventLog,
      `${t.title} (${t.type.toUpperCase()}) gelöst.`,
      'success',
      'ticket',
      { type: t.type },
    ),
  };
}

function withSev1Event(s: GameState): GameState {
  if (!s.eventLog) return s;
  return {
    ...s,
    eventLog: addEvent(
      s.eventLog,
      'SEV1-Kaskade ausgelöst! Zu viele offene Tickets.',
      'critical',
      'sev1',
      { openTickets: s.tickets.length },
    ),
  };
}

function withSev1RecoveredEvent(s: GameState): GameState {
  if (!s.eventLog) return s;
  return {
    ...s,
    eventLog: addEvent(
      s.eventLog,
      'SEV1-Kaskade unter Kontrolle.',
      'success',
      'sev1',
      { openTickets: s.tickets.length },
    ),
  };
}

export function canAfford(s: GameState, id: string): boolean {
  const def = getGenerator(id);
  if (!def) return false;
  return s.cyclesScaled >= nextCostScaled(def, genCount(s, id));
}

export function buyGenerator(s: GameState, id: string, nowMs?: number): GameState {
  const def = getGenerator(id);
  if (!def) return s;
  const owned = genCount(s, id);
  const cost = nextCostScaled(def, owned);
  if (s.cyclesScaled < cost) return s;
  const bought: GameState = {
    ...s,
    cyclesScaled: s.cyclesScaled - cost,
    generators: { ...s.generators, [id]: owned + 1 },
    upgradesEverBought: true,
  };
  const tracked = trackSpend(bought, cost, nowMs ?? 0);
  return evaluateAchievements(tracked);
}

export function canAffordUpgrade(s: GameState, id: string): boolean {
  const def = getUpgrade(id);
  if (!def) return false;
  if (upgradeLevel(s, id) >= def.maxLevel) return false;
  return s.cyclesScaled >= def.costScaled;
}

export function buyUpgrade(s: GameState, id: string, nowMs?: number): GameState {
  const def = getUpgrade(id);
  if (!def) return s;
  const level = upgradeLevel(s, id);
  if (level >= def.maxLevel) return s;
  if (s.cyclesScaled < def.costScaled) return s;
  const bought: GameState = {
    ...s,
    cyclesScaled: s.cyclesScaled - def.costScaled,
    upgrades: { ...s.upgrades, [id]: level + 1 },
  };
  const withSpend = trackSpend(bought, def.costScaled, nowMs ?? 0);
  const withReset = resetMaxCyclesNoUpgrades(withSpend);
  return evaluateAchievements({ ...withReset, upgradesEverBought: true });
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
//
// applyTemporal=true (online/tick): temporale Faktoren (Deploy-Bonus, SLA-Penalty)
// sind ZEIT-BEGRENZT. Das Intervall wird an den Timer-Grenzen SEGMENTIERT, damit
// tick(dt) bit-identisch zu N Sub-Ticks ist — die Grenzen liegen an ABSOLUTEN
// Timer-Ablaufzeitpunkten (timer*1000 ms), nicht an der Tick-Größe. Pro Segment
// EIN Floor (floor(rate*num/den)); der Sub-Unit-Rest wird über accrue()
// segmentübergreifend getragen. Bisher: temporaler Faktor auf das GANZE dt
// angewandt => tick(125s) gab 125s Bonus statt 120s (Online/Offline-Drift).
//
// applyTemporal=false (offline): KEINE temporalen Faktoren (Whitelist) — reine
// passive Basisrate über das ganze dt.
function produce(
  s: GameState,
  dtMs: number,
  includeWorkerCps: boolean,
  applyTemporal: boolean,
): { state: GameState; gainedScaled: bigint } {
  const clickPower = effectiveClickScaled(s);
  const workerCps = includeWorkerCps ? workerCpsScaled(s, clickPower) : 0n;
  // Basisrate vor temporalem Faktor (Bonus/Penalty wirken global auf passive
  // Produktion UND Worker-CPS — beide sind globale CPS-Effekte).
  const baseRate = productionPassiveRateScaled(s) + workerCps;
  const dt = Math.max(0, Math.trunc(dtMs));
  let remainder = s.prodRemainder;
  let gained = 0n;

  if (!applyTemporal) {
    const r = accrue(baseRate, dt, remainder);
    gained = r.gainScaled;
    remainder = r.remainder;
  } else {
    const penaltyActive = s.cpsPenaltyTimer > 0 && s.cpsPenalty !== 1;
    const bonusActive = s.releaseDeployBonusTimer > 0 && s.releaseDeployBonusMultiplier !== 1;
    // round (nicht floor): Timer sind Float-Sekunden; round minimiert den
    // ±1ms-Boundary-Drift aus Float-Akkumulation. Voll partitionsfest wären
    // Integer-ms-Timer (Follow-up — würde tickets.ts/release.ts/save mitziehen).
    const penaltyEndMs = penaltyActive ? Math.max(0, Math.round(s.cpsPenaltyTimer * 1000)) : 0;
    const bonusEndMs = bonusActive ? Math.max(0, Math.round(s.releaseDeployBonusTimer * 1000)) : 0;
    // Distinkte Grenzen STRICT innerhalb (0, dt); Grenze == dt bleibt im letzten Segment.
    const bounds = [...new Set([penaltyEndMs, bonusEndMs])].filter((b) => b > 0 && b < dt).sort((a, b) => a - b);
    const points = [0, ...bounds, dt];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const segMs = points[i + 1] - a;
      if (segMs <= 0) continue;
      // Timer ist im Segment [a, a+segMs) aktiv, solange seine Grenze > a liegt.
      const f = temporalFactor(s, penaltyActive && penaltyEndMs > a, bonusActive && bonusEndMs > a);
      const effRate = (baseRate * f.num) / f.den;
      const r = accrue(effRate, segMs, remainder);
      gained += r.gainScaled;
      remainder = r.remainder;
    }
  }

  // Basis-Worker-Ertrag (Stat/Persistenz, NICHT reward-relevant — kein Achievement
  // liest workerEarnedScaled). Bewusst UN-faktoriert; die temporal-faktorierte
  // Worker-Produktion fließt korrekt in `gained` ein.
  const workerEarned = includeWorkerCps ? (workerCps * BigInt(dt)) / 1000n : 0n;
  return {
    state: {
      ...s,
      cyclesScaled: s.cyclesScaled + gained,
      totalEarnedScaled: s.totalEarnedScaled + gained,
      workerEarnedScaled: s.workerEarnedScaled + workerEarned,
      prodRemainder: remainder,
    },
    gainedScaled: gained,
  };
}

// Sim um dtMs vorrücken. Deterministisch gegeben (state, dtMs). Passive Produktion + Worker-CPS + Tickets + SEV1.
// Kein Early-Return bei gain==0: der Übertrag muss IMMER fortgeschrieben werden.
export function tick(s: GameState, dtMs: number, nowMs?: number): GameState {
  if (dtMs <= 0) return s;
  let state = produce(s, dtMs, true, true).state;
  // Ticket-Lebenszyklus (SLA-Decay, Auto-Close, Expire). Expired-Count über das
  // ticketsExpired-Delta — sonst würden Auto-Closes (Tickets verschwinden OHNE
  // Expire) fälschlich als SLA-Breach geloggt.
  const preExpired = state.ticketsExpired;
  state = updateTickets(state, dtMs);
  const expiredCount = state.ticketsExpired - preExpired;
  if (expiredCount > 0) {
    state = withExpiredEvent(state, expiredCount);
  }
  // SEV1-Threshold und Timer.
  const preSev1 = state.sev1Active;
  state = checkSev1Threshold(state);
  if (state.sev1Active && !preSev1) {
    state = withSev1Event(state);
  }
  state = updateSev1(state, dtMs);
  if (!state.sev1Active && preSev1) {
    state = withSev1RecoveredEvent(state);
  }
  // CPS-Penalty-Decay.
  state = decayCpsPenalty(state, dtMs);
  // Timegates (PagerDuty, Monday-Morning-Reset).
  const now = typeof nowMs === 'number' ? new Date(nowMs) : new Date(0);
  state = checkPagerDuty(state, now);
  state = checkMondayMorning(state, now);
  state = trackMaxCyclesNoUpgrades(state);
  // Release Train + Observability. nowMs an updateReleaseTrain durchreichen, damit
  // ein während tick() abschließender Deploy echte Timestamps in lastDeployAt bekommt.
  state = updateReleaseTrain(state, dtMs, undefined, nowMs);
  state = updateObservability(state, dtMs);
  // Hinweis: releaseDeployBonusMultiplier wird allein in release.ts verwaltet
  // (finishDeploy setzt 1.5, updateDeployBonusTimer setzt bei Ablauf auf 1) —
  // single source of truth, kein doppeltes Setzen hier.
  return evaluateAchievements(state);
}

// Altert die zeit-begrenzten temporalen Effekte (SLA-Penalty, Deploy-Bonus) um
// elapsedMs und normalisiert abgelaufene Zustände. Genutzt im Offline-Pfad: die
// Effekte laufen während der Abwesenheit ab, statt eingefroren zu bleiben.
function ageTemporalTimers(s: GameState, elapsedMs: number): GameState {
  const dtSec = Math.max(0, elapsedMs) / 1000;
  let next = s;
  if (next.cpsPenaltyTimer > 0) {
    const t = Math.max(0, next.cpsPenaltyTimer - dtSec);
    next = t === 0 ? { ...next, cpsPenaltyTimer: 0, cpsPenalty: 1 } : { ...next, cpsPenaltyTimer: t };
  }
  if (next.releaseDeployBonusTimer > 0) {
    const t = Math.max(0, next.releaseDeployBonusTimer - dtSec);
    if (t === 0) {
      next = {
        ...next,
        releaseDeployBonusTimer: 0,
        releaseDeployBonusMultiplier: 1,
        releaseStatus: next.releaseStatus === 'success' ? 'idle' : next.releaseStatus,
        releaseStageIndex: next.releaseStatus === 'success' ? -1 : next.releaseStageIndex,
        releaseMessage: next.releaseStatus === 'success' ? 'Change Window bereit.' : next.releaseMessage,
      };
    } else {
      next = { ...next, releaseDeployBonusTimer: t };
    }
  }
  return next;
}

// Offline-Earnings: NUR passive Produktion (harte Whitelist aus DESIGN.md),
// über Δt akkumuliert (gleiche accrue-Logik wie online), gedeckelt. Keine
// Auto-Buyer/Achievements/Zufall offline. Math.trunc gegen fraktionale lastSavedMs.
export function applyOffline(
  s: GameState,
  nowMs: number,
): { state: GameState; gainedScaled: bigint; elapsedMs: number } {
  const rawElapsedMs = Math.max(0, Math.trunc(nowMs - s.lastSavedMs));
  const elapsedMs = Math.min(rawElapsedMs, OFFLINE_CAP_MS);
  const { state: produced, gainedScaled } = produce(s, elapsedMs, false, false);
  // Temporale Timer altern über die ECHTE (ungedeckelte) Abwesenheit — sonst
  // überlebt ein Deploy-Bonus/SLA-Penalty die Offline-Lücke und wird online
  // nachgeholt (Exploit). Produktion selbst bleibt strikt passiv (Whitelist).
  const aged = ageTemporalTimers({ ...produced, lastSavedMs: nowMs }, rawElapsedMs);
  return { state: aged, gainedScaled, elapsedMs };
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
    version: ENGINE_VERSION as 5,
  });
}

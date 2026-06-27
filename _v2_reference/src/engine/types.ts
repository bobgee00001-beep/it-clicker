// Kanonische Numerik: alles im autoritativen Pfad ist Integer (bigint) in
// Fixed-Point. SCALE = Untereinheiten pro Cycle. break_infinity wird NUR fürs
// Display benutzt (siehe ../lib/format.ts), nie hier in der Engine.
export const SCALE = 1000n; // milli-cycles

export type Scaled = bigint; // cycles * SCALE

export type TicketType = 'p3' | 'p2' | 'p1';

export type ReleaseStatus =
  | 'idle'
  | 'building'
  | 'testing'
  | 'security'
  | 'deploying'
  | 'observing'
  | 'success'
  | 'failed';

export type DeploymentQuality =
  | 'No deploys yet'
  | 'clean'
  | 'degraded'
  | 'failed'
  | 'rolled back'
  | 'bad';

export type SoundThemeId = 'none' | 'dialup' | 'mechanical' | 'retro' | 'scifi';

export interface SoundThemeDef {
  id: SoundThemeId;
  name: string;
  description: string;
  unlockAt: number; // Prestige-Level ab dem freigeschaltet (0 = immer)
}

export interface Ticket {
  id: string;
  type: TicketType;
  title: string;
  sla: number; // verbleibende Sekunden (float, da dt=float)
  maxSla: number; // ursprüngliche SLA
  rewardScaled: Scaled; // v1: number reward; hier * SCALE
  autoCloseTimer: number; // Sekunden bis Auto-Close (0 = kein Auto-Close)
  spawnTime: number; // Date.now() ms
}

export interface SpendEvent {
  time: number; // Date.now() ms
  amountScaled: Scaled; // ausgegebene Cycles
}

export interface ReleaseStage {
  name: string;
  durationSeconds: number;
  riskModifier: number; // 0–1, additiv zu Baseline-Risiko
}

// Generatoren sind eigenständige, wiederholbar kaufbare Produktionseinheiten
// (v1: baseCost, baseCps, costGrowth 1.15x).
export interface GeneratorDef {
  id: string;
  name: string;
  flavor: string;
  baseCostScaled: Scaled; // Kosten der ersten Einheit
  costGrowthNum: bigint; // Kostenwachstum Zähler (z.B. 115)
  costGrowthDen: bigint; // Kostenwachstum Nenner (z.B. 100) -> 1.15x
  baseRateScaled: Scaled; // Produktion pro Sekunde pro Einheit
}

export interface UpgradeDef {
  id: string;
  name: string;
  flavor: string;
  costScaled: Scaled;
  maxLevel: number;
  target:
    | { kind: 'generator'; genId: string } // boostet einen Generator
    | { kind: 'globalProd' } // boostet alle Generatoren
    | { kind: 'click' } // boostet Klick-Power multiplikativ
    | { kind: 'clickAdd'; addScaled: Scaled } // boostet Klick-Power additiv (v1-Click-Boosts)
    | {
        kind: 'itsm';
        itsmType: 'p3' | 'p2' | 'p1' | 'all';
        autoCloseSeconds: number;
        noSla: boolean;
        cpsPerTicket?: number;
      };
  // Faktoren als exakte Rationale. Phase 2a: maxLevel=1; state.level bleibt
  // number, damit später gestaffelte Upgrades ohne State-Migration nachrüstbar sind.
  factorNum: bigint;
  factorDen: bigint;
}

export type AchievementTarget =
  | { kind: 'generator'; genId: string }
  | { kind: 'globalProd' }
  | { kind: 'click' }
  | { kind: 'clickAdd'; addScaled: Scaled }
  | {
      kind: 'itsm';
      itsmType: 'p3' | 'p2' | 'p1' | 'all';
      autoCloseSeconds: number;
      noSla: boolean;
      cpsPerTicket?: number;
    };

export type MetricId =
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

export type BooleanFlagId =
  | 'upgradesEverBought'
  | 'sev1Survived'
  | 'pagerDutyTriggered'
  | 'legacyCodeTriggered'
  | 'allCategoriesMaxed';

export type TimegateId = 'pagerDuty' | 'mondayMorning';

export type AchievementCondition =
  // Neue Union-Kinds aus Stage 4
  | { kind: 'threshold'; metric: MetricId; threshold: number }
  | { kind: 'composite'; all: AchievementCondition[] }
  | { kind: 'boolean-flag'; flag: BooleanFlagId }
  | { kind: 'timegate'; gate: TimegateId }
  // Bestehende (migration-paths.md §6.2)
  | { kind: 'totalEarned'; atLeastScaled: bigint }
  | { kind: 'genCount'; genId: string; atLeast: number }
  | { kind: 'totalGenerators'; atLeast: number }
  | { kind: 'shares'; atLeast: bigint }
  | { kind: 'clicks'; atLeast: bigint }
  | { kind: 'ticketsResolved'; atLeast: number }
  | { kind: 'ticketsExpired'; atLeast: number }
  | { kind: 'fastTickets'; atLeast: number }
  | { kind: 'p1AutoClosed'; atLeast: number }
  | { kind: 'mondayClicks'; atLeast: number }
  | { kind: 'sessionClicks'; atLeast: number }
  | { kind: 'maxCyclesNoUpgrades'; atLeastScaled: bigint }
  | { kind: 'maxSimultaneousP1'; atLeast: number }
  | { kind: 'maxSpendIn60s'; atLeastScaled: bigint }
  | { kind: 'successfulDeploys'; atLeast: number }
  | { kind: 'failedDeploys'; atLeast: number }
  | { kind: 'rollbacksPerformed'; atLeast: number }
  | { kind: 'cleanMonitoringWindows'; atLeast: number }
  | { kind: 'prestigeCount'; atLeast: number }
  | { kind: 'anyUpgradeBought' }
  | { kind: 'pagerDutyTriggered' }
  | { kind: 'legacyCodeTriggered' }
  | { kind: 'allCategoriesMaxed' }
  | { kind: 'sev1Survived' }
  | { kind: 'migrationMaster' }
  | { kind: 'unicornStartup' }
  | { kind: 'rollbackReady' }
  | { kind: 'teamLead'; workerIds: readonly string[] };

export interface AchievementDef {
  id: string;
  name: string;
  flavor: string;
  condition: AchievementCondition;
  target: AchievementTarget;
  factorNum: bigint;
  factorDen: bigint;
}

export interface GameState {
  // ── Währung ──────────────────────────────────────────────────────────────
  cyclesScaled: Scaled;
  totalEarnedScaled: Scaled;
  workerEarnedScaled: Scaled;
  clickPowerScaled: Scaled;

  // ── Generatoren & Upgrades ───────────────────────────────────────────────
  generators: Record<string, number>; // id -> Anzahl
  upgrades: Record<string, number>; // id -> gekauftes Level (0 = nicht gekauft)
  upgradesEverBought: boolean;

  // ── Klicks ───────────────────────────────────────────────────────────────
  clicks: bigint;
  sessionClicks: number;

  // ── Prestige ─────────────────────────────────────────────────────────────
  prestige: number;
  prestigePoints: number;
  multiplier: number;

  // ── Tickets / SLA ────────────────────────────────────────────────────────
  tickets: Ticket[];
  ticketsResolved: number;
  ticketsExpired: number;

  // ── SEV1 ───────────────────────────────────────────────────────────────────
  sev1Active: boolean;
  sev1Timer: number;
  sev1Survived: boolean;

  // ── CPS-Penalty (SLA-Breach) ─────────────────────────────────────────────
  cpsPenalty: number;
  cpsPenaltyTimer: number;

  // ── Achievements ─────────────────────────────────────────────────────────
  achievements: Record<string, number>;
  achievementProgress: Record<string, number>;

  // ── Achievement-Tracking (Spezial-Flags) ───────────────────────────────────
  p1AutoClosed: number;
  fastTickets: number;
  maxSpendIn60s: Scaled;
  spendEvents: SpendEvent[];
  allCategoriesMaxed: boolean;
  maxSimultaneousP1: number;
  mondayClicks: number;
  passiveEarnedSinceLastClick: Scaled;
  pagerDutyTriggered: boolean;
  pagerDutyDate: string | null;
  legacyCodeTriggered: boolean;
  maxCyclesWithoutUpgrades: Scaled;

  // ── Release Train ──────────────────────────────────────────────────────────
  deploysStarted: number;
  successfulDeploys: number;
  failedDeploys: number;
  lastDeployAt: number | null;
  releaseStatus: ReleaseStatus;
  releaseStageIndex: number;
  releaseStageTimer: number;
  releaseDeployBonusTimer: number;
  releaseDeployBonusMultiplier: number;
  releaseMessage: string;
  rollbacksPerformed: number;
  lastRollbackAt: number | null;

  // ── Determinismus-Kern (Phase-3 Leaderboard) ─────────────────────────────
  // rngSeed: einmaliger Seed (deterministisch oder server-pinned in Phase 3).
  // deployCounter: monoton steigend pro Deploy-Versuch; mit rngSeed gefuettert
  // in splitmix64() ergibt den roll fuer finishDeploy. Strikt ONLINE — offline
  // darf deployCounter NICHT inkrementiert werden, sonst Online/Offline-Drift.
  rngSeed: bigint;
  deployCounter: bigint;

  // ── Observability ────────────────────────────────────────────────────────
  errorBudget: number;
  observabilityScore: number;
  activeIncidents: number;
  uptime: number;
  errorRate: number;
  monitoringTimer: number;
  rollbackAvailable: boolean;
  cleanMonitoringWindows: number;
  lastDeploymentQuality: DeploymentQuality;
  observabilityMessage: string;
  lastReleaseEvidence: string;

  // ── Audio ─────────────────────────────────────────────────────────────────
  masterVolume: number;
  muted: boolean;
  selectedSound: SoundThemeId;

  // ── Timing & Session ─────────────────────────────────────────────────────
  sessionStart: number;
  sessionPlayTime: number;
  lastOnline: number;
  lastTick: number;
  lastTicketSpawn: number;

  // ── UI-Transienten (NICHT persistiert, aber im State für Reactivity) ───────
  currentTab: string;

  // ── v2-spezifische Felder ────────────────────────────────────────────────
  prodRemainder: Scaled;
  shares: bigint;
  lastSavedMs: number;
  version: number;

  // ── EventLog (Engine + UI) ───────────────────────────────────────────────
  eventLog: import('./eventLog').EventLog;
}

export type EngineVersion = typeof import('./config').ENGINE_VERSION;
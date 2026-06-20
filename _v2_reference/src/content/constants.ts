// v1-Spielkonstanten (1:1 übertragen aus index.html).

// Offline-Progress: v1 erlaubte 24h mit 50% Strafe.
export const MAX_OFFLINE_SECONDS = 86_400; // 86.400s (24h)
export const OFFLINE_PENALTY = 0.5; // Multiplikator
export const OFFLINE_CAP_MS = MAX_OFFLINE_SECONDS * 1000;
export const OFFLINE_MIN_MS = 5000; // unter 5s ignorieren

// SEV1-Kaskade: ab 10 gleichzeitig offenen Tickets (v1-Original).
export const SEV1_THRESHOLD_TICKETS = 10;
export const SEV1_TIMER_SECONDS = 10;
export const SEV1_DURATION_SECONDS = SEV1_TIMER_SECONDS;

// Genesis: Gratis-P1-Ticket, das alle 60s spawnen kann, wenn keines offen ist.
export const GENESIS_TICKET_INTERVAL_MS = 60_000;

// Tickets-Cooldown / Spawn-Timer (v1 setInterval alle 1000ms, Intervall-Logik 5000–15000ms).
export const TICKET_SPAWN_INTERVAL_MS = 1_000;
export const TICKET_SPAWN_MIN_MS = 5_000;
export const TICKET_SPAWN_MAX_MS = 15_000;
export const TICKET_MAX_OPEN = 15;
export const TICKET_SPAWN_CHANCE_P3 = 0.6;
export const TICKET_SPAWN_CHANCE_P2 = 0.9;

// Auto-Close-Default ohne Upgrades = 0 (= deaktiviert).
export const DEFAULT_AUTO_CLOSE_SECONDS = 0;

// Engine/Save-Version.
export const ENGINE_VERSION = 5 as const;
export const SAVE_VERSION = 5; // v1 → v2 Migration endet hier

// Klick-Basis.
export const BASE_CLICK_POWER = 1;

// Release-Train-Stages (v1: build/test/security/deploy, je 2.5s).
export const RELEASE_STAGES = [
  { id: 'build', name: 'Build', durationSeconds: 10, riskModifier: 0.0 },
  { id: 'test', name: 'Test', durationSeconds: 15, riskModifier: -0.1 },
  { id: 'security', name: 'Security Scan', durationSeconds: 10, riskModifier: -0.05 },
  { id: 'deploy', name: 'Deploy', durationSeconds: 5, riskModifier: 0.1 },
] as const;

export const RELEASE_STAGE_DURATION_SECONDS = 10;
export const RELEASE_DEPLOY_BONUS_SECONDS = 120; // v1: +25% CPS für 120s
export const MONITORING_WINDOW_SECONDS = 60;

// Prestige-Threshold: v1 zeigt „Prestige" ab 1M Lifetime-Cycles an.
export const PRESTIGE_THRESHOLD_CYCLES = 1_000_000;

// Erfolgs-/Fehlerwahrscheinlichkeiten Release-Train (v1 getDeployRisk).
export const BASE_DEPLOY_RISK = 0.18;
export const MAX_DEPLOY_RISK = 0.85;

// Observability.
export const CLEAN_WINDOWS_FOR_QUALITY = 3;
export const INITIAL_ERROR_BUDGET = 100;
export const INITIAL_OBSERVABILITY_SCORE = 82;
export const INITIAL_UPTIME = 99.95;
export const INITIAL_ERROR_RATE = 0.05;

// UI-Tab-Zuordnung (v1 this.tabs / tabNames).
export const SHOP_TAB_IDS = ['hardware', 'cloud', 'ai', 'click', 'itsm', 'workers'] as const;
export const TAB_NAMES: Record<string, string> = {
  hardware: 'Hardware',
  cloud: 'Cloud',
  ai: 'AI/Quantum',
  click: 'Click',
  itsm: 'ITSM',
  workers: 'Workers',
  achievements: '🏆 Erfolge',
  audio: '🔊 Audio',
};

// EventLog.
export const EVENT_LOG_MAX_ENTRIES = 50;

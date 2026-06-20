// v1-Upgrade-Werte 1:1 auf v2-Fixed-Point übertragen.
// Keine Logik — reine Daten-Exporte.

import { SCALE, type GeneratorDef, type UpgradeDef } from '../engine/types';

// ── Generatoren (Hardware/Cloud/AI + Workers) ──────────────────────────────
// Stackbare Käufe mit 1.15x Kostenwachstum. Werden in UPGRADES als Hybride
// (target.kind='generator') gespiegelt, damit v1-buyUpgrade-Parität erhalten
// bleibt.
export const GENERATORS: GeneratorDef[] = [
  // Hardware
  {
    id: 'pi',
    name: 'Raspberry Pi',
    flavor: 'Klein aber fein',
    baseCostScaled: 10n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: SCALE / 10n, // 0.1 Cycles/s
  },
  {
    id: 'ssd',
    name: 'SSD Drive',
    flavor: 'Schnell wie der Blitz',
    baseCostScaled: 50n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: SCALE / 2n, // 0.5 Cycles/s
  },
  {
    id: 'cpu',
    name: 'Multi-Core CPU',
    flavor: 'Parallel ist besser',
    baseCostScaled: 200n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 2n * SCALE,
  },
  {
    id: 'server',
    name: 'Server Rack',
    flavor: "Rack 'em up!",
    baseCostScaled: 10n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 1n * SCALE,
  },
  {
    id: 'rack',
    name: 'Server Rack (Legacy)',
    flavor: "Rack 'em up!",
    baseCostScaled: 1_000n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 8n * SCALE,
  },
  // Cloud
  {
    id: 'vm',
    name: 'Cloud VM',
    flavor: 'It scales™',
    baseCostScaled: 5_000n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 50n * SCALE,
  },
  {
    id: 'k8s',
    name: 'Kubernetes Cluster',
    flavor: 'Orchestriert das Chaos',
    baseCostScaled: 25_000n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 250n * SCALE,
  },
  {
    id: 'cdn',
    name: 'CDN Edge',
    flavor: 'Weltweit unter 100ms',
    baseCostScaled: 100_000n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 1_000n * SCALE,
  },
  // AI/Quantum
  {
    id: 'ai',
    name: 'AI Auto-Scaler',
    flavor: 'Skaliert, während du schläfst',
    baseCostScaled: 500_000n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 5_000n * SCALE,
  },
  {
    id: 'quantum',
    name: 'Quantum Core',
    flavor: 'Die Zukunft ist jetzt',
    baseCostScaled: 2_000_000n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 25_000n * SCALE,
  },
  // Workers
  {
    id: 'intern',
    name: 'Intern',
    flavor: '1 Auto-Klick alle 2 Sekunden',
    baseCostScaled: 50n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: SCALE / 2n, // 0.5 Cycles/s
  },
  {
    id: 'junior',
    name: 'Junior Dev',
    flavor: '1 Auto-Klick pro Sekunde',
    baseCostScaled: 500n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 1n * SCALE,
  },
  {
    id: 'senior',
    name: 'Senior Engineer',
    flavor: '2 Auto-Klicks pro Sekunde',
    baseCostScaled: 5_000n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 2n * SCALE,
  },
  {
    id: 'staff',
    name: 'Staff Engineer',
    flavor: '4 Auto-Klicks pro Sekunde',
    baseCostScaled: 50_000n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 4n * SCALE,
  },
];

// ── One-Time Upgrades ────────────────────────────────────────────────────────
// Click-Boosts (v1: clickBonus additiv pro Kauf).
export const UPGRADE_KB: UpgradeDef = {
  id: 'kb',
  name: 'Mechanical Keyboard',
  flavor: '+1/Klick',
  costScaled: 100n * SCALE,
  maxLevel: 1,
  target: { kind: 'clickAdd', addScaled: 1n * SCALE },
  factorNum: 1n,
  factorDen: 1n,
};

export const UPGRADE_MOUSE: UpgradeDef = {
  id: 'mouse',
  name: 'Gaming Mouse',
  flavor: '+3/Klick',
  costScaled: 500n * SCALE,
  maxLevel: 1,
  target: { kind: 'clickAdd', addScaled: 3n * SCALE },
  factorNum: 1n,
  factorDen: 1n,
};

export const UPGRADE_MONITOR: UpgradeDef = {
  id: 'monitor',
  name: '4K Monitor Array',
  flavor: '+10/Klick',
  costScaled: 2_500n * SCALE,
  maxLevel: 1,
  target: { kind: 'clickAdd', addScaled: 10n * SCALE },
  factorNum: 1n,
  factorDen: 1n,
};

export const UPGRADE_NEURAL: UpgradeDef = {
  id: 'neural',
  name: 'Neural Interface',
  flavor: '+50/Klick',
  costScaled: 15_000n * SCALE,
  maxLevel: 1,
  target: { kind: 'clickAdd', addScaled: 50n * SCALE },
  factorNum: 1n,
  factorDen: 1n,
};

// ── ITSM (5) ───────────────────────────────────────────────────────────────
export const UPGRADE_BOT: UpgradeDef = {
  id: 'bot',
  name: 'Helpdesk Bot',
  flavor: 'Auto-close P3 nach 5 Sek',
  costScaled: 500n * SCALE,
  maxLevel: 1,
  target: { kind: 'itsm', itsmType: 'p3', autoCloseSeconds: 5, noSla: false },
  factorNum: 1n,
  factorDen: 1n,
};

export const UPGRADE_NOC: UpgradeDef = {
  id: 'noc',
  name: 'NOC Team',
  flavor: 'Auto-close P2 nach 10 Sek',
  costScaled: 3_000n * SCALE,
  maxLevel: 1,
  target: { kind: 'itsm', itsmType: 'p2', autoCloseSeconds: 10, noSla: false },
  factorNum: 1n,
  factorDen: 1n,
};

export const UPGRADE_TRIAGING: UpgradeDef = {
  id: 'triaging',
  name: 'AI Triaging',
  flavor: 'Keine SLA auf P3',
  costScaled: 15_000n * SCALE,
  maxLevel: 1,
  target: { kind: 'itsm', itsmType: 'p3', autoCloseSeconds: 0, noSla: true },
  factorNum: 1n,
  factorDen: 1n,
};

export const UPGRADE_RUNBOOK: UpgradeDef = {
  id: 'runbook',
  name: 'Runbook Automation',
  flavor: 'Auto-close P1 nach 20 Sek',
  costScaled: 75_000n * SCALE,
  maxLevel: 1,
  target: { kind: 'itsm', itsmType: 'p1', autoCloseSeconds: 20, noSla: false },
  factorNum: 1n,
  factorDen: 1n,
};

export const UPGRADE_AUTOTICKET: UpgradeDef = {
  id: 'autoticket',
  name: 'Auto-Ticketing',
  flavor: '+1% CPS pro Ticket',
  costScaled: 200_000n * SCALE,
  maxLevel: 1,
  target: { kind: 'itsm', itsmType: 'all', autoCloseSeconds: 0, noSla: false, cpsPerTicket: 0.01 },
  factorNum: 1n,
  factorDen: 1n,
};

// ── Hybride Upgrades für Generatoren (v1-buyUpgrade-Parität) ───────────────
// Jeder Generator hat einen UpgradeDef-Zwilling: Kauf über buyUpgrade leitet
// auf buyGenerator um. Faktor ist neutral (1/1), damit die Produktion über die
// Generator-Anzahl im State erfolgt.
function makeGeneratorUpgrade(def: GeneratorDef): UpgradeDef {
  return {
    id: def.id,
    name: def.name,
    flavor: def.flavor,
    costScaled: def.baseCostScaled,
    maxLevel: 1,
    target: { kind: 'generator', genId: def.id },
    factorNum: 1n,
    factorDen: 1n,
  };
}

export const HARDWARE_UPGRADES: UpgradeDef[] = GENERATORS.filter((g) =>
  ['pi', 'ssd', 'cpu', 'server'].includes(g.id),
).map(makeGeneratorUpgrade);

export const CLOUD_UPGRADES: UpgradeDef[] = GENERATORS.filter((g) =>
  ['vm', 'k8s', 'cdn'].includes(g.id),
).map(makeGeneratorUpgrade);

export const AI_UPGRADES: UpgradeDef[] = GENERATORS.filter((g) =>
  ['ai', 'quantum'].includes(g.id),
).map(makeGeneratorUpgrade);

export const CLICK_UPGRADES: UpgradeDef[] = [
  {
    id: 'click-mech-kb',
    name: 'Mechanical Keyboard',
    flavor: '×2/Klick',
    costScaled: 100n * SCALE,
    maxLevel: 1,
    target: { kind: 'click' },
    factorNum: 2n,
    factorDen: 1n,
  },
  {
    id: 'click-macro',
    name: 'Click Macro',
    flavor: '×3/Klick',
    costScaled: 500n * SCALE,
    maxLevel: 1,
    target: { kind: 'click' },
    factorNum: 3n,
    factorDen: 1n,
  },
  UPGRADE_NEURAL,
];

export const GENERATOR_UPGRADES: UpgradeDef[] = [
  {
    id: 'server-ssd',
    name: 'Server SSD',
    flavor: '×2 Server',
    costScaled: 1_000n * SCALE,
    maxLevel: 1,
    target: { kind: 'generator', genId: 'server' },
    factorNum: 2n,
    factorDen: 1n,
  },
  {
    id: 'global-overtime',
    name: 'Global Overtime',
    flavor: '×5/4 alle Generatoren',
    costScaled: 5_000n * SCALE,
    maxLevel: 1,
    target: { kind: 'globalProd' },
    factorNum: 5n,
    factorDen: 4n,
  },
  {
    id: 'global-edge',
    name: 'Global Edge',
    flavor: '×4/3 alle Generatoren',
    costScaled: 10_000n * SCALE,
    maxLevel: 1,
    target: { kind: 'globalProd' },
    factorNum: 4n,
    factorDen: 3n,
  },
];

export const WORKER_UPGRADES: UpgradeDef[] = GENERATORS.filter((g) =>
  ['intern', 'junior', 'senior', 'staff'].includes(g.id),
).map(makeGeneratorUpgrade);

export const ITSM_UPGRADES: UpgradeDef[] = [
  UPGRADE_BOT,
  UPGRADE_NOC,
  UPGRADE_TRIAGING,
  UPGRADE_RUNBOOK,
  UPGRADE_AUTOTICKET,
];

// ── Laufzeit-Konstanten für engine/config.ts ───────────────────────────────
export const UPGRADES: UpgradeDef[] = [
  ...HARDWARE_UPGRADES,
  ...CLOUD_UPGRADES,
  ...AI_UPGRADES,
  ...CLICK_UPGRADES,
  ...GENERATOR_UPGRADES,
  ...WORKER_UPGRADES,
  ...ITSM_UPGRADES,
];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
);

export const GENERATOR_BY_ID: Record<string, GeneratorDef> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g]),
);

// Kategorie-Exporte für die UI.
export const HARDWARE_GENERATORS: GeneratorDef[] = GENERATORS.filter((g) =>
  ['pi', 'ssd', 'cpu', 'rack'].includes(g.id),
);
export const CLOUD_GENERATORS: GeneratorDef[] = GENERATORS.filter((g) =>
  ['vm', 'k8s', 'cdn'].includes(g.id),
);
export const AI_GENERATORS: GeneratorDef[] = GENERATORS.filter((g) =>
  ['ai', 'quantum'].includes(g.id),
);
export const WORKER_GENERATORS: GeneratorDef[] = GENERATORS.filter((g) =>
  ['intern', 'junior', 'senior', 'staff'].includes(g.id),
);

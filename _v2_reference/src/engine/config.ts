import { SCALE, type GeneratorDef, type UpgradeDef, type AchievementDef } from './types';

export const ENGINE_VERSION = 5; // v5: Achievements + clicks-Zähler hinzugefügt
export const TICK_MS = 100; // Sim-Schrittweite
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000; // Offline-Earnings gedeckelt auf 8h

// --- Prestige (IPO-Layer) -------------------------------------------------
// Shares = isqrt(totalEarnedScaled / PRESTIGE_THRESHOLD_SCALED). Erste Share bei
// 1.000.000 Cycles Lifetime-Ertrag; danach quadratisch teurer (isqrt-Kurve).
export const PRESTIGE_THRESHOLD_SCALED = 1_000_000n * SCALE; // = 1e9 (milli-cycles)
// Jede Share = +2% globale Produktion: Faktor (SHARE_MULT_BASE + shares) / SHARE_MULT_BASE.
export const SHARE_MULT_BASE = 50n;

// Generatoren, eskalierend. Kostenwachstum 1.15x (Idle-Standard). Balancing-Pass
// (konkrete Kurven) ist ein offener DESIGN.md-Punkt — diese Werte sind solide,
// nicht final. Mehr Namen/Flavortext später als Ollama-Bulk-Spur.
export const GENERATORS: GeneratorDef[] = [
  {
    id: 'server',
    name: 'Server',
    flavor: 'Ein blecherner 1U-Server. Brummt Cycles vor sich hin.',
    baseCostScaled: 10n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 1n * SCALE, // 1 Cycle/s
  },
  {
    id: 'rack',
    name: 'Server-Rack',
    flavor: '42 HE voll. Die Klimaanlage hasst dich.',
    baseCostScaled: 120n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 8n * SCALE,
  },
  {
    id: 'datacenter',
    name: 'Rechenzentrum',
    flavor: 'Eigene Halle, eigener Dieselgenerator.',
    baseCostScaled: 1_300n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 47n * SCALE,
  },
  {
    id: 'cloud',
    name: 'Cloud-Region',
    flavor: 'Jemand anderes Computer — aber sehr, sehr viele.',
    baseCostScaled: 14_000n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 260n * SCALE,
  },
  {
    id: 'quantum',
    name: 'Quantencluster',
    flavor: 'Rechnet Cycles, die es vielleicht gar nicht gibt.',
    baseCostScaled: 200_000n * SCALE,
    costGrowthNum: 115n,
    costGrowthDen: 100n,
    baseRateScaled: 1_400n * SCALE,
  },
];

export function getGenerator(id: string): GeneratorDef | undefined {
  return GENERATORS.find((g) => g.id === id);
}

// Upgrades (Phase 2a: one-time, maxLevel 1). Faktoren als exakte Rationale.
export const UPGRADES: UpgradeDef[] = [
  {
    id: 'click-mech-kb',
    name: 'Mechanische Tastatur',
    flavor: 'Jeder Klick fühlt sich an wie zwei.',
    costScaled: 100n * SCALE,
    maxLevel: 1,
    target: { kind: 'click' },
    factorNum: 2n,
    factorDen: 1n, // x2 Klick
  },
  {
    id: 'click-macro',
    name: 'Makro-Skript',
    flavor: 'Ein Tastendruck, drei Befehle.',
    costScaled: 2_500n * SCALE,
    maxLevel: 1,
    target: { kind: 'click' },
    factorNum: 3n,
    factorDen: 1n, // x3 Klick
  },
  {
    id: 'server-ssd',
    name: 'SSD statt HDD',
    flavor: 'Server liefern Cycles ohne Seek-Time.',
    costScaled: 500n * SCALE,
    maxLevel: 1,
    target: { kind: 'generator', genId: 'server' },
    factorNum: 2n,
    factorDen: 1n,
  },
  {
    id: 'rack-cooling',
    name: 'Flüssigkühlung',
    flavor: 'Racks takten höher, ohne zu throtteln.',
    costScaled: 6_000n * SCALE,
    maxLevel: 1,
    target: { kind: 'generator', genId: 'rack' },
    factorNum: 2n,
    factorDen: 1n,
  },
  {
    id: 'global-overtime',
    name: 'Überstunden',
    flavor: '+25% auf alles. Der Betriebsrat schweigt.',
    costScaled: 12_000n * SCALE,
    maxLevel: 1,
    target: { kind: 'globalProd' },
    factorNum: 5n,
    factorDen: 4n, // +25%
  },
  {
    id: 'global-cicd',
    name: 'CI/CD-Pipeline',
    flavor: 'Alles läuft 50% flotter durch.',
    costScaled: 150_000n * SCALE,
    maxLevel: 1,
    target: { kind: 'globalProd' },
    factorNum: 3n,
    factorDen: 2n, // +50%
  },
  {
    id: 'global-edge',
    name: 'Edge-Caching',
    flavor: 'Cycles näher am Nutzer. +33% — krummer Faktor mit Absicht.',
    costScaled: 40_000n * SCALE,
    maxLevel: 1,
    target: { kind: 'globalProd' },
    factorNum: 4n,
    factorDen: 3n, // +33.3% (Nenner 3 teilt SCALE nicht -> Floor greift)
  },
];

export function getUpgrade(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

// Achievements (Seed-Katalog, alle 5 Bedingungs-Arten abgedeckt). Permanenter
// Bonus als exakter Rational. Mehr/flavortext-lastige Achievements später = Bulk.
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-server',
    name: 'Hello, World',
    flavor: 'Dein erster Server bootet.',
    condition: { kind: 'genCount', genId: 'server', atLeast: 1 },
    target: { kind: 'click' },
    factorNum: 2n,
    factorDen: 1n, // ×2 Klick
  },
  {
    id: 'small-farm',
    name: 'Kleine Farm',
    flavor: '10 Server brummen im Chor.',
    condition: { kind: 'genCount', genId: 'server', atLeast: 10 },
    target: { kind: 'generator', genId: 'server' },
    factorNum: 5n,
    factorDen: 4n, // +25% Server
  },
  {
    id: 'maintenance-window',
    name: 'Wartungsfenster',
    flavor: '25 Maschinen insgesamt — Zeit für Nachtschicht.',
    condition: { kind: 'totalGenerators', atLeast: 25 },
    target: { kind: 'globalProd' },
    factorNum: 11n,
    factorDen: 10n, // +10% global
  },
  {
    id: 'megacycle',
    name: 'Megacycle',
    flavor: 'Eine Million Cycles über die Lebenszeit.',
    condition: { kind: 'totalEarned', atLeastScaled: 1_000_000n * SCALE },
    target: { kind: 'globalProd' },
    factorNum: 6n,
    factorDen: 5n, // +20% global
  },
  {
    id: 'going-public',
    name: 'An die Börse',
    flavor: 'Erster IPO durch — die erste Share ist gebankt.',
    condition: { kind: 'shares', atLeast: 1n },
    target: { kind: 'globalProd' },
    factorNum: 5n,
    factorDen: 4n, // +25% global
  },
  {
    id: 'rsi',
    name: 'Sehnenscheide',
    flavor: '1000 Klicks. Die Maus dampft.',
    condition: { kind: 'clicks', atLeast: 1000n },
    target: { kind: 'click' },
    factorNum: 3n,
    factorDen: 2n, // +50% Klick
  },
];

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

// Save/Load. bigint wird als String serialisiert (JSON kann kein bigint).
// localStorage ist user-editierbar → deserialize behandelt JEDEN Input als
// feindlich und sanitisiert in einen wohlgeformten State (Anti-Cheat-Premiss).
// Versionsfeld: GENAU EINS (`version`), gestempelt mit ENGINE_VERSION.
import { SCALE, type GameState } from './types';
import { ENGINE_VERSION, UPGRADES, ACHIEVEMENTS } from './config';

const KEY = 'it-clicker-v2:save';

// Nur nicht-negative Ganzzahl-Strings ("123") oder sichere Integer-Numbers
// werden akzeptiert; alles andere (negativ, "1.5", NaN, >MAX_SAFE als Number,
// Müll) fällt auf den Default zurück. Schließt BigInt("1.5")-Crash + negative
// Werte + lossy-Number-Rundung aus.
function toNonNegBigInt(v: unknown, fallback: bigint): bigint {
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  return fallback;
}

// Generatoren auf { id: nicht-negative Ganzzahl } reduzieren. Verwirft String-
// Counts ("7" → sonst "71" bei owned+1), Floats (1.5 → BigInt-Crash), Negative.
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

// Upgrades gegen die ID-Whitelist (UPGRADES) prüfen — UNBEKANNTE Keys werden
// hart verworfen (Sparring deepseek-v4-pro #4: sonst kann ein Fake-Upgrade die
// server-seitige Multiplikator-Rechnung verfälschen). Level: Integer 1..maxLevel.
function sanitizeUpgrades(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  const obj = v as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const def of UPGRADES) {
    const level = obj[def.id];
    if (typeof level === 'number' && Number.isInteger(level) && level > 0) {
      out[def.id] = Math.min(level, def.maxLevel); // auf maxLevel deckeln
    }
  }
  return out;
}

// Achievements gegen die ID-Whitelist (ACHIEVEMENTS); freigeschaltet = 1.
// Unbekannte IDs / nicht-positive Werte verworfen.
function sanitizeAchievements(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  const obj = v as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const def of ACHIEVEMENTS) {
    const level = obj[def.id];
    if (typeof level === 'number' && Number.isInteger(level) && level > 0) {
      out[def.id] = 1; // binär: freigeschaltet
    }
  }
  return out;
}

export function serialize(s: GameState): string {
  return JSON.stringify({
    cyclesScaled: s.cyclesScaled.toString(),
    totalEarnedScaled: s.totalEarnedScaled.toString(),
    clickPowerScaled: s.clickPowerScaled.toString(),
    prodRemainder: s.prodRemainder.toString(),
    generators: s.generators,
    upgrades: s.upgrades,
    achievements: s.achievements,
    clicks: s.clicks.toString(),
    shares: s.shares.toString(),
    lastSavedMs: s.lastSavedMs,
    version: ENGINE_VERSION,
  });
}

export function deserialize(raw: string): GameState | null {
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
    clickPowerScaled: toNonNegBigInt(r.clickPowerScaled, 1n * SCALE),
    // Fehlt in v1-Saves → Default 0n (verlustfreie v1→v2-Migration).
    prodRemainder: toNonNegBigInt(r.prodRemainder, 0n),
    generators: sanitizeGenerators(r.generators),
    // Fehlt in v1/v2-Saves → {} (verlustfreie v2→v3-Migration).
    upgrades: sanitizeUpgrades(r.upgrades),
    // Fehlt in v1-v3-Saves → 0n (verlustfreie v3→v4-Migration).
    shares: toNonNegBigInt(r.shares, 0n),
    // Fehlen in v1-v4-Saves → {} / 0n (verlustfreie v4→v5-Migration).
    achievements: sanitizeAchievements(r.achievements),
    clicks: toNonNegBigInt(r.clicks, 0n),
    lastSavedMs:
      typeof r.lastSavedMs === 'number' && Number.isInteger(r.lastSavedMs)
        ? r.lastSavedMs
        : Date.now(),
    version: Number.isInteger(r.version) ? (r.version as number) : 1,
  };
}

export function save(s: GameState): void {
  try {
    localStorage.setItem(KEY, serialize({ ...s, lastSavedMs: Date.now() }));
  } catch {
    /* localStorage nicht verfügbar — ignorieren */
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

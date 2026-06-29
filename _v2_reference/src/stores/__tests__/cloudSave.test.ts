import { describe, it, expect } from 'vitest';
import { chooseNewer } from '../cloudSave';
import { serialize, deserialize } from '../../engine/save';
import { createInitialState } from '../../engine/engine';
import type { GameState } from '../../engine/types';

// Minimaler GameState-Stub für die reine chooseNewer-Logik (braucht nur die zwei Felder).
function stub(totalEarnedScaled: bigint, lastSavedMs: number): GameState {
  return { totalEarnedScaled, lastSavedMs } as unknown as GameState;
}

describe('chooseNewer — totalEarnedScaled (monoton) primär, lastSavedMs Tiebreak', () => {
  it('Cloud mehr Fortschritt -> cloud', () => {
    expect(chooseNewer(stub(100n, 1000), stub(200n, 1000))).toBe('cloud');
  });

  it('Local mehr Fortschritt -> local', () => {
    expect(chooseNewer(stub(200n, 1000), stub(100n, 1000))).toBe('local');
  });

  it('gleicher Fortschritt, Cloud jünger -> cloud', () => {
    expect(chooseNewer(stub(100n, 1000), stub(100n, 2000))).toBe('cloud');
  });

  it('gleicher Fortschritt, Local jünger -> local', () => {
    expect(chooseNewer(stub(100n, 2000), stub(100n, 1000))).toBe('local');
  });

  it('komplett gleich -> local (kein Flackern)', () => {
    expect(chooseNewer(stub(100n, 1000), stub(100n, 1000))).toBe('local');
  });

  it('KERN: Fortschritt schlägt Wall-Clock — Cloud mehr earned aber ÄLTER -> cloud', () => {
    // Anti-Skew: ein Gerät mit zurückliegender Uhr, aber mehr Lifetime-Fortschritt,
    // darf nicht durch einen jüngeren-aber-ärmeren Save überschrieben werden.
    expect(chooseNewer(stub(100n, 9999), stub(500n, 1))).toBe('cloud');
  });

  it('bigint-Vergleich korrekt (große Zahlen, kein number-Cast)', () => {
    expect(chooseNewer(stub(9_000_000_000_000_000_000n, 1), stub(9_000_000_000_000_000_001n, 1))).toBe('cloud');
  });
});

describe('Cloud-Round-Trip: serialize -> jsonb -> deserialize ist verlustfrei', () => {
  it('bigint-Felder überleben den jsonb-Umweg (JSON.parse/stringify)', () => {
    const s: GameState = {
      ...createInitialState(0),
      cyclesScaled: 123_456_789n,
      totalEarnedScaled: 9_000_000_000_000_000_123n,
      shares: 7n,
      deployCounter: 42n,
      clicks: 999n,
      lastSavedMs: 1_700_000_000_000,
    };
    // Genau der Pfad, den pushCloud (JSON.parse(serialize)) + pullCloud
    // (JSON.stringify(payload) -> deserialize) nehmen.
    const asJsonb = JSON.parse(serialize(s));
    const back = deserialize(JSON.stringify(asJsonb));
    expect(back).not.toBeNull();
    expect(back!.cyclesScaled).toBe(123_456_789n);
    expect(back!.totalEarnedScaled).toBe(9_000_000_000_000_000_123n);
    expect(back!.shares).toBe(7n);
    expect(back!.deployCounter).toBe(42n);
    expect(back!.clicks).toBe(999n);
  });
});

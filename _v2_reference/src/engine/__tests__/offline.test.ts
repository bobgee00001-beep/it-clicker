import { describe, it, expect } from 'vitest';
import { applyOfflineEarnings } from '../offline';
import { createInitialState } from '../engine';
import { SCALE, type GameState } from '../types';
import { OFFLINE_CAP_MS, OFFLINE_MIN_MS, OFFLINE_PENALTY } from '../config';

function stateWithRate(cpsPerSecond: number, savedAtMs: number): GameState {
  // rack.baseRateScaled = 8n * SCALE (8 cps per unit).
  // ssd.baseRateScaled = SCALE/2n (0.5 cps per unit).
  // To hit 10 cps exactly: 1 rack (= 8) + 4 ssd (= 2) = 10.
  // (Previous version used `rack: 1` alone, assuming 10 cps per unit — wrong.)
  const s = {
    ...createInitialState(savedAtMs),
    lastSavedMs: savedAtMs,
    generators: { rack: 1, ssd: cpsPerSecond === 10 ? 4 : 0 },
  } as GameState;
  return s;
}

describe('offline earnings', () => {
  it('1h offline with 10 cycles/s → gained = 10 * 3600 * SCALE * OFFLINE_PENALTY', () => {
    const s = stateWithRate(10, 0);
    const now = 60 * 60 * 1000; // 1h
    const { gainedScaled, elapsedMs, capped, state: next } = applyOfflineEarnings(s, now);

    expect(elapsedMs).toBe(60 * 60 * 1000);
    expect(capped).toBe(false);
    expect(gainedScaled).toBe(BigInt(10 * 3600) * SCALE * BigInt(Math.round(OFFLINE_PENALTY * 10000)) / 10000n);
    expect(next.lastSavedMs).toBe(now);
    expect(next.cyclesScaled).toBe(s.cyclesScaled + gainedScaled);
    expect(next.totalEarnedScaled).toBe(s.totalEarnedScaled + gainedScaled);
  });

  it('25h offline → elapsedMs capped at OFFLINE_CAP_MS', () => {
    const s = stateWithRate(10, 0);
    const now = 25 * 60 * 60 * 1000; // 25h
    const { gainedScaled, elapsedMs, capped, state: next } = applyOfflineEarnings(s, now);

    expect(elapsedMs).toBe(OFFLINE_CAP_MS);
    expect(capped).toBe(true);
    expect(gainedScaled).toBe(
      BigInt(10 * (OFFLINE_CAP_MS / 1000)) * SCALE * BigInt(Math.round(OFFLINE_PENALTY * 10000)) / 10000n,
    );
    expect(next.lastSavedMs).toBe(now);
  });

  it('<5s elapsed → gainedScaled = 0n and no state change', () => {
    const s = stateWithRate(10, 0);
    const now = OFFLINE_MIN_MS - 1000;
    const { gainedScaled, elapsedMs, capped, state: next } = applyOfflineEarnings(s, now);

    expect(gainedScaled).toBe(0n);
    expect(elapsedMs).toBe(now);
    expect(capped).toBe(false);
    expect(next.cyclesScaled).toBe(s.cyclesScaled);
    expect(next.totalEarnedScaled).toBe(s.totalEarnedScaled);
    expect(next.prodRemainder).toBe(s.prodRemainder);
  });

  it('0.5 penalty exact: 7200s offline, 1 cycle/s → 3600 cycles', () => {
    // Need 1 cycle/s total. Use pi generators: 0.1 cycles/s each, so 10 units.
    const s = {
      ...createInitialState(0),
      lastSavedMs: 0,
      generators: { pi: 10 },
    } as GameState;
    const now = 7200 * 1000;
    const { gainedScaled } = applyOfflineEarnings(s, now);
    expect(gainedScaled).toBe(3600n * SCALE);
  });

  it('no generators → gainedScaled = 0n', () => {
    const s = createInitialState(0);
    const now = 60 * 60 * 1000;
    const { gainedScaled, elapsedMs, capped } = applyOfflineEarnings(s, now);
    expect(gainedScaled).toBe(0n);
    expect(elapsedMs).toBe(60 * 60 * 1000);
    expect(capped).toBe(false);
  });
});

describe('offline earnings — deployCounter discipline (v6 RNG)', () => {
  it('applyOffline lässt deployCounter UNVERÄNDERT (strikt ONLINE)', () => {
    // Georg's #1 + #3 Feinheit: deployCounter wird NUR in startDeploy inkrementiert
    // (auf erfolgreichem Start). applyOffline ruft updateReleaseTrain NICHT auf
    // (Whitelist: produce() ohne release-path). Wenn offline den Counter hochzählen
    // würde, würde der Server-Validator in Phase 3 andere Roll-Werte berechnen
    // als der Client (Online ≠ Offline → Audit-Fail).
    const s = {
      ...createInitialState(0),
      deployCounter: 42n,
      deploysStarted: 42,
      rngSeed: 0xDEADBEEFCAFEBABEn,
      lastSavedMs: 0,
      generators: { rack: 1, ssd: 4 }, // 10 cps
    } as GameState;
    const now = 60 * 60 * 1000; // 1h offline
    const { state: next } = applyOfflineEarnings(s, now);

    expect(next.deployCounter).toBe(42n); // unverändert!
    expect(next.deploysStarted).toBe(42); // legacy counter auch nicht
    expect(next.rngSeed).toBe(0xDEADBEEFCAFEBABEn); // rngSeed sowieso nie mutiert
  });

  it('applyOffline auf counter=0: bleibt 0n (Regression-Schutz für frische Saves)', () => {
    // Frischer Save aus v6-Migration (injectV5ToV6 setzt deployCounter=0n).
    // Auch nach langer Offline-Zeit muss der Counter 0n bleiben, sonst zählt
    // der erste Online-Deploy fälschlich als #1+offset.
    const s = {
      ...createInitialState(0),
      generators: { rack: 1, ssd: 4 },
    } as GameState;
    expect(s.deployCounter).toBe(0n);
    const { state: next } = applyOfflineEarnings(s, 25 * 60 * 60 * 1000);
    expect(next.deployCounter).toBe(0n);
  });
});

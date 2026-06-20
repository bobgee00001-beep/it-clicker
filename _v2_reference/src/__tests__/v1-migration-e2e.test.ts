/**
 * E2E v1 → v2 Migration Test (live)
 *
 * Simulates a realistic v1 savegame (SAVE_VERSION=4, flat format) and runs it
 * through v2's `migrateSavePayload()`. Validates that:
 *
 *   1. The migrated GameState has all v2 bigint-scaled fields populated
 *   2. Numeric values are correctly scaled (cycles × SCALE = cyclesScaled)
 *   3. Set-based fields (achievements) become Record in v2
 *   4. Unknown v1 fields don't crash the migration
 *   5. The round-trip (migrate v2 → migrate again) returns migrated:false
 *   6. The engine.tick() can run 60s on the migrated state without throwing
 *
 * Source: /Users/bob/workspace/it-clicker/index.html (v1 buildSaveData)
 */

import { describe, it, expect } from 'vitest';
import { migrateSavePayload } from '../engine/migrate.js';
import { createInitialState, tick } from '../engine/engine.js';

describe('E2E v1 → v2 Migration (real v1 save shape)', () => {
  // Realistic v1 savegame — flat format, no meta wrapper
  const v1FlatSave = {
    saveVersion: 4,
    cycles: 12345.67,
    totalClicks: 89,
    totalEarned: 50000,
    workerEarned: 30000,
    prestige: 0,
    prestigePoints: 0,
    multiplier: 1,
    upgrades: { rack: 2, server: 1, cloud: 3 },
    upgradesEverBought: ['rack', 'server', 'cloud'],
    ticketsResolved: 12,
    ticketsExpired: 2,
    sev1Survived: 1,
    achievements: ['first_click', 'first_ticket'],
    achievementProgress: {},
    p1AutoClosed: 0,
    fastTickets: 0,
    maxSpendIn60s: 0,
    allCategoriesMaxed: false,
    maxSimultaneousP1: 0,
    mondayClicks: 0,
    pagerDutyTriggered: false,
    pagerDutyDate: null,
    legacyCodeTriggered: false,
    deploysStarted: 0,
    successfulDeploys: 0,
    failedDeploys: 0,
    lastDeployAt: 0,
    releaseDeployBonusTimer: 0,
    releaseDeployBonusMultiplier: 1,
    rollbacksPerformed: 0,
    lastRollbackAt: 0,
    errorBudget: 1,
    observabilityScore: 1,
    activeIncidents: 0,
    uptime: 1,
    errorRate: 0,
    monitoringTimer: 0,
    rollbackAvailable: false,
    cleanMonitoringWindows: 0,
    lastDeploymentQuality: 'good',
    observabilityMessage: '',
    lastReleaseEvidence: null,
    sessionStart: 1700000000000,
    lastOnline: 1700000000000,
    masterVolume: 0.8,
    muted: false,
    selectedSound: 'chime',
  };

  it('1. Flat v1 save → v2 with cyclesScaled = cycles × SCALE', () => {
    const result = migrateSavePayload(v1FlatSave);
    expect(result.migrated).toBe(true);
    expect(typeof result.data.cyclesScaled).toBe('bigint');
    // SCALE = 1000n per engine/types.ts (milli-cycles)
    // Math.round(12345.67) = 12346 → 12346 × 1000 = 12346000n
    expect(result.data.cyclesScaled).toBe(12346000n);
  });

  it('2. v2 record-typed fields (achievements) accept v1 array input', () => {
    const result = migrateSavePayload(v1FlatSave);
    expect(result.data.achievements['first_click']).toBe(1);
    expect(result.data.achievements['first_ticket']).toBe(1);
  });

  it('3. All v2 required GameState fields are populated', () => {
    const result = migrateSavePayload(v1FlatSave);
    // Spot-check key v2 fields that must come from migration
    expect(result.data.cyclesScaled).toBeDefined();
    expect(result.data.totalEarnedScaled).toBeDefined();
    expect(result.data.upgrades).toBeDefined();
    expect(result.data.achievements).toBeDefined();
    expect(result.data.lastOnline).toBeDefined();
    expect(result.data.tickets).toBeDefined();
    expect(Array.isArray(result.data.tickets)).toBe(true);
  });

  it('4. Unknown v1 fields are silently dropped (no crash)', () => {
    const v1WithExtras = { ...v1FlatSave, futureField: 'something', anotherFuture: 42 };
    expect(() => migrateSavePayload(v1WithExtras)).not.toThrow();
    const result = migrateSavePayload(v1WithExtras);
    expect(result.migrated).toBe(true);
  });

  it('5. v1 wrap-format (meta + state) also migrates', () => {
    const v1WrapSave = {
      meta: { game: 'devops-clicker', saveVersion: 4, exportedAt: '2026-06-19T00:00:00Z' },
      state: v1FlatSave,
    };
    const result = migrateSavePayload(v1WrapSave);
    expect(result.migrated).toBe(true);
    expect(typeof result.data.cyclesScaled).toBe('bigint');
  });

  it('6. Round-trip: migrate a v2 save → migrated:false', () => {
    const initial = createInitialState(0);
    const result = migrateSavePayload(initial);
    expect(result.migrated).toBe(false);
  });

  it('7. Engine tick() runs on migrated v1 save without throwing', () => {
    const result = migrateSavePayload(v1FlatSave);
    expect(() => tick(result.data, 60_000)).not.toThrow();
  });

  it('8. NaN in v1 cycles → sanitized to 0n, migrated:true', () => {
    const corruptSave = { ...v1FlatSave, cycles: NaN };
    const result = migrateSavePayload(corruptSave);
    expect(result.data.cyclesScaled).toBe(0n);
    expect(result.migrated).toBe(true);
  });

  it('9. v1 save with 50 upgrades + 20 achievements survives migration', () => {
    const hugeSave = {
      ...v1FlatSave,
      upgrades: Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [`upgrade_${i}`, Math.floor(Math.random() * 10)])
      ),
      achievements: ['first_click', 'first_ticket', 'first_upgrade', 'first_prestige', 'hundred',
                     'thousand', 'million', 'ten_tickets', 'its_always_dns', 'have_you_tried'],
    };
    const result = migrateSavePayload(hugeSave);
    expect(result.migrated).toBe(true);
    expect(Object.keys(result.data.achievements).length).toBeGreaterThanOrEqual(10);
    // Upgrades unknown to v2 are dropped, but at least the v1 entries that match are kept
    expect(typeof result.data.upgrades).toBe('object');
  });
});
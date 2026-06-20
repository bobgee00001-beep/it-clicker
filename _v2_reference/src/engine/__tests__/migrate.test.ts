import { describe, it, expect } from 'vitest';
import { migrateSavePayload, type MigrationResult } from '../migrate';
import { ENGINE_VERSION } from '../config';
import { SCALE } from '../types';

const assertMigrated = (r: MigrationResult) => {
  expect(r.migrated).toBe(true);
  expect(r.fromVersion).toBeLessThan(ENGINE_VERSION);
  expect(r.data.version).toBe(ENGINE_VERSION);
};

describe('migrateSavePayload', () => {
  it('konvertiert ein minimales v1-Flat-Save in einen v5-GameState', () => {
    const r = migrateSavePayload({
      version: 1,
      cycles: 1000,
      totalEarned: 5000,
      generators: { server: 2 },
      upgrades: { kb: 1 },
      clicks: 42,
      totalClicks: 999,
    });

    assertMigrated(r);
    expect(r.data.cyclesScaled).toBe(1000n * SCALE);
    expect(r.data.totalEarnedScaled).toBe(5000n * SCALE);
    expect(r.data.generators).toEqual({ server: 2 });
    expect(r.data.upgrades).toEqual({ kb: 1 });
    expect(r.data.clicks).toBe(42n);
    expect(r.data.upgradesEverBought).toBe(true);
  });

  it('konvertiert ein Meta-Wrap-Save (state nested) in einen v5-GameState', () => {
    const r = migrateSavePayload({
      meta: { version: 2, saveVersion: 2 },
      state: {
        cycles: 2000,
        achievements: { 'first_click': 1 },
        tickets: [
          { id: 't1', type: 'p3', title: 'Ping timeout', sla: 30, maxSla: 45, reward: 50, spawnTime: 0 },
        ],
      },
    });

    assertMigrated(r);
    expect(r.data.cyclesScaled).toBe(2000n * SCALE);
    expect(r.data.achievements).toEqual({ 'first_click': 1 });
    expect(r.data.tickets.length).toBeGreaterThan(0);
    expect(r.data.tickets[0].type).toBe('p3');
    expect(r.data.tickets[0].rewardScaled).toBe(50n);
    expect(r.data.ticketsResolved).toBe(0);
  });

  it('härtet kaputte/skalare Werte auf sichere Defaults', () => {
    const r = migrateSavePayload({
      version: 1,
      cycles: 'not-a-number',
      totalEarned: -5,
      clickPower: '1.5',
      multiplier: Infinity,
      sessionClicks: 'many',
      tickets: 'not-an-array',
    });

    assertMigrated(r);
    expect(r.data.cyclesScaled).toBe(0n);
    expect(r.data.totalEarnedScaled).toBe(0n);
    expect(r.data.clickPowerScaled).toBe(1n * SCALE);
    expect(r.data.multiplier).toBe(1);
    expect(r.data.sessionClicks).toBe(0);
    expect(r.data.tickets).toEqual([]);
  });

  it('führt die vollständige Default-Chain von v1 -> v5 durch', () => {
    const r = migrateSavePayload({
      version: 1,
      cycles: 1,
    });

    assertMigrated(r);
    // V1->V2
    expect(r.data.achievements).toEqual({});
    expect(r.data.upgradesEverBought).toBe(false);
    // V2->V3
    expect(r.data.sev1Survived).toBe(false);
    expect(r.data.ticketsExpired).toBe(0);
    // V3->V4
    expect(r.data.pagerDutyTriggered).toBe(false);
    expect(r.data.maxSimultaneousP1).toBe(0);
    // V4->V5
    expect(r.data.releaseStatus).toBe('idle');
    expect(r.data.observabilityScore).toBe(82);
    expect(r.data.masterVolume).toBe(1.0);
    expect(r.data.eventLog.entries).toHaveLength(0);
  });

  it('berührt ein v5-Save NICHT und reported migrated=false', () => {
    const r = migrateSavePayload({
      version: ENGINE_VERSION,
      cyclesScaled: '777',
      totalEarnedScaled: '888',
      achievements: { 'first_click': 1 },
    });

    expect(r.migrated).toBe(false);
    expect(r.fromVersion).toBe(ENGINE_VERSION);
    expect(r.data.version).toBe(ENGINE_VERSION);
    expect(r.data.cyclesScaled).toBe(777n);
    expect(r.data.totalEarnedScaled).toBe(888n);
    expect(r.data.achievements).toEqual({ 'first_click': 1 });
  });

  it('berichtet unbekannte Feldeinträge über onIssue-Callback', () => {
    const issues: string[] = [];
    migrateSavePayload(
      {
        version: 1,
        cyclesScaled: 'bad',
        totalEarnedScaled: -5,
        clickPowerScaled: '1.5',
        multiplier: NaN,
      },
      {
        onIssue: (issue) => issues.push(issue.message),
      },
    );

    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.some((m) => m.includes('invalid scaled value'))).toBe(true);
    expect(issues.some((m) => m.includes('invalid scaled value'))).toBe(true);
  });

  it('verwirft unbekannte Upgrade- und Achievement-IDs', () => {
    const r = migrateSavePayload({
      version: 1,
      upgrades: { kb: 1, 'totally-fake': 99, 'hack-x1000': 1 },
      achievements: { 'first_click': 1, 'fake-achievement': 1 },
    });

    assertMigrated(r);
    expect(r.data.upgrades).toEqual({ kb: 1 });
    expect(r.data.achievements).toEqual({ 'first_click': 1 });
  });

  it('liefert Defaults für ein nicht-objekt Payload', () => {
    const r = migrateSavePayload(null);

    expect(r.migrated).toBe(true);
    expect(r.fromVersion).toBe(1);
    expect(r.data.version).toBe(ENGINE_VERSION);
    expect(r.data.cyclesScaled).toBe(0n);
    expect(r.data.eventLog.entries.length).toBe(0);
  });
});

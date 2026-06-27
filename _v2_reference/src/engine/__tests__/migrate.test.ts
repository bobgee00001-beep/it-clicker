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

  it('Bug: Sanitizer-Issues aus dem Return-Objekt landen im externen Hook UND internen eventLog', () => {
    // Vorher: Sanitizer-Issues (ausser scaled) wurden waehrend des Return-
    // Objekt-Aufbaus in `issues` gepusht, aber die report()-Schleife lief
    // EINMAL frueh — diese Issues wurden stumm verschluckt. Der externe Hook
    // sah nur die scaled-Issues, der interne eventLog ebenso.
    // Fix: zweite report()-Schleife am Ende von buildGameState fuer alle
    // NEU hinzugekommenen issues.
    const externalIssues: string[] = [];
    const r = migrateSavePayload(
      {
        version: 1,
        // Sanitizer-Issues, die NIE im externen Hook auftauchten:
        sessionClicks: 'many',         // sanitizeNonNegInt -> 'invalid integer'
        prestige: 'huge',              // sanitizeNonNegInt -> 'invalid integer'
        tickets: 'not-an-array',       // sanitizeTickets -> 'invalid tickets array'
        upgrades: { 'unknown-id': 1 }, // sanitizeUpgrades -> 'dropped unknown upgrade keys'
        achievements: { 'fake-achv': 1 }, // sanitizeAchievements -> 'dropped unknown keys'
        masterVolume: NaN,             // sanitizeNonNegFloat -> 'invalid float'
        multiplier: 'NaN-ish',         // sanitizeNonNegFloat -> 'invalid float'
        releaseStatus: 'partying',     // sanitizeReleaseStatus -> 'invalid release status'
      },
      { onIssue: (issue) => externalIssues.push(issue.message) },
    );

    // 1. Externer Hook sieht ALLE Issues, nicht nur die scaled.
    expect(externalIssues.some((m) => m.includes('invalid integer'))).toBe(true);
    expect(externalIssues.some((m) => m.includes('invalid tickets array'))).toBe(true);
    expect(externalIssues.some((m) => m.includes('dropped unknown upgrade'))).toBe(true);
    expect(externalIssues.some((m) => m.includes('dropped unknown keys'))).toBe(true);
    expect(externalIssues.some((m) => m.includes('invalid float'))).toBe(true);
    expect(externalIssues.some((m) => m.includes('invalid release status'))).toBe(true);
    expect(externalIssues.length).toBeGreaterThanOrEqual(7);

    // 2. Interner eventLog sieht die GLEICHEN Issue-Messages (Migration: prefix).
    const internalMessages = r.data.eventLog.entries.map((e) => e.message);
    expect(internalMessages.some((m) => m.includes('Migration:') && m.includes('invalid integer'))).toBe(true);
    expect(internalMessages.some((m) => m.includes('Migration:') && m.includes('invalid tickets array'))).toBe(true);
    expect(internalMessages.some((m) => m.includes('Migration:') && m.includes('dropped unknown'))).toBe(true);
    expect(internalMessages.some((m) => m.includes('Migration:') && m.includes('invalid float'))).toBe(true);
    expect(internalMessages.some((m) => m.includes('Migration:') && m.includes('invalid release status'))).toBe(true);

    // 3. Keine Doppelreports: jeder Issue exakt einmal in beiden.
    const externalFieldKeys = externalIssues.length;
    const internalMigrationEntries = internalMessages.filter((m) => m.startsWith('Migration:')).length;
    // externalIssues.length == internalMigrationEntries, weil jede externe
    // Meldung via report() genau einen Eintrag im internen eventLog erzeugt
    // (fuer gleiches `issues`-Array). Externe Hooks haben KEINE "Migration:"-Prefix.
    expect(internalMigrationEntries).toBe(externalFieldKeys);
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

  it('liefert Defaults für ein nicht-objekt Payload und meldet 1 Issue im eventLog', () => {
    // Vorher (main): 0 entries — Bug, weil 'payload is not an object' stumm
    // durch den Logger-Snapshot-Bug verschluckt wurde. Fix in
    // fix/migrate-issue-reporting: alle Sanitizer-Issues werden jetzt am Ende
    // von buildGameState durchgereicht, incl. der initial-issue aus
    // extractSourceState.
    const r = migrateSavePayload(null);

    expect(r.migrated).toBe(true);
    expect(r.fromVersion).toBe(1);
    expect(r.data.version).toBe(ENGINE_VERSION);
    expect(r.data.cyclesScaled).toBe(0n);
    expect(r.data.eventLog.entries.length).toBeGreaterThanOrEqual(1);
    expect(r.data.eventLog.entries[0].message).toContain('payload is not an object');
  });

  describe('Sentinel-Erkennung (releaseStageIndex = -1 ist legitim)', () => {
    // Georg's Hinweis (2026-06-26): legitime Sentinel-Werte gehoeren VOR
    // dem NonNeg-Check im Sanitizer erkannt, nicht durch einen Nach-pruef-
    // Hack im Caller wieder hergestellt. Sonst: fragiler Code, der trotzdem
    // ein Warning produziert (Sanitizer lehnt -1 ab, Caller restauriert).
    //
    // releaseStageIndex = -1  bedeutet "noch kein Release-Train gestartet"
    // (siehe types.ts + release.ts canStartDeploy). Der Wert ist ein
    // explizit gesetzter Initialwert und KEIN Korruptions-Symptom.

    it('releaseStageIndex = -1 bleibt erhalten OHNE Issue-Meldung', () => {
      const r = migrateSavePayload({ version: 6, releaseStageIndex: -1 });
      expect(r.data.releaseStageIndex).toBe(-1);
      // Kein 'invalid integer' Issue fuer den legitimen Sentinel.
      const integerIssues = r.data.eventLog.entries.filter((e) =>
        e.message.includes('releaseStageIndex'),
      );
      expect(integerIssues).toHaveLength(0);
    });

    it('releaseStageIndex = 5 (normaler Wert): durchgelassen ohne Issue', () => {
      const r = migrateSavePayload({ version: 6, releaseStageIndex: 5 });
      expect(r.data.releaseStageIndex).toBe(5);
      expect(r.data.eventLog.entries.filter((e) => e.message.includes('releaseStageIndex')))
        .toHaveLength(0);
    });

    it('releaseStageIndex = "huge" (invalid string): Fallback 0 + Issue', () => {
      const r = migrateSavePayload({ version: 6, releaseStageIndex: 'huge' });
      expect(r.data.releaseStageIndex).toBe(0);
      const integerIssues = r.data.eventLog.entries.filter((e) =>
        e.message.includes('releaseStageIndex') && e.message.includes('invalid integer'),
      );
      expect(integerIssues.length).toBeGreaterThanOrEqual(1);
    });

    it('releaseStageIndex fehlt: Fallback 0 + KEIN Issue', () => {
      // Fehlendes Feld ist kein Korruptions-Symptom (kein undefined-Wert
      // in der Migration-Pipeline), also kein Issue.
      const r = migrateSavePayload({ version: 6 });
      expect(r.data.releaseStageIndex).toBe(0);
      const integerIssues = r.data.eventLog.entries.filter((e) =>
        e.message.includes('releaseStageIndex'),
      );
      expect(integerIssues).toHaveLength(0);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { createInitialState, tick } from '../engine';
import {
  canStartDeploy,
  startDeploy,
  updateReleaseTrain,
  finishDeploy,
  calculateRisk,
  canRollback,
  performRollback,
} from '../release';
import { calculateUptime, calculateErrorRate, deploymentQuality, updateObservability } from '../observability';
import { MAX_DEPLOY_RISK } from '../config';
import { SCALE } from '../types';
import { splitmix64Modulo, SPLITMIX_GAMMA } from '../prng';

// RISK_BP_SCALE-Konstante aus release.ts (mod 10000).
// Hier lokal definiert weil nicht exportiert; sollte mit release.ts übereinstimmen.
const RISK_BP_SCALE = 10000n;

function setTickets(s: ReturnType<typeof createInitialState>, count: number) {
  const tickets = Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    type: 'p3' as const,
    title: `Ticket ${i}`,
    sla: 45,
    maxSla: 45,
    rewardScaled: 50n * SCALE,
    autoCloseTimer: 0,
    spawnTime: 0,
  }));
  return { ...s, tickets };
}

describe('Stage 5: Release Train + Observability', () => {
  it('canStartDeploy(initial) === true', () => {
    const s = createInitialState(0);
    expect(canStartDeploy(s)).toBe(true);
  });

  it('startDeploy(initial).releaseStatus === "building"', () => {
    const s = createInitialState(0);
    const after = startDeploy(s);
    expect(after.releaseStatus).toBe('building');
    expect(after.deploysStarted).toBe(1);
  });

  it('Mit 11 offenen Tickets: canStartDeploy === false', () => {
    const s = setTickets(createInitialState(0), 11);
    expect(canStartDeploy(s)).toBe(false);
  });

  it('finishDeploy mit success: CPS × 1.5 (releaseDeployBonusMultiplier === 1.5)', () => {
    const s = createInitialState(0);
    const started = startDeploy(s);
    // successChance-Override garantiert Erfolg (1 > riskBp).
    const finished = finishDeploy(started, () => 1);
    expect(finished.releaseStatus).toBe('success');
    expect(finished.releaseDeployBonusMultiplier).toBe(1.5);
    expect(finished.successfulDeploys).toBe(1);
  });

  it('updateReleaseTrain läuft alle Stages durch bis success', () => {
    const s = createInitialState(0);
    const started = startDeploy(s);
    // Total 40s: build 10 + test 15 + security 10 + deploy 5
    let after = started;
    const chunks = [10_000, 15_000, 10_000, 5_000];
    for (const chunk of chunks) {
      after = updateReleaseTrain(after, chunk);
    }
    // (chunks above) — successChance-Override garantiert Erfolg.
    expect(after.releaseStatus).toBe('success');
    expect(after.successfulDeploys).toBe(1);
  });

  it('calculateRisk edge cases: empty, 5 tickets, SEV1', () => {
    const base = createInitialState(0);
    const risk0 = calculateRisk(base);
    expect(risk0).toBeGreaterThanOrEqual(0);
    expect(risk0).toBeLessThan(MAX_DEPLOY_RISK);

    const withTickets = setTickets(base, 5);
    const risk5 = calculateRisk(withTickets);
    expect(risk5).toBeGreaterThan(risk0);
    expect(risk5).toBeLessThan(MAX_DEPLOY_RISK);

    const withSev1: typeof base = {
      ...base,
      sev1Active: true,
      tickets: [{
        id: 'sev1',
        type: 'p1',
        title: 'SEV1 Incident',
        sla: 20,
        maxSla: 20,
        rewardScaled: 500n * SCALE,
        autoCloseTimer: 0,
        spawnTime: 0,
      }],
    };
    expect(calculateRisk(withSev1)).toBeGreaterThan(MAX_DEPLOY_RISK);
    expect(canStartDeploy(withSev1)).toBe(false);
  });

  it('calculateRisk is monotonic: more tickets increases risk', () => {
    const base = createInitialState(0);
    const risk0 = calculateRisk(base);
    const withTickets = setTickets(base, 5);
    expect(calculateRisk(withTickets)).toBeGreaterThan(risk0);
  });

  it('finishDeploy mit forced failure erzeugt incident + P1 + rollbackAvailable', () => {
    const s = createInitialState(0);
    const started = startDeploy(s);
    const failed = finishDeploy(started, () => 0); // 0 < risk → failed
    expect(failed.releaseStatus).toBe('failed');
    expect(failed.failedDeploys).toBe(1);
    expect(failed.rollbackAvailable).toBe(true);
    expect(failed.activeIncidents).toBe(1);
    expect(failed.tickets.some((t) => t.title.toLowerCase().includes('deployment'))).toBe(true);
  });

  it('performRollback revertiert incident + zieht Cycles-Strafe ab', () => {
    let s = createInitialState(0);
    s = { ...s, cyclesScaled: 1000n * SCALE };
    s = startDeploy(s);
    s = finishDeploy(s, () => 0); // failed
    const preCycles = s.cyclesScaled;
    const rolled = performRollback(s);
    expect(rolled.rollbacksPerformed).toBe(1);
    expect(rolled.activeIncidents).toBe(0);
    expect(rolled.rollbackAvailable).toBe(false);
    expect(rolled.cyclesScaled).toBeLessThan(preCycles);
    expect(rolled.lastDeploymentQuality).toBe('rolled back');
  });

  it('updateObservability decayed Score bei Ticket-Druck', () => {
    const s = setTickets(createInitialState(0), 10);
    const after = updateObservability(s, 1000);
    expect(after.observabilityScore).toBeLessThan(s.observabilityScore);
  });

  it('deploymentQuality liefert good|degraded|bad', () => {
    const s = createInitialState(0);
    expect(['clean', 'degraded', 'bad']).toContain(deploymentQuality(s));
  });

  it('calculateUptime / calculateErrorRate clampen auf gültige Bereiche', () => {
    const s = createInitialState(0);
    expect(calculateUptime(s)).toBeGreaterThanOrEqual(95);
    expect(calculateUptime(s)).toBeLessThanOrEqual(99.99);
    expect(calculateErrorRate(s)).toBeGreaterThanOrEqual(0.01);
    expect(calculateErrorRate(s)).toBeLessThanOrEqual(9.99);
  });

  it('tick ruft Release + Observability auf (Bonus-Timer läuft)', () => {
    const s = createInitialState(0);
    const started = startDeploy(s);
    const finished = updateReleaseTrain(started, 41_000);
    expect(finished.releaseDeployBonusTimer).toBe(120);
    const afterTick = tick(finished, 1000);
    expect(afterTick.releaseDeployBonusTimer).toBe(119);
  });

  it('Deploy-Finish triggert release_manager Achievement', () => {
    const s = createInitialState(0);
    const started = startDeploy(s);
    const finished = updateReleaseTrain(started, 41_000);
    expect(finished.achievements.release_manager).toBe(1);
  });

  it('tick(1000) nach finishDeploy(success) setzt releaseDeployBonusMultiplier = 1.5', () => {
    let s = createInitialState(0);
    s = startDeploy(s);
    s = finishDeploy(s); // deterministischer Erfolg
    expect(s.releaseStatus).toBe('success');
    s = tick(s, 1000);
    expect(s.releaseDeployBonusMultiplier).toBe(1.5);
    expect(s.releaseDeployBonusTimer).toBeLessThan(120);
  });

  it('tick(1000) triggert release_manager Achievement', () => {
    let s = createInitialState(0);
    s = startDeploy(s);
    s = finishDeploy(s); // Erfolg → successfulDeploys = 1
    s = tick(s, 1000);
    expect(s.achievements.release_manager).toBe(1);
  });

  it('tick(125000) setzt Bonus-Multiplier zurück auf 1.0', () => {
    let s = createInitialState(0);
    s = startDeploy(s);
    s = finishDeploy(s);
    expect(s.releaseDeployBonusMultiplier).toBe(1.5);
    expect(s.releaseDeployBonusTimer).toBe(120);
    s = tick(s, 125_000);
    expect(s.releaseDeployBonusMultiplier).toBe(1);
    expect(s.releaseDeployBonusTimer).toBe(0);
  });

  it('Final E2E: vollständiger Deploy-Lifecycle inklusive Bonus + Achievement', () => {
    let s = createInitialState(0);
    expect(canStartDeploy(s)).toBe(true);
    s = startDeploy(s);
    expect(s.releaseStatus).toBe('building');
    s = updateReleaseTrain(s, 40_000);
    expect(s.releaseStatus).toBe('success');
    s = tick(s, 1000);
    expect(s.releaseDeployBonusMultiplier).toBe(1.5);
    expect(s.achievements.release_manager).toBe(1);
  });

  // [C] lastDeployAt-Timestamp: nowMs muss vom Caller bis finishDeploy durchgereicht
  // werden, sonst landen UI-Evidence-Texte mit Timestamp 0 oder dem Vorgaenger-Wert.
  describe('lastDeployAt-Timestamp (nowMs durchgereicht)', () => {
    it('startDeploy(s, 12345) setzt lastDeployAt = 12345', () => {
      const s = createInitialState(0);
      const after = startDeploy(s, 12_345);
      expect(after.lastDeployAt).toBe(12_345);
    });

    it('startDeploy(s, 0) ohne expliziten Time erhaelt bestehenden lastDeployAt (oder null)', () => {
      // Frischer State: lastDeployAt = null, nach startDeploy(s, 0) immer noch null.
      const fresh = createInitialState(0);
      const started = startDeploy(fresh, 0);
      expect(started.lastDeployAt).toBeNull();

      // Existierender lastDeployAt bleibt erhalten, wenn startDeploy ohne Time aufgerufen wird.
      const withTime = { ...createInitialState(0), lastDeployAt: 9999 };
      const startedAgain = startDeploy(withTime, 0);
      expect(startedAgain.lastDeployAt).toBe(9999);
    });

    it('finishDeploy mit nowMs setzt lastDeployAt im Erfolgs- und Fehlerpfad', () => {
      const s = createInitialState(0);
      const started = startDeploy(s, 0);
      // Erfolg: expliziter nowMs ueberschreibt alles.
      const success = finishDeploy(started, undefined, 50_000);
      expect(success.lastDeployAt).toBe(50_000);
      expect(success.lastReleaseEvidence).toContain('50000');

      // Fehler: expliziter nowMs ueberschreibt.
      const failed = finishDeploy(started, () => 0, 51_000);
      expect(failed.lastDeployAt).toBe(51_000);
      expect(failed.lastReleaseEvidence).toContain('51000');
    });

    it('updateReleaseTrain mit nowMs propagiert Timestamp bei Stage-Ende', () => {
      // 40s dt laesst den Deploy komplett durchlaufen -> finishDeploy wird
      // aufgerufen, muss den withgereichten nowMs uebernehmen.
      const s = createInitialState(0);
      const started = startDeploy(s, 0);
      const finished = updateReleaseTrain(started, 40_000, undefined, 77_777);
      expect(finished.releaseStatus).toBe('success');
      expect(finished.lastDeployAt).toBe(77_777);
      expect(finished.lastReleaseEvidence).toContain('77777');
    });

    it('tick(s, dtMs, nowMs) propagiert nowMs an updateReleaseTrain -> finishDeploy', () => {
      // Vollstaendiger Pfad: tick() -> updateReleaseTrain -> finishDeploy mit nowMs.
      const s = createInitialState(0);
      const started = startDeploy(s, 0);
      const finished = tick(started, 40_000, 88_888);
      expect(finished.releaseStatus).toBe('success');
      expect(finished.lastDeployAt).toBe(88_888);
    });

    it('finishDeploy ohne nowMs laesst bestehenden lastDeployAt unveraendert', () => {
      const s = createInitialState(0);
      const started = { ...startDeploy(s, 0), lastDeployAt: 42_000 };
      const finished = finishDeploy(started);
      expect(finished.lastDeployAt).toBe(42_000);
    });
  });
});

describe('Stage 5: Deterministic Deploy-RNG (v6)', () => {
  it('low-risk state: counter=0 deterministischer Roll → success (ohne successChance-Override)', () => {
    // RNG_DEFAULT_SEED + 0*GAMMA → splitmix64 % 10000 = 5304 (gepinnt in prng.test.ts).
    // Initial-State risk = 0.18 → riskBp = 1800. 5304 ≮ 1800 → success.
    const s = createInitialState(0);
    const started = startDeploy(s);
    expect(started.deployCounter).toBe(1n); // Georg's #1: nur auf erfolgreichem Start
    const finished = finishDeploy(started); // OHNE Override — reiner RNG-Pfad
    expect(finished.releaseStatus).toBe('success');
    expect(finished.successfulDeploys).toBe(1);
    expect(finished.failedDeploys).toBe(0);
  });

  it('high-risk state (5 P1-Tickets): counter=1 deterministischer Roll → failed', () => {
    // Georg's #3 Feinheit: "Test-Fallout ist Feature, nicht Bug."
    // Mindestens ein Test fürs Gegenteil: hoher Risk + deterministischer Roll → failed.
    // 5 P1-Tickets: risk = 0.18 + 5*0.04 + 5*0.12 = 0.98 → riskBp = 9800.
    // Counter=1 → rollBp = 8072 (gepinnt). 8072 < 9800 → failed.
    const s = createInitialState(0);
    const with5P1 = {
      ...s,
      tickets: Array.from({ length: 5 }, (_, i) => ({
        id: `p1-${i}`,
        type: 'p1' as const,
        title: `SEV1 Outage ${i}`,
        sla: 45,
        maxSla: 45,
        rewardScaled: 100n * SCALE,
        autoCloseTimer: 0,
        spawnTime: 0,
      })),
      // Drücke Observability/Erfahrung runter damit experienceCredit nicht
      // kompensiert (initial: errorBudget=100, observabilityScore=82, successfulDeploys=0).
      observabilityScore: 50, // weniger Credit
      errorBudget: 30,        // bisschen Budget-Risk on top
    };
    expect(canStartDeploy(with5P1)).toBe(true); // 5 ≤ 5, sev1 false
    const started = startDeploy(with5P1);
    expect(started.deployCounter).toBe(1n);
    const finished = finishDeploy(started); // OHNE Override
    expect(finished.releaseStatus).toBe('failed');
    expect(finished.failedDeploys).toBe(1);
    expect(finished.successfulDeploys).toBe(0);
    expect(finished.rollbackAvailable).toBe(true);
    expect(finished.activeIncidents).toBe(1);
    expect(finished.tickets.some((t) => t.title.toLowerCase().includes('deployment'))).toBe(true);
  });

  it('startDeploy blocked path: deployCounter bleibt UNVERÄNDERT (Georg #1)', () => {
    // Blockieren via sev1Active (canStartDeploy === false). Counter darf NICHT
    // hochgezählt werden — sonst würde ein blockierter Versuch den nächsten
    // gültigen Deploy um 1 versetzen und der Re-Verifier läuft auseinander.
    const s = { ...createInitialState(0), sev1Active: true };
    expect(canStartDeploy(s)).toBe(false);
    const after = startDeploy(s);
    expect(after.releaseStatus).toBe('idle'); // unverändert, kein 'building'
    expect(after.deployCounter).toBe(0n);     // NICHT inkrementiert
    expect(after.deploysStarted).toBe(0);     // legacy counter auch nicht
  });

  it('aufeinanderfolgende Deploys: deployCounter steigt monoton pro startDeploy', () => {
    // Georg's #1: counter inkrementiert NUR auf erfolgreichem StartDeploy.
    // Wir resetten releaseStatus zwischen den Deploys (Test-Helper), um den
    // Lifecycle (build→test→security→deploy) abzukuerzen — der ist in den
    // anderen Tests (Final E2E) bereits voll abgedeckt.
    const results: Array<bigint> = [];
    let s = createInitialState(0);
    for (let i = 0; i < 5; i++) {
      const idle = { ...s, releaseStatus: 'idle' as const };
      const started = startDeploy(idle);
      expect(started.deployCounter).toBe(BigInt(i + 1));
      results.push(started.deployCounter);
      s = finishDeploy(started);
    }
    expect(results).toEqual([1n, 2n, 3n, 4n, 5n]);
    // Mindestens 2 verschiedene Roll-Werte (über Counter-Wechsel) — beweist dass
    // der Counter tatsächlich Einfluss auf den Roll hat.
    const rollForCounter = (c: bigint) =>
      Number(splitmix64Modulo(s.rngSeed + c * SPLITMIX_GAMMA, RISK_BP_SCALE));
    const rollSet = new Set([rollForCounter(1n), rollForCounter(2n), rollForCounter(3n)]);
    expect(rollSet.size).toBeGreaterThanOrEqual(2);
  });
});

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
    const finished = finishDeploy(started); // ohne rng immer Erfolg
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
    // (chunks above)
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

  it('Bug #3: tatsächlich gewonnene Cycles sind während Bonus-Fenster ×1.5', () => {
    const base = { ...createInitialState(0), generators: { rack: 1 } };
    const normalGain = tick(base, 1000).cyclesScaled;

    const withBonus = {
      ...base,
      releaseStatus: 'success' as const,
      releaseDeployBonusTimer: 120,
      releaseDeployBonusMultiplier: 1.5,
    };
    const bonusGain = tick(withBonus, 1000).cyclesScaled;
    expect(bonusGain).toBe((normalGain * 3n) / 2n);
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

  it('Bug #4: nach Ablauf des Bonus-Fensters kann ein zweiter Deploy gestartet werden', () => {
    let s = createInitialState(0);
    s = startDeploy(s);
    s = updateReleaseTrain(s, 40_000); // deploy durchlaufen
    expect(s.releaseStatus).toBe('success');
    expect(canStartDeploy(s)).toBe(false);
    expect(s.releaseDeployBonusTimer).toBe(120);

    // Bonus- + Monitoring-Fenster komplett abwarten
    s = tick(s, 125_000);
    expect(s.releaseDeployBonusTimer).toBe(0);
    expect(s.releaseStatus).toBe('idle');
    expect(canStartDeploy(s)).toBe(true);

    const second = startDeploy(s);
    expect(second.releaseStatus).toBe('building');
    expect(second.deploysStarted).toBe(2);
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
});

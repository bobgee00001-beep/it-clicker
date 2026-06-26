// Regression: temporale CPS-Multiplikatoren (Deploy-Bonus × SLA-Penalty) müssen
// ZEIT-KORREKT und PARTITIONSUNABHÄNGIG integriert werden. Vor dem Fix wurde der
// Faktor auf das ganze dt angewandt => tick(125s) gab 125s Bonus statt 120s, und
// 1×tick ≠ N×tick (Online/Offline-Drift). Dazu: ITSM-Autoticket-Bonus muss ein
// Bonus (+X%) sein, kein 99%-Nerf.
import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  tick,
  productionPerSecScaled,
  productionPassiveRateScaled,
  applyOffline,
} from '../engine';
import { performRollback, canStartDeploy } from '../release';
import { getGenerator, ACHIEVEMENTS } from '../config';
import type { GameState, Ticket } from '../types';

const rackRate = getGenerator('rack')!.baseRateScaled; // 8 * SCALE

// Alle Achievements vorab freigeschaltet => evaluateAchievements ist ein No-Op
// und der Multiplier-Stack bleibt über den ganzen Tick KONSTANT. So testet die
// Partitionsunabhängigkeit REIN die temporale Integration, nicht den (online-only,
// granularitäts-abhängigen) Achievement-Feedback-Loop.
const ALL_ACHIEVEMENTS: Record<string, number> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, 1]),
);

function withRack(extra: Partial<GameState> = {}): GameState {
  return { ...createInitialState(0), generators: { rack: 1 }, ...extra } as GameState;
}

function dummyTicket(): Ticket {
  return {
    id: 't_dummy',
    type: 'p3',
    title: 'dummy',
    sla: 46,
    maxSla: 46,
    rewardScaled: 0n,
    autoCloseTimer: 0,
    spawnTime: 0,
  };
}

describe('temporale Faktoren — Display-Rate (ein Floor, exakte Rationale)', () => {
  it('Deploy-Bonus 1.5 -> ×3/2', () => {
    const s = withRack({ releaseStatus: 'success', releaseDeployBonusTimer: 120, releaseDeployBonusMultiplier: 1.5 });
    expect(productionPerSecScaled(s)).toBe((rackRate * 3n) / 2n);
  });

  it('SLA-Penalty 0.8 -> ×4/5', () => {
    const s = withRack({ cpsPenalty: 0.8, cpsPenaltyTimer: 30 });
    expect(productionPerSecScaled(s)).toBe((rackRate * 4n) / 5n);
  });

  it('Bonus × Penalty kombiniert -> ×6/5 (gcd-reduziert, ein Floor)', () => {
    const s = withRack({
      releaseDeployBonusTimer: 120,
      releaseDeployBonusMultiplier: 1.5,
      cpsPenalty: 0.8,
      cpsPenaltyTimer: 30,
    });
    expect(productionPerSecScaled(s)).toBe((rackRate * 6n) / 5n);
  });

  it('abgelaufene Timer -> kein Faktor (gated auf timer > 0)', () => {
    const s = withRack({
      releaseDeployBonusTimer: 0,
      releaseDeployBonusMultiplier: 1.5, // Wert noch da, aber Timer 0 => inaktiv
      cpsPenalty: 0.8,
      cpsPenaltyTimer: 0,
    });
    expect(productionPerSecScaled(s)).toBe(rackRate);
  });
});

describe('temporale Integration — Partitionsunabhängigkeit (Anti-Drift)', () => {
  // Konstanter Multiplier (alle Achievements vorab frei) => Equality-Tests messen
  // REIN die temporale Integration über die Bonus-Grenze, ohne Achievement-Feedback.
  const startConst = () =>
    withRack({
      releaseStatus: 'success',
      releaseDeployBonusTimer: 120,
      releaseDeployBonusMultiplier: 1.5,
      achievements: { ...ALL_ACHIEVEMENTS },
    });

  it('tick(125s) == tick(120s) ∘ tick(5s) — exakter Split an der Bonus-Grenze', () => {
    const big = tick(startConst(), 125_000).cyclesScaled;
    const split = tick(tick(startConst(), 120_000), 5_000).cyclesScaled;
    expect(split).toBe(big);
  });

  it('tick(125s) == 125×tick(1s) — feine Partition liefert dasselbe Total', () => {
    const big = tick(startConst(), 125_000).cyclesScaled;
    let s = startConst();
    for (let i = 0; i < 125; i++) s = tick(s, 1_000);
    expect(s.cyclesScaled).toBe(big);
  });

  it('Bonus wirkt exakt 120s ×1.5, danach ×1 — nicht 125s ×1.5', () => {
    // Ohne vorab-Achievements: im Einzel-Tick werden Achievements erst am ENDE
    // ausgewertet, daher produziert der ganze Tick mit reiner rackRate.
    const start = withRack({
      releaseStatus: 'success',
      releaseDeployBonusTimer: 120,
      releaseDeployBonusMultiplier: 1.5,
    });
    const gained = tick(start, 125_000).cyclesScaled;
    const seg1 = (((rackRate * 3n) / 2n) * 120_000n) / 1000n; // 120s mit Bonus
    const seg2 = (rackRate * 5_000n) / 1000n; // 5s ohne Bonus
    expect(gained).toBe(seg1 + seg2);
    // Naiver (falscher) Wert wäre 125s durchgehend mit Bonus:
    const naiveWrong = (((rackRate * 3n) / 2n) * 125_000n) / 1000n;
    expect(gained).not.toBe(naiveWrong);
  });
});

describe('ITSM-Autoticket-Bonus ist ein Bonus, kein 99%-Nerf', () => {
  it('autoticket + 1 offenes Ticket -> +1% Rate (×1.01), nicht ×0.01', () => {
    const base = withRack();
    const withBonus = withRack({ upgrades: { autoticket: 1 }, tickets: [dummyTicket()] });
    const baseRate = productionPassiveRateScaled(base);
    const bonusRate = productionPassiveRateScaled(withBonus);
    expect(bonusRate).toBeGreaterThan(baseRate); // war vorher 99% kleiner
    expect(bonusRate).toBe((baseRate * 10100n) / 10000n);
  });
});

describe('Release-Zyklus schließt nach Rollback / Bonus-Ablauf (kein Soft-Lock)', () => {
  it('performRollback setzt releaseStatus zurück auf idle', () => {
    const s = withRack({ releaseStatus: 'failed', rollbackAvailable: true, activeIncidents: 1 });
    const after = performRollback(s);
    expect(after.releaseStatus).toBe('idle');
    expect(canStartDeploy(after)).toBe(true);
  });

  it('geladener success+timer=0 normalisiert beim ersten tick auf idle', () => {
    const s = withRack({ releaseStatus: 'success', releaseDeployBonusTimer: 0, releaseDeployBonusMultiplier: 1 });
    expect(canStartDeploy(s)).toBe(false);
    const after = tick(s, 1_000);
    expect(after.releaseStatus).toBe('idle');
    expect(canStartDeploy(after)).toBe(true);
  });
});

describe('Offline: temporale Effekte altern (kein Bonus-übersteht-Offline-Exploit)', () => {
  it('Deploy-Bonus läuft während langer Offline-Abwesenheit ab', () => {
    // Save mit aktivem Bonus (60s), dann 5min offline -> Bonus muss abgelaufen sein.
    const s = withRack({
      lastSavedMs: 0,
      releaseStatus: 'success',
      releaseDeployBonusTimer: 60,
      releaseDeployBonusMultiplier: 1.5,
    });
    const { state } = applyOffline(s, 5 * 60_000);
    expect(state.releaseDeployBonusTimer).toBe(0);
    expect(state.releaseDeployBonusMultiplier).toBe(1);
    expect(state.releaseStatus).toBe('idle');
  });

  it('SLA-Penalty läuft offline ab', () => {
    const s = withRack({ lastSavedMs: 0, cpsPenalty: 0.8, cpsPenaltyTimer: 30 });
    const { state } = applyOffline(s, 2 * 60_000);
    expect(state.cpsPenaltyTimer).toBe(0);
    expect(state.cpsPenalty).toBe(1);
  });

  it('Offline-Produktion bleibt rein passiv (kein Bonus auf den Gewinn)', () => {
    // Mit aktivem Bonus: der Offline-Gewinn darf NICHT ×1.5 sein (Whitelist).
    const withBonus = withRack({
      lastSavedMs: 0,
      releaseStatus: 'success',
      releaseDeployBonusTimer: 100_000, // groß genug, dass er die Offline-Zeit überlebt
      releaseDeployBonusMultiplier: 1.5,
    });
    const plain = withRack({ lastSavedMs: 0 });
    const gainBonus = applyOffline(withBonus, 10_000).gainedScaled;
    const gainPlain = applyOffline(plain, 10_000).gainedScaled;
    expect(gainBonus).toBe(gainPlain); // temporaler Faktor wirkt offline NICHT
  });
});

import { describe, it, expect } from 'vitest';
import { createInitialState, click, evaluateAchievements as engineEvaluateAchievements } from '../engine';
import {
  achievementMet,
  evaluateAchievements,
  getAchievementMultiplier,
} from '../achievements';
import {
  checkPagerDuty,
  checkMondayMorning,
  trackFastTicket,
  trackSpend,
  trackMaxCyclesNoUpgrades,
} from '../timegates';
import { ACHIEVEMENTS } from '../config';
import { SCALE, type AchievementDef } from '../types';

describe('Stage 4: Achievements + Timegates', () => {
  it('evaluateAchievements nach 1 Klick: first_click unlocked', () => {
    const s = createInitialState(0);
    const afterClick = click(s);
    expect(afterClick.achievements.first_click).toBe(1);
  });

  it('engineEvaluateAchievements ist idempotent', () => {
    const s = createInitialState(0);
    const a = click(s);
    const b = engineEvaluateAchievements(a);
    expect(b.achievements.first_click).toBe(1);
    const c = engineEvaluateAchievements(b);
    expect(c.achievements.first_click).toBe(1);
  });

  it('Boolean-Flag: sev1Survived=true → Achievement unlocked', () => {
    const s = createInitialState(0);
    const a = { ...s, sev1Survived: true };
    const def: AchievementDef = {
      id: 'test_sev1_survived',
      name: 'Test',
      flavor: '',
      condition: { kind: 'boolean-flag', flag: 'sev1Survived' },
      target: { kind: 'globalProd' },
      factorNum: 1n,
      factorDen: 1n,
    };
    expect(achievementMet(a, def)).toBe(true);
    const evaluated = evaluateAchievements({ ...a, achievements: {} }, [def]);
    expect(evaluated.achievements.test_sev1_survived).toBe(1);
  });

  it('Composite: condition.all=[A,B] beide met → unlock', () => {
    const def: AchievementDef = {
      id: 'test_composite',
      name: 'Test Composite',
      flavor: '',
      condition: {
        kind: 'composite',
        all: [
          { kind: 'threshold', metric: 'clicks', threshold: 5 },
          { kind: 'boolean-flag', flag: 'upgradesEverBought' },
        ],
      },
      target: { kind: 'globalProd' },
      factorNum: 1n,
      factorDen: 1n,
    };
    const s1 = createInitialState(0);
    expect(achievementMet(s1, def)).toBe(false);
    const s2 = { ...s1, clicks: 5n, upgradesEverBought: true };
    expect(achievementMet(s2, def)).toBe(true);
    const evaluated = evaluateAchievements({ ...s2, achievements: {} }, [def]);
    expect(evaluated.achievements.test_composite).toBe(1);
  });

  it('Threshold: totalEarned >= 100 → hundred Achievement unlocked', () => {
    const s = createInitialState(0);
    const rich = { ...s, totalEarnedScaled: 100n * SCALE };
    const a = ACHIEVEMENTS.find((x) => x.id === 'hundred')!;
    expect(achievementMet(rich, a)).toBe(true);
    const evaluated = evaluateAchievements(rich);
    expect(evaluated.achievements.hundred).toBe(1);
  });

  it('Timegates: mocked Date für Monday 09:30 → mondayMorning triggert via checkMondayMorning', () => {
    const monday930 = new Date('2026-06-15T09:30:00'); // Montag
    const s = createInitialState(0);
    const withClicks = { ...s, mondayClicks: 0 };
    const afterCheck = checkMondayMorning(withClicks, monday930);
    // Innerhalb des Fensters bleibt der Zähler unverändert.
    expect(afterCheck.mondayClicks).toBe(0);
    // Simuliere 100 Klicks im Monday-Morning-Fenster:
    const clicked = { ...afterCheck, mondayClicks: 100 };
    const def: AchievementDef = {
      id: 'test_monday',
      name: 'Test Monday',
      flavor: '',
      condition: { kind: 'timegate', gate: 'mondayMorning' },
      target: { kind: 'globalProd' },
      factorNum: 1n,
      factorDen: 1n,
    };
    expect(achievementMet(clicked, def)).toBe(true);
  });

  it('checkPagerDuty setzt pagerDutyTriggered zwischen 03:00 und 04:00', () => {
    const pagerDutyTime = new Date('2026-06-15T03:30:00');
    const s = createInitialState(0);
    const after = checkPagerDuty(s, pagerDutyTime);
    expect(after.pagerDutyTriggered).toBe(true);
    expect(after.pagerDutyDate).toBe('2026-06-15');
  });

  it('checkPagerDuty triggert nicht außerhalb 03:00-04:00', () => {
    const noon = new Date('2026-06-15T12:00:00');
    const s = createInitialState(0);
    const after = checkPagerDuty(s, noon);
    expect(after.pagerDutyTriggered).toBe(false);
  });

  it('trackFastTicket zählt resolveTimeMs < 2000', () => {
    const s = createInitialState(0);
    const fast = trackFastTicket(s, 1500);
    expect(fast.fastTickets).toBe(1);
    const slow = trackFastTicket(fast, 2500);
    expect(slow.fastTickets).toBe(1);
  });

  it('trackSpend aktualisiert maxSpendIn60s im 60s-Fenster', () => {
    const s = createInitialState(0);
    const nowMs = 1_000_000;
    const a = trackSpend(s, 100n * SCALE, nowMs);
    expect(a.maxSpendIn60s).toBe(100n * SCALE);
    const b = trackSpend(a, 50n * SCALE, nowMs + 30_000);
    expect(b.maxSpendIn60s).toBe(150n * SCALE);
    const c = trackSpend(b, 10n * SCALE, nowMs + 70_000);
    // Event bei nowMs fällt raus; verbleibend: nowMs+30_000 und neuer nowMs+70_000
    expect(c.spendEvents.length).toBe(2);
    expect(c.maxSpendIn60s).toBe(150n * SCALE);
  });

  it('trackMaxCyclesNoUpgrades speichert Maximum ohne Upgrades', () => {
    const s = createInitialState(0);
    const withCycles = { ...s, cyclesScaled: 123n * SCALE };
    const tracked = trackMaxCyclesNoUpgrades(withCycles);
    expect(tracked.maxCyclesWithoutUpgrades).toBe(123n * SCALE);
  });

  it('trackMaxCyclesNoUpgrades resettet, sobald upgradesEverBought true', () => {
    const s = createInitialState(0);
    const bought = { ...s, cyclesScaled: 123n * SCALE, upgradesEverBought: true };
    const tracked = trackMaxCyclesNoUpgrades(bought);
    expect(tracked.maxCyclesWithoutUpgrades).toBe(0n);
  });

  it('getAchievementMultiplier aggregiert Freigeschaltete für globalProd', () => {
    const s = createInitialState(0);
    const withFirstClick = { ...s, achievements: { first_click: 1 } };
    const mult = getAchievementMultiplier(withFirstClick, 'click');
    expect(mult).toBe(1.01);
  });
});

import { describe, it, expect } from 'vitest';
import {
  UPGRADES,
  ACHIEVEMENTS,
  GENERATORS,
  getGenerator,
  getUpgrade,
  getAchievement,
  MAX_OFFLINE_SECONDS,
  OFFLINE_PENALTY,
  SEV1_THRESHOLD_TICKETS,
  SLA_SECONDS_BY_TYPE,
  TICKET_TITLES,
  SOUND_THEMES,
} from '../engine/config';

describe('Stage 1: Content & Static Config', () => {
  it('exports exactly 26 UpgradeDefs', () => {
    expect(UPGRADES.length).toBe(26);
  });

  it('exports exactly 32 AchievementDefs', () => {
    expect(ACHIEVEMENTS.length).toBe(32);
  });

  it('exports exactly 14 GeneratorDefs including workers', () => {
    expect(GENERATORS.length).toBe(14);
    expect(GENERATORS.some((g) => g.id === 'intern')).toBe(true);
    expect(GENERATORS.some((g) => g.id === 'staff')).toBe(true);
  });

  it('has unique ids inside UPGRADES', () => {
    const ids = UPGRADES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique ids inside ACHIEVEMENTS', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses bigint for factorNum in upgrades', () => {
    for (const u of UPGRADES) {
      expect(typeof u.factorNum).toBe('bigint');
      expect(typeof u.factorDen).toBe('bigint');
    }
  });

  it('uses bigint for factorNum in achievements', () => {
    for (const a of ACHIEVEMENTS) {
      expect(typeof a.factorNum).toBe('bigint');
      expect(typeof a.factorDen).toBe('bigint');
    }
  });

  it('lookup helpers return the correct defs', () => {
    expect(getGenerator('pi')?.name).toBe('Raspberry Pi');
    expect(getUpgrade('neural')?.name).toBe('Neural Interface');
    expect(getAchievement('unicorn')?.name).toBe('Unicorn Startup');
    expect(getGenerator('nonexistent')).toBeUndefined();
  });

  it('mirrors v1 core constants', () => {
    expect(MAX_OFFLINE_SECONDS).toBe(86_400);
    expect(OFFLINE_PENALTY).toBe(0.5);
    expect(SEV1_THRESHOLD_TICKETS).toBe(10);
  });

  it('mirrors v1 ticket config', () => {
    expect(SLA_SECONDS_BY_TYPE.p3).toBe(45);
    expect(SLA_SECONDS_BY_TYPE.p2).toBe(30);
    expect(SLA_SECONDS_BY_TYPE.p1).toBe(15);
    expect(TICKET_TITLES.p3.length).toBeGreaterThanOrEqual(2);
    expect(TICKET_TITLES.p2.length).toBeGreaterThanOrEqual(2);
    expect(TICKET_TITLES.p1.length).toBeGreaterThanOrEqual(2);
  });

  it('exports at least 4 sound themes', () => {
    expect(SOUND_THEMES.length).toBeGreaterThanOrEqual(4);
  });
});

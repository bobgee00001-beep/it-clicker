import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  productionPerSecScaled,
  effectiveClickScaled,
  buyGenerator,
  tick,
} from '../engine';
import { workerClickRatePerSec, workerCpsScaled, workerTicksForDt } from '../workers';
import { additiveClickPowerScaled } from '../clickBoost';
import { autoCloseSeconds, hasNoSla, cpsPerTicketBonus } from '../itsm';
import { SCALE, type GameState } from '../types';

function setWorkers(base: GameState, workers: Record<string, number>): GameState {
  return { ...base, generators: workers };
}

describe('Stage 2: Core Math Engine', () => {
  it('productionPerSecScaled(initial) === 0n', () => {
    expect(productionPerSecScaled(createInitialState(0))).toBe(0n);
  });

  it('workerCpsScaled(initial) === 0n', () => {
    const s0 = createInitialState(0);
    expect(workerCpsScaled(s0, effectiveClickScaled(s0))).toBe(0n);
  });

  it('effectiveClickScaled(initial) === 1n × SCALE', () => {
    expect(effectiveClickScaled(createInitialState(0))).toBe(1n * SCALE);
  });

  it('mit 1 Worker (intern, interval=2s): workerClickRatePerSec === 0.5', () => {
    const s = setWorkers(createInitialState(0), { intern: 1 });
    expect(workerClickRatePerSec(s)).toBe(0.5);
  });

  it('workerCpsScaled mit intern entspricht 0.5 × effektive Click-Power', () => {
    const s = setWorkers(createInitialState(0), { intern: 1 });
    expect(workerCpsScaled(s, effectiveClickScaled(s))).toBe(effectiveClickScaled(s) / 2n);
  });

  it('workerTicksForDt rechnet diskrete Worker-Clicks', () => {
    const s = setWorkers(createInitialState(0), { intern: 1 });
    expect(workerTicksForDt(s, 2000)).toBe(1);
    expect(workerTicksForDt(s, 3999)).toBe(1);
    expect(workerTicksForDt(s, 4000)).toBe(2);
  });

  it('additiveClickPowerScaled summiert clickBonus-Upgrades additiv', () => {
    const base = createInitialState(0);
    expect(additiveClickPowerScaled(base)).toBe(0n);
    const s = { ...base, upgrades: { kb: 1 } };
    expect(additiveClickPowerScaled(s)).toBe(1n * SCALE);
    expect(effectiveClickScaled(s)).toBe(2n * SCALE);
  });

  it('ITSM: autoCloseSeconds / hasNoSla / cpsPerTicketBonus', () => {
    const base = createInitialState(0);
    expect(autoCloseSeconds(base, 'p3')).toBe(0);
    expect(hasNoSla(base, 'p3')).toBe(false);
    expect(cpsPerTicketBonus(base)).toBe(0);

    const withBot = { ...base, upgrades: { bot: 1 } };
    expect(autoCloseSeconds(withBot, 'p3')).toBe(5);
    expect(autoCloseSeconds(withBot, 'p2')).toBe(0);

    const withAutoTicket = { ...base, upgrades: { autoticket: 1 }, tickets: [{ type: 'p3' } as never] };
    expect(cpsPerTicketBonus(withAutoTicket)).toBe(0.01);
  });

  it('tick erhöht cycles um passive Produktion + Worker-CPS', () => {
    const s = setWorkers(createInitialState(0), { intern: 1 });
    const after = tick(s, 2000);
    // 1 intern click alle 2s -> +1 * SCALE
    expect(after.cyclesScaled).toBe(1n * SCALE);
    expect(after.workerEarnedScaled).toBe(1n * SCALE);
  });

  it('productionPerSecScaled zählt Worker nicht als passive Produktion', () => {
    const s = setWorkers(createInitialState(0), { intern: 1 });
    expect(productionPerSecScaled(s)).toBe(0n);
  });
});

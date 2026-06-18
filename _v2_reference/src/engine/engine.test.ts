import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  nextCostScaled,
  productionPerSecScaled,
  click,
  canAfford,
  buyGenerator,
  genCount,
  tick,
  applyOffline,
  accrue,
  effectiveClickScaled,
  buyUpgrade,
  canAffordUpgrade,
  upgradeLevel,
  isqrt,
  sharesFor,
  prestigeGain,
  canPrestige,
  applyPrestige,
  evaluateAchievements,
} from './engine';
import {
  GENERATORS,
  getGenerator,
  getUpgrade,
  OFFLINE_CAP_MS,
  PRESTIGE_THRESHOLD_SCALED,
} from './config';
import { SCALE, type GameState } from './types';

// Hilfsmittel: State mit gesetztem Cycle-Guthaben (umgeht den Klick-Grind).
function withCycles(scaled: bigint) {
  return { ...createInitialState(0), cyclesScaled: scaled, totalEarnedScaled: scaled };
}

const SERVER = getGenerator('server')!;

describe('nextCostScaled — Kostenkurve', () => {
  it('erste Einheit kostet exakt die Basis', () => {
    expect(nextCostScaled(SERVER, 0)).toBe(10n * SCALE); // 10000n
  });

  it('folgt der kanonischen Rekurrenz (floor pro Schritt), NICHT der closed form', () => {
    // 10000 -> *115/100=11500 -> 13225 -> 15208 (floor 15208.75) -> 17489 (floor)
    expect(nextCostScaled(SERVER, 1)).toBe(11500n);
    expect(nextCostScaled(SERVER, 2)).toBe(13225n);
    expect(nextCostScaled(SERVER, 3)).toBe(15208n);
    // Divergenzpunkt: Rekurrenz 17489 vs. floor(10000*1.15^4)=17490. Hier wird
    // die Rekurrenz als kanonisch festgenagelt (gegen Re-Verifier-Drift).
    expect(nextCostScaled(SERVER, 4)).toBe(17489n);
    expect(nextCostScaled(SERVER, 5)).toBe(20112n); // floor(17489*115/100)=20112.35
  });

  it('rechnet die Rekurrenz unabhängig vom Pfad nach (nicht-tautologisch)', () => {
    // Unabhängige Referenzimplementierung statt Vergleich mit sich selbst.
    const ref = (owned: number) => {
      let c = SERVER.baseCostScaled;
      for (let i = 0; i < owned; i++) c = (c * SERVER.costGrowthNum) / SERVER.costGrowthDen;
      return c;
    };
    for (let owned = 0; owned <= 25; owned++) {
      expect(nextCostScaled(SERVER, owned)).toBe(ref(owned));
    }
  });

  it('ist streng monoton steigend und immer bigint', () => {
    let prev = -1n;
    for (let owned = 0; owned <= 50; owned++) {
      const c = nextCostScaled(SERVER, owned);
      expect(typeof c).toBe('bigint');
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });
});

describe('click', () => {
  it('addiert clickPower auf cycles UND totalEarned', () => {
    const s0 = createInitialState(0);
    const s1 = click(s0);
    expect(s1.cyclesScaled).toBe(s0.clickPowerScaled);
    expect(s1.totalEarnedScaled).toBe(s0.clickPowerScaled);
  });

  it('mutiert den Ausgangs-State nicht (pure)', () => {
    const s0 = createInitialState(0);
    click(s0);
    expect(s0.cyclesScaled).toBe(0n);
  });
});

describe('buyGenerator / canAfford', () => {
  it('zieht exakt die Kosten ab und erhöht die Anzahl', () => {
    const cost = nextCostScaled(SERVER, 0); // 10000n
    const s = buyGenerator(withCycles(cost + 5n), 'server');
    expect(genCount(s, 'server')).toBe(1);
    expect(s.cyclesScaled).toBe(5n);
  });

  it('verweigert Kauf bei zu wenig Cycles (No-Op, unveränderter State)', () => {
    const poor = withCycles(0n);
    expect(canAfford(poor, 'server')).toBe(false);
    const after = buyGenerator(poor, 'server');
    expect(after).toBe(poor); // identische Referenz -> echter No-Op
  });

  it('unbekannte Generator-ID ist ein No-Op', () => {
    const s = withCycles(10n ** 9n);
    expect(buyGenerator(s, 'does-not-exist')).toBe(s);
  });
});

describe('productionPerSecScaled', () => {
  it('ist 0 ohne Generatoren', () => {
    expect(productionPerSecScaled(createInitialState(0))).toBe(0n);
  });

  it('skaliert linear mit der Anzahl', () => {
    const s = { ...createInitialState(0), generators: { server: 3 } };
    expect(productionPerSecScaled(s)).toBe(3n * SERVER.baseRateScaled);
  });
});

describe('tick — Determinismus & kein Granularitäts-Drift', () => {
  it('liefert konkreten Gewinn & mutiert nicht (nicht-tautologisch)', () => {
    const s: GameState = { ...createInitialState(0), generators: { server: 1 } };
    const out = tick(s, 250); // 1 Server = 1000n/s; 1000*250/1000 = 250n
    expect(out.cyclesScaled).toBe(250n);
    expect(out.totalEarnedScaled).toBe(250n);
    expect(s.cyclesScaled).toBe(0n); // Ausgangs-State unangetastet (pure)
  });

  it('No-Op bei dt<=0', () => {
    const s = { ...createInitialState(0), generators: { server: 1 } };
    expect(tick(s, 0)).toBe(s);
    expect(tick(s, -100)).toBe(s);
  });

  it('liefert dasselbe Total egal wie fein getickt wird (10s)', () => {
    const base: GameState = { ...createInitialState(0), generators: { server: 1 } };
    const T = 10_000;

    const oneShot = tick(base, T).cyclesScaled;

    let coarse = base;
    for (let i = 0; i < 100; i++) coarse = tick(coarse, 100); // 100x100ms
    let fine = base;
    for (let i = 0; i < T; i++) fine = tick(fine, 1); // 10000x1ms

    expect(coarse.cyclesScaled).toBe(oneShot);
    expect(fine.cyclesScaled).toBe(oneShot);
    expect(oneShot).toBe(10n * SERVER.baseRateScaled); // 1 Server * 1 Cycle/s * 10s
  });
});

describe('applyOffline', () => {
  it('deckelt verstrichene Zeit auf OFFLINE_CAP_MS (8h)', () => {
    const s = { ...createInitialState(0), generators: { server: 1 }, lastSavedMs: 0 };
    const elapsedReal = OFFLINE_CAP_MS + 5 * 60 * 60 * 1000; // 13h offline
    const { gainedScaled, elapsedMs, state } = applyOffline(s, elapsedReal);

    expect(elapsedMs).toBe(OFFLINE_CAP_MS); // gedeckelt
    expect(gainedScaled).toBe((SERVER.baseRateScaled * BigInt(OFFLINE_CAP_MS)) / 1000n);
    expect(state.lastSavedMs).toBe(elapsedReal);
  });

  it('closed-form == Summe äquivalenter Ticks (kein Float-Vorteil/-Nachteil)', () => {
    const s: GameState = { ...createInitialState(0), generators: { server: 2 }, lastSavedMs: 0 };
    const dt = 3_600_000; // 1h, unter Cap
    const offlineGain = applyOffline(s, dt).gainedScaled;

    let ticked = s;
    for (let i = 0; i < 3600; i++) ticked = tick(ticked, 1000); // 3600x1s
    expect(ticked.cyclesScaled - s.cyclesScaled).toBe(offlineGain);
  });

  it('kein Gewinn ohne Generatoren', () => {
    const s = { ...createInitialState(0), lastSavedMs: 0 };
    expect(applyOffline(s, OFFLINE_CAP_MS).gainedScaled).toBe(0n);
  });
});

describe('accrue — Rest-Übertrag & Partitionsunabhängigkeit (Fix #2)', () => {
  // Krumme Rate 333n: KEIN Vielfaches von 1000n. Ohne Übertrag würde jeder
  // 1ms-Tick auf 0 floorn und Produktion komplett verschwinden.
  const RATE = 333n;

  function totalOverPartition(stepMs: number, steps: number): bigint {
    let gainSum = 0n;
    let rem = 0n;
    for (let i = 0; i < steps; i++) {
      const r = accrue(RATE, stepMs, rem);
      gainSum += r.gainScaled;
      rem = r.remainder;
    }
    return gainSum;
  }

  it('Summe feiner Ticks == ein großer Tick == closed-form, für krumme Rate', () => {
    const T = 10_000;
    const closedForm = (RATE * BigInt(T)) / 1000n; // floor(333*10000/1000) = 3330n
    expect(closedForm).toBe(3330n);
    expect(totalOverPartition(T, 1)).toBe(closedForm); // 1x10000ms
    expect(totalOverPartition(100, 100)).toBe(closedForm); // 100x100ms
    expect(totalOverPartition(1, T)).toBe(closedForm); // 10000x1ms — ohne Übertrag = 0
  });

  it('Übertrag bleibt im gültigen Bereich 0..999', () => {
    let rem = 0n;
    for (let i = 0; i < 5000; i++) {
      rem = accrue(RATE, 1, rem).remainder;
      expect(rem).toBeGreaterThanOrEqual(0n);
      expect(rem).toBeLessThan(1000n);
    }
  });
});

describe('Upgrades & Multiplikatoren (Phase 2a)', () => {
  it('ohne Upgrades: Produktion = Σ baseRate*count (Multiplier == 1)', () => {
    const s = { ...createInitialState(0), generators: { server: 3 } };
    expect(productionPerSecScaled(s)).toBe(3n * getGenerator('server')!.baseRateScaled);
  });

  it('Klick-Upgrade ×2 verdoppelt effektive Klick-Power', () => {
    const base = createInitialState(0);
    expect(effectiveClickScaled(base)).toBe(1000n);
    const s = { ...base, upgrades: { 'click-mech-kb': 1 } };
    expect(effectiveClickScaled(s)).toBe(2000n);
    expect(click(s).cyclesScaled).toBe(2000n);
  });

  it('Klick-Upgrades stapeln multiplikativ (×2 · ×3 = ×6)', () => {
    const s = { ...createInitialState(0), upgrades: { 'click-mech-kb': 1, 'click-macro': 1 } };
    expect(effectiveClickScaled(s)).toBe(6000n);
  });

  it('Per-Generator-Upgrade boostet NUR diesen Generator', () => {
    const s = {
      ...createInitialState(0),
      generators: { server: 1, rack: 1 },
      upgrades: { 'server-ssd': 1 },
    };
    const server = getGenerator('server')!.baseRateScaled; // 1000
    const rack = getGenerator('rack')!.baseRateScaled; // 8000
    expect(productionPerSecScaled(s)).toBe(server * 2n + rack); // server ×2, rack unverändert
  });

  it('globales Upgrade ×5/4 boostet alle Generatoren', () => {
    const s = {
      ...createInitialState(0),
      generators: { server: 1, rack: 1 },
      upgrades: { 'global-overtime': 1 },
    };
    // floor pro Generator: 1000*5/4=1250, 8000*5/4=10000
    expect(productionPerSecScaled(s)).toBe(1250n + 10000n);
  });

  it('krummer Faktor 4/3 floored PRO GENERATOR (nicht global über die Summe)', () => {
    const s = {
      ...createInitialState(0),
      generators: { server: 1, rack: 1 },
      upgrades: { 'global-edge': 1 },
    };
    // floor(1000*4/3)=1333, floor(8000*4/3)=10666 => 11999
    expect(productionPerSecScaled(s)).toBe(1333n + 10666n);
    // Ein globaler Floor über die Summe wäre floor(9000*4/3)=12000 — beweist die
    // Per-Generator-Semantik (Sparring #7).
    expect(productionPerSecScaled(s)).not.toBe((9000n * 4n) / 3n);
  });

  it('Multiplikator-Komposition ist reihenfolge-unabhängig', () => {
    const a = {
      ...createInitialState(0),
      generators: { server: 5 },
      upgrades: { 'server-ssd': 1, 'global-overtime': 1, 'global-edge': 1 },
    };
    const b = {
      ...createInitialState(0),
      generators: { server: 5 },
      upgrades: { 'global-edge': 1, 'global-overtime': 1, 'server-ssd': 1 },
    };
    expect(productionPerSecScaled(a)).toBe(productionPerSecScaled(b));
  });

  it('buyUpgrade: Kosten ab, Level gesetzt; No-Op bei max/zu-wenig/unbekannt', () => {
    const def = getUpgrade('click-mech-kb')!;
    const rich = { ...createInitialState(0), cyclesScaled: def.costScaled + 5n };
    const bought = buyUpgrade(rich, 'click-mech-kb');
    expect(upgradeLevel(bought, 'click-mech-kb')).toBe(1);
    expect(bought.cyclesScaled).toBe(5n);
    expect(buyUpgrade(bought, 'click-mech-kb')).toBe(bought); // maxLevel -> No-Op
    const poor = createInitialState(0);
    expect(canAffordUpgrade(poor, 'click-mech-kb')).toBe(false);
    expect(buyUpgrade(poor, 'click-mech-kb')).toBe(poor); // zu wenig -> No-Op
    expect(buyUpgrade(rich, 'nope')).toBe(rich); // unbekannt -> No-Op
  });

  it('Upgrade-Boost wirkt online (tick) == offline (applyOffline), mit Übertrag (Sparring #3)', () => {
    const s: GameState = {
      ...createInitialState(0),
      generators: { server: 1 },
      upgrades: { 'global-edge': 1 }, // rate = floor(1000*4/3) = 1333n/s
      lastSavedMs: 0,
    };
    const T = 3000;
    let online = s;
    for (let i = 0; i < T; i++) online = tick(online, 1);
    const offlineGain = applyOffline(s, T).gainedScaled;
    expect(online.cyclesScaled).toBe(offlineGain);
    expect(offlineGain).toBe(3999n); // floor(1333*3000/1000)
  });
});

describe('isqrt — exakter Integer-Quadratwurzel-Floor (Prestige 2b)', () => {
  it('kleine Werte', () => {
    const cases: [bigint, bigint][] = [
      [0n, 0n], [1n, 1n], [2n, 1n], [3n, 1n], [4n, 2n],
      [8n, 2n], [9n, 3n], [15n, 3n], [16n, 4n], [24n, 4n], [25n, 5n],
    ];
    for (const [n, r] of cases) expect(isqrt(n)).toBe(r);
  });

  it('exakt an/neben großen Quadratzahlen (bit-identisch)', () => {
    const big = 1_000_000_000n; // 1e9
    expect(isqrt(big * big)).toBe(big);
    expect(isqrt(big * big - 1n)).toBe(big - 1n);
    expect(isqrt(big * big + 1n)).toBe(big);
  });

  it('Invariante r² <= n < (r+1)² über einen Bereich', () => {
    for (let n = 0n; n < 2000n; n++) {
      const r = isqrt(n);
      expect(r * r <= n && n < (r + 1n) * (r + 1n)).toBe(true);
    }
  });

  it('wirft bei negativem Input', () => {
    expect(() => isqrt(-1n)).toThrow();
  });
});

describe('Prestige / Shares (2b)', () => {
  const TH = PRESTIGE_THRESHOLD_SCALED; // 1e9

  it('sharesFor folgt floor(√(total/THRESHOLD))', () => {
    expect(sharesFor(0n)).toBe(0n);
    expect(sharesFor(TH - 1n)).toBe(0n);
    expect(sharesFor(TH)).toBe(1n);
    expect(sharesFor(4n * TH)).toBe(2n);
    expect(sharesFor(100n * TH)).toBe(10n);
  });

  it('prestigeGain = neue Shares über bereits gebankte, nie negativ', () => {
    const base = createInitialState(0);
    expect(prestigeGain({ ...base, totalEarnedScaled: 4n * TH, shares: 0n })).toBe(2n);
    expect(prestigeGain({ ...base, totalEarnedScaled: 4n * TH, shares: 1n })).toBe(1n);
    expect(prestigeGain({ ...base, totalEarnedScaled: 4n * TH, shares: 2n })).toBe(0n);
    expect(prestigeGain({ ...base, totalEarnedScaled: 4n * TH, shares: 5n })).toBe(0n); // nie negativ
  });

  it('canPrestige spiegelt prestigeGain > 0', () => {
    const base = createInitialState(0);
    expect(canPrestige({ ...base, totalEarnedScaled: TH })).toBe(true);
    expect(canPrestige({ ...base, totalEarnedScaled: TH - 1n })).toBe(false);
  });

  it('applyPrestige: bankt Shares, resettet Run, behält Lifetime — monoton', () => {
    const s: GameState = {
      ...createInitialState(12345),
      cyclesScaled: 999n,
      totalEarnedScaled: 9n * TH, // -> 3 Shares
      generators: { server: 30 },
      upgrades: { 'server-ssd': 1 },
      prodRemainder: 500n,
      clickPowerScaled: 5000n,
      shares: 0n,
    };
    const p = applyPrestige(s);
    expect(p.shares).toBe(3n);
    expect(p.cyclesScaled).toBe(0n);
    expect(p.generators).toEqual({});
    expect(p.upgrades).toEqual({});
    expect(p.prodRemainder).toBe(0n);
    expect(p.clickPowerScaled).toBe(1000n); // zurück auf Basis
    expect(p.totalEarnedScaled).toBe(9n * TH); // Lifetime bleibt
    expect(p.lastSavedMs).toBe(12345); // erhalten
    expect(prestigeGain(p)).toBe(0n); // sofort nach Prestige nichts mehr -> monoton
  });

  it('applyPrestige ist No-Op wenn nichts zu holen', () => {
    const s = { ...createInitialState(0), totalEarnedScaled: TH - 1n };
    expect(applyPrestige(s)).toBe(s);
  });

  it('Shares geben exakten globalen Multiplikator (+2% je Share, rational)', () => {
    const base = { ...createInitialState(0), generators: { server: 1 } };
    expect(productionPerSecScaled({ ...base, shares: 0n })).toBe(1000n);
    // shares=1 -> (50+1)/50 = 51/50 -> floor(1000*51/50)=1020
    expect(productionPerSecScaled({ ...base, shares: 1n })).toBe(1020n);
    // shares=50 -> (100)/50 = 2/1 -> 2000
    expect(productionPerSecScaled({ ...base, shares: 50n })).toBe(2000n);
  });
});

describe('Achievements (2c)', () => {
  const TH = PRESTIGE_THRESHOLD_SCALED;

  it('schaltet bei erfüllter Bedingung frei (alle Arten)', () => {
    const base = createInitialState(0);
    // genCount: first-server
    expect(evaluateAchievements({ ...base, generators: { server: 1 } }).achievements['first-server']).toBe(1);
    // totalGenerators: maintenance-window (25)
    expect(evaluateAchievements({ ...base, generators: { server: 20, rack: 5 } }).achievements['maintenance-window']).toBe(1);
    // totalEarned: megacycle (1e6 cycles = 1e9 scaled)
    expect(evaluateAchievements({ ...base, totalEarnedScaled: TH }).achievements['megacycle']).toBe(1);
    // shares: going-public
    expect(evaluateAchievements({ ...base, shares: 1n }).achievements['going-public']).toBe(1);
    // clicks: rsi (1000)
    expect(evaluateAchievements({ ...base, clicks: 1000n }).achievements['rsi']).toBe(1);
  });

  it('schaltet NICHT frei knapp unter der Schwelle', () => {
    const base = createInitialState(0);
    expect(evaluateAchievements({ ...base, clicks: 999n }).achievements['rsi']).toBeUndefined();
    expect(evaluateAchievements({ ...base, totalEarnedScaled: TH - 1n }).achievements['megacycle']).toBeUndefined();
  });

  it('ist idempotent & gibt bei keiner Änderung dieselbe Referenz', () => {
    const s = { ...createInitialState(0), generators: { server: 1 } };
    const once = evaluateAchievements(s);
    const twice = evaluateAchievements(once);
    expect(twice).toBe(once); // nichts Neues -> selbe Referenz
    expect(once).not.toBe(s); // erste Auswertung hat freigeschaltet
  });

  it('Bonus fließt in den Multiplier-Stack (first-server = ×2 Klick)', () => {
    const base = createInitialState(0);
    const before = effectiveClickScaled(base); // 1000
    const after = evaluateAchievements({ ...base, generators: { server: 1 } });
    expect(effectiveClickScaled(after)).toBe(before * 2n);
  });

  it('Offline-Pfad schaltet NICHT frei; erster Online-Tick danach schon (Whitelist)', () => {
    // Offline-Crossing: vor Offline 0 Generatoren -> 0 Rate -> kein Ertrag, aber
    // wir crossen die totalEarned-Schwelle künstlich VOR applyOffline.
    const s: GameState = {
      ...createInitialState(0),
      generators: { server: 1 },
      totalEarnedScaled: TH, // megacycle-Schwelle erreicht
      lastSavedMs: 0,
    };
    const off = applyOffline(s, 5000).state;
    expect(off.achievements['megacycle']).toBeUndefined(); // offline NICHT freigeschaltet
    const online = tick(off, 100);
    expect(online.achievements['megacycle']).toBe(1); // erster Online-Tick schaltet frei
  });

  it('buyGenerator/click schalten sofort frei (Online-Transition)', () => {
    const rich = { ...createInitialState(0), cyclesScaled: 1_000_000n * 1000n };
    expect(buyGenerator(rich, 'server').achievements['first-server']).toBe(1);
  });

  it('clicks-Zähler steigt pro Klick', () => {
    let s = createInitialState(0);
    s = click(s);
    s = click(s);
    expect(s.clicks).toBe(2n);
  });

  it('Achievements bleiben PERMANENT über Prestige erhalten', () => {
    const s: GameState = {
      ...createInitialState(0),
      generators: { server: 30 },
      achievements: { 'first-server': 1, 'small-farm': 1 },
      clicks: 1500n,
      totalEarnedScaled: 9n * TH, // 3 Shares möglich
    };
    const p = applyPrestige(s);
    expect(p.generators).toEqual({}); // Run resettet
    expect(p.achievements['first-server']).toBe(1); // bleibt
    expect(p.achievements['small-farm']).toBe(1); // bleibt, obwohl Server jetzt 0
    expect(p.clicks).toBe(1500n); // Lifetime-Klicks bleiben
    expect(p.achievements['going-public']).toBe(1); // shares>=1 nach Prestige -> neu frei
  });
});

describe('Numerik-Invariante: kein Float im autoritativen Pfad', () => {
  // Bewusst eng: prüft NUR die Config-Felder. Der feindliche Save-Pfad
  // (Float/String-Injection) wird in save.test.ts abgedeckt, nicht hier.
  it('alle Generator-Defs sind reine bigint-Felder', () => {
    for (const g of GENERATORS) {
      expect(typeof g.baseCostScaled).toBe('bigint');
      expect(typeof g.baseRateScaled).toBe('bigint');
      expect(typeof g.costGrowthNum).toBe('bigint');
      expect(typeof g.costGrowthDen).toBe('bigint');
    }
  });
});

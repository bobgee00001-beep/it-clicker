import { describe, it, expect } from 'vitest';
import { serialize, deserialize, exportPayload, importPayload, clearCorruptSave } from './save';
import { createInitialState } from './engine';
import { ENGINE_VERSION } from './config';
import { SCALE } from './types';

describe('save serialize/deserialize — Round-Trip', () => {
  it('erhält bigint-Werte exakt über JSON (String-Kodierung)', () => {
    const s = {
      ...createInitialState(1_700_000_000_000),
      cyclesScaled: 123_456_789_012_345_678_901n, // > Number.MAX_SAFE_INTEGER
      totalEarnedScaled: 999_999_999_999_999_999n,
      prodRemainder: 777n,
      generators: { pi: 7, ssd: 3 },
      upgrades: { kb: 1, mouse: 1 },
      achievements: { first_click: 1 },
      clicks: 1234n,
      shares: 42n,
    };
    const back = deserialize(serialize(s))!;
    expect(back.cyclesScaled).toBe(s.cyclesScaled);
    expect(back.totalEarnedScaled).toBe(s.totalEarnedScaled);
    expect(back.clickPowerScaled).toBe(s.clickPowerScaled);
    expect(back.prodRemainder).toBe(777n);
    expect(back.generators).toEqual(s.generators);
    expect(back.upgrades).toEqual(s.upgrades);
    expect(back.achievements).toEqual(s.achievements);
    expect(back.clicks).toBe(1234n);
    expect(back.shares).toBe(42n);
    expect(back.lastSavedMs).toBe(s.lastSavedMs);
    expect(back.version).toBe(ENGINE_VERSION); // serialize stempelt aktuelle Version
    expect(typeof back.cyclesScaled).toBe('bigint');
  });

  it('liefert null bei kaputtem JSON statt zu werfen', () => {
    expect(deserialize('}{ not json')).toBeNull();
    expect(deserialize('42')).toBeNull();
    expect(deserialize('null')).toBeNull();
    expect(deserialize('"string"')).toBeNull();
  });

  it('füllt fehlende Felder mit sicheren Defaults', () => {
    const back = deserialize('{}')!;
    expect(back).not.toBeNull();
    expect(back.cyclesScaled).toBe(0n);
    expect(back.clickPowerScaled).toBe(1000n); // 1 Cycle * SCALE
    expect(back.prodRemainder).toBe(0n);
    expect(back.generators).toEqual({});
    expect(back.upgrades).toEqual({});
    expect(back.shares).toBe(0n);
    expect(back.achievements).toEqual({});
    expect(back.clicks).toBe(0n);
    expect(typeof back.lastSavedMs).toBe('number');
  });
});

describe('deserialize — v1/v2/v3/v4/v5 Migration', () => {
  it('v1-Flat-Payload (cycles number) → v5 GameState', () => {
    const v1 = JSON.stringify({
      version: 1,
      cycles: 1000,
      totalEarned: 5000,
      generators: { server: 2 },
      upgrades: { kb: 1 },
      clicks: 42,
    });
    const back = deserialize(v1)!;
    expect(back.version).toBe(ENGINE_VERSION);
    expect(back.cyclesScaled).toBe(1000n * SCALE);
    expect(back.totalEarnedScaled).toBe(5000n * SCALE);
    expect(back.generators).toEqual({ server: 2 }); // v1 generator IDs kept in generators
    expect(back.upgrades).toEqual({ kb: 1 });
    expect(back.clicks).toBe(42n);
  });

  it('v4-Flat-Payload → v5 GameState', () => {
    const v4 = JSON.stringify({
      version: 4,
      cyclesScaled: '5000',
      totalEarnedScaled: '5000',
      clickPowerScaled: '1000',
      prodRemainder: '0',
      generators: { pi: 2, ssd: 1 },
      upgrades: { ssd: 1 },
      shares: '3',
      lastSavedMs: 1_700_000_000_000,
    });
    const back = deserialize(v4)!;
    expect(back.shares).toBe(3n);
    expect(back.generators).toEqual({ pi: 2, ssd: 1 });
    expect(back.upgrades).toEqual({}); // ssd was a generator purchase in v1 upgrades, moved to generators
    expect(back.releaseStatus).toBe('idle');
    expect(back.observabilityScore).toBe(82);
    expect(back.masterVolume).toBe(1.0);
  });

  it('v4-Wrap-Payload → importPayload → v5 GameState', () => {
    const wrap = {
      version: 4,
      data: JSON.stringify({
        version: 4,
        cyclesScaled: '9000',
        totalEarnedScaled: '9000',
        clickPowerScaled: '1000',
        generators: { pi: 5 },
        upgrades: { kb: 1 },
      }),
    };
    const back = importPayload(JSON.stringify(wrap))!;
    expect(back.cyclesScaled).toBe(9000n);
    expect(back.generators).toEqual({ pi: 5 });
    expect(back.upgrades).toEqual({ kb: 1 });
  });
});

describe('exportPayload / importPayload', () => {
  it('Export → Import → State identisch', () => {
    const s = {
      ...createInitialState(1_700_000_000_000),
      cyclesScaled: 1_000_000_000_000n,
      totalEarnedScaled: 2_000_000_000_000n,
      generators: { pi: 3, ssd: 1 },
      upgrades: { kb: 1 },
      clicks: 99n,
      shares: 7n,
    };
    const exported = exportPayload(s);
    expect(exported.version).toBe(ENGINE_VERSION);
    expect(typeof exported.exportedAt).toBe('string');
    expect(exported.data).toBe(serialize(s));

    const back = importPayload(JSON.stringify(exported))!;
    expect(back.cyclesScaled).toBe(s.cyclesScaled);
    expect(back.totalEarnedScaled).toBe(s.totalEarnedScaled);
    expect(back.generators).toEqual(s.generators);
    expect(back.upgrades).toEqual(s.upgrades);
    expect(back.clicks).toBe(s.clicks);
    expect(back.shares).toBe(s.shares);
  });

  it('importPayload toleriert korrupten Input mit null statt throw', () => {
    expect(importPayload('}{')).toBeNull();
    expect(importPayload('null')).toBeNull();
    expect(importPayload('{}')).not.toBeNull();
    expect(importPayload('{"version":1,"data":"not-json"}')).toBeNull();
  });
});

describe('deserialize — Härtung gegen feindliche Saves', () => {
  it('verwirft String-Counts (sonst owned+1 == "71" String-Concat)', () => {
    const back = deserialize('{"generators":{"pi":"7"}}')!;
    expect(back.generators).toEqual({});
  });

  it('weist negative/krumme BigInt-Felder ab', () => {
    expect(deserialize('{"cyclesScaled":"-100"}')!.cyclesScaled).toBe(0n);
    expect(deserialize('{"cyclesScaled":"1.5"}')!.cyclesScaled).toBe(0n);
  });

  it('weist "not-a-number" BigInt-Feld ab → null', () => {
    // migrateSavePayload normalisiert "not-a-number" auf 0n; deserialize darf nicht werfen.
    const back = deserialize('{"cycles": "not-a-number"}')!;
    expect(back.cyclesScaled).toBe(0n);
  });
});

describe('clearCorruptSave', () => {
  it('ist no-op im Node-/Testkontext (kein localStorage)', () => {
    expect(() => clearCorruptSave()).not.toThrow();
  });
});

describe('save serialize/deserialize — RNG-State Round-Trip (v6)', () => {
  // Phase-3-Leaderboard-Kontrakt: rngSeed + deployCounter müssen exakt
  // serialisiert/deserialisiert werden, sonst weicht der nächste Online-Roll
  // vom Server-Validator ab (Audit-Fail). bigint-Werte > Number.MAX_SAFE_INTEGER
  // sind der Härtetest — JSON kann die nicht ohne String-Kodierung transportieren.
  it('rngSeed + deployCounter round-trip über serialize/deserialize', () => {
    const s = {
      ...createInitialState(1_700_000_000_000),
      rngSeed: 0xDEADBEEF_CAFE_BABE_DEADBEEFn,
      deployCounter: 1_234_567_890_123_456_789n, // > Number.MAX_SAFE_INTEGER
    };
    const back = deserialize(serialize(s))!;
    expect(back.rngSeed).toBe(0xDEADBEEF_CAFE_BABE_DEADBEEFn);
    expect(back.deployCounter).toBe(1_234_567_890_123_456_789n);
    expect(typeof back.rngSeed).toBe('bigint');
    expect(typeof back.deployCounter).toBe('bigint');
  });

  it('RNG_DEFAULT_SEED round-trip bei frischem createInitialState', () => {
    // Nach createInitialState sind rngSeed = RNG_DEFAULT_SEED und deployCounter = 0n.
    // Speichern + Laden muss diese Werte exakt zurückbringen.
    const s = createInitialState(1_700_000_000_000);
    const back = deserialize(serialize(s))!;
    expect(back.rngSeed).toBe(s.rngSeed);
    expect(back.deployCounter).toBe(0n);
  });

  it('exportPayload/importPayload erhält rngSeed + deployCounter', () => {
    const s = {
      ...createInitialState(1_700_000_000_000),
      rngSeed: 0xFEEDFACE_C0FFEE_1234_5678n,
      deployCounter: 999n,
    };
    const exported = exportPayload(s);
    const back = importPayload(JSON.stringify(exported))!;
    expect(back.rngSeed).toBe(0xFEEDFACE_C0FFEE_1234_5678n);
    expect(back.deployCounter).toBe(999n);
  });

  it('legacyDeserialize verwendet RNG_DEFAULT_SEED wenn rngSeed fehlt (Robustheit)', () => {
    // Wenn ein älterer Save (oder ein manuell gebauter JSON) kein rngSeed hat,
    // soll der Default greifen statt zu werfen oder undefined zu liefern.
    const raw = JSON.stringify({
      version: ENGINE_VERSION,
      cyclesScaled: '1000',
      totalEarnedScaled: '1000',
      clickPowerScaled: '1000',
      prodRemainder: '0',
      generators: {},
      upgrades: {},
      // rngSeed fehlt bewusst
      // deployCounter fehlt bewusst
      shares: '0',
    });
    const back = deserialize(raw)!;
    expect(back.rngSeed).toBeDefined();
    expect(typeof back.rngSeed).toBe('bigint');
    expect(back.deployCounter).toBe(0n);
  });
});

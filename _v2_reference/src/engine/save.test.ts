import { describe, it, expect } from 'vitest';
import { serialize, deserialize } from './save';
import { createInitialState } from './engine';
import { ENGINE_VERSION } from './config';

describe('save serialize/deserialize — Round-Trip', () => {
  it('erhält bigint-Werte exakt über JSON (String-Kodierung)', () => {
    const s = {
      ...createInitialState(1_700_000_000_000),
      cyclesScaled: 123_456_789_012_345_678_901n, // > Number.MAX_SAFE_INTEGER
      totalEarnedScaled: 999_999_999_999_999_999n,
      prodRemainder: 777n,
      generators: { server: 7 },
      upgrades: { 'click-mech-kb': 1, 'global-overtime': 1 },
      achievements: { 'first-server': 1 },
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
    expect(deserialize('42')).toBeNull(); // JSON, aber kein Objekt
    expect(deserialize('null')).toBeNull();
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

describe('deserialize — v4→v5 Migration & achievements-Härtung', () => {
  it('lädt einen v4-Save ohne achievements/clicks verlustfrei (Defaults)', () => {
    const v4 = JSON.stringify({
      cyclesScaled: '5000',
      totalEarnedScaled: '5000',
      clickPowerScaled: '1000',
      prodRemainder: '0',
      generators: { server: 2 },
      upgrades: {},
      shares: '3',
      lastSavedMs: 1_700_000_000_000,
      version: 4,
    });
    const back = deserialize(v4)!;
    expect(back.shares).toBe(3n);
    expect(back.achievements).toEqual({}); // additiv ergänzt
    expect(back.clicks).toBe(0n);
  });

  it('verwirft unbekannte Achievement-IDs', () => {
    const back = deserialize('{"achievements":{"first-server":1,"god-mode":1}}')!;
    expect(back.achievements).toEqual({ 'first-server': 1 }); // Fake raus
  });
});

describe('deserialize — v3→v4 Migration (shares)', () => {
  it('lädt einen v3-Save ohne shares verlustfrei (Default 0n)', () => {
    const v3 = JSON.stringify({
      cyclesScaled: '5000',
      totalEarnedScaled: '5000',
      clickPowerScaled: '1000',
      prodRemainder: '0',
      generators: { server: 2 },
      upgrades: { 'server-ssd': 1 },
      lastSavedMs: 1_700_000_000_000,
      version: 3,
    });
    const back = deserialize(v3)!;
    expect(back.upgrades).toEqual({ 'server-ssd': 1 });
    expect(back.shares).toBe(0n); // additiv ergänzt
  });

  it('weist negative/krumme shares ab', () => {
    expect(deserialize('{"shares":"-5"}')!.shares).toBe(0n);
    expect(deserialize('{"shares":"1.5"}')!.shares).toBe(0n);
  });
});

describe('deserialize — upgrades-Härtung (#4)', () => {
  it('verwirft unbekannte Upgrade-IDs (Fake-Upgrade-Injection)', () => {
    const back = deserialize('{"upgrades":{"click-mech-kb":1,"hack-x1000":1}}')!;
    expect(back.upgrades).toEqual({ 'click-mech-kb': 1 }); // Fake-ID raus
  });

  it('verwirft Nicht-Integer- und Null/Negativ-Level', () => {
    const back = deserialize('{"upgrades":{"click-mech-kb":1.5,"click-macro":0,"server-ssd":-1}}')!;
    expect(back.upgrades).toEqual({}); // alle ungültig
  });

  it('deckelt Level auf maxLevel', () => {
    const back = deserialize('{"upgrades":{"click-mech-kb":999}}')!;
    expect(back.upgrades).toEqual({ 'click-mech-kb': 1 }); // maxLevel = 1
  });
});

describe('deserialize — v2→v3 Migration', () => {
  it('lädt einen v2-Save ohne upgrades verlustfrei (Default {})', () => {
    const v2 = JSON.stringify({
      cyclesScaled: '5000',
      totalEarnedScaled: '5000',
      clickPowerScaled: '1000',
      prodRemainder: '0',
      generators: { server: 2 },
      lastSavedMs: 1_700_000_000_000,
      version: 2,
    });
    const back = deserialize(v2)!;
    expect(back.generators).toEqual({ server: 2 });
    expect(back.upgrades).toEqual({}); // additiv ergänzt
  });
});

describe('deserialize — Härtung gegen feindliche Saves (#3/#4/#5)', () => {
  it('verwirft String-Counts (sonst owned+1 == "71" String-Concat)', () => {
    const back = deserialize('{"generators":{"server":"7"}}')!;
    expect(back.generators).toEqual({}); // "7" verworfen, kein String im State
  });

  it('verwirft Float- und negative Counts', () => {
    const back = deserialize('{"generators":{"a":1.5,"b":-5,"c":3}}')!;
    expect(back.generators).toEqual({ c: 3 }); // nur valider Integer bleibt
  });

  it('weist negative bigint-Strings ab (Default statt negativem Guthaben)', () => {
    const back = deserialize('{"cyclesScaled":"-100"}')!;
    expect(back.cyclesScaled).toBe(0n);
  });

  it('weist "1.5" als bigint-Feld ab (kein BigInt-Crash)', () => {
    const back = deserialize('{"cyclesScaled":"1.5"}')!;
    expect(back.cyclesScaled).toBe(0n);
  });

  it('weist unsichere/große Number-Literale ab (lossy-Rundung vermeiden)', () => {
    // Als JSON-Number (nicht String) > MAX_SAFE_INTEGER -> bereits lossy -> Default.
    const back = deserialize('{"cyclesScaled":123456789012345678901}')!;
    expect(back.cyclesScaled).toBe(0n);
  });

  it('weist fraktionale/NaN lastSavedMs ab', () => {
    const back = deserialize('{"lastSavedMs":1.5}')!;
    expect(Number.isInteger(back.lastSavedMs)).toBe(true);
  });
});

describe('deserialize — v1→v2 Migration', () => {
  it('lädt einen v1-Save ohne prodRemainder verlustfrei (Default 0n)', () => {
    const v1 = JSON.stringify({
      v: 1,
      cyclesScaled: '5000',
      totalEarnedScaled: '5000',
      clickPowerScaled: '1000',
      generators: { server: 2 },
      lastSavedMs: 1_700_000_000_000,
      version: 1,
    });
    const back = deserialize(v1)!;
    expect(back.cyclesScaled).toBe(5000n);
    expect(back.generators).toEqual({ server: 2 });
    expect(back.prodRemainder).toBe(0n); // additiv ergänzt, kein Verlust
  });
});

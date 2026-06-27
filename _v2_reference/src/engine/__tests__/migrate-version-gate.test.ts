// Regression: die Generator<->Upgrade-Umlenkung (PR #10) muss VERSIONS-ISOLIERT
// sein. Das Legacy-Flat-Format (Vorgänger-Saves saveVersion 1..FIRST_NATIVE_VERSION-1
// = 1..4) vermischte Generator-Käufe ins `upgrades`-Feld; das native Format
// (>=FIRST_NATIVE_VERSION = 5, incl. v6) hat getrennte generators/upgrades.
// Lief die Umlenkung für ALLE Versionen, ging ein legitimes natives Upgrade mit
// Generator-Twin-ID (server/vm/ssd) beim Laden verloren (Save-Roundtrip-
// Korruption). Codex CRITICAL.
//
// Bump auf ENGINE_VERSION=6 (SplitMix64 Deploy-RNG): das Migration-Gate
// haengt jetzt an FIRST_NATIVE_VERSION (= 5), NICHT mehr an ENGINE_VERSION.
// Ohne diese Trennung wuerde `fromVersion < ENGINE_VERSION = 6` ein natives
// v5-Save (fromVersion=5) als legacyFlat=true klassifizieren und die Umlenkung
// wieder aktivieren — exakt die Korruption, die wir gerade verhindern.
// FIRST_NATIVE_VERSION bleibt FIX = 5 ueber alle kuenftigen Bumps.
import { describe, it, expect } from 'vitest';
import { migrateSavePayload } from '../migrate';
import { GENERATORS, UPGRADES, ENGINE_VERSION, FIRST_NATIVE_VERSION } from '../config';

// Eine ID, die SOWOHL Generator ALS AUCH Upgrade ist (Hybrid-Twin).
const genIds = new Set(GENERATORS.map((g) => g.id));
const hybridId = UPGRADES.map((u) => u.id).find((id) => genIds.has(id));

describe('Migration: v1-Generator-Extraktion ist versions-isoliert', () => {
  it('Voraussetzung: es existiert eine Hybrid-ID (Generator == Upgrade)', () => {
    expect(hybridId).toBeTruthy();
  });

  it('natives Save (ENGINE_VERSION): Upgrade mit Generator-Twin-ID bleibt Upgrade (kein Datenverlust)', () => {
    const id = hybridId!;
    const v6save = { version: ENGINE_VERSION, upgrades: { [id]: 3 }, generators: {} };
    const { data, fromVersion } = migrateSavePayload(v6save);
    expect(fromVersion).toBe(ENGINE_VERSION);
    expect(data.upgrades[id]).toBe(3); // Upgrade erhalten
    expect(data.generators[id] ?? 0).toBe(0); // NICHT in Generatoren umgedeutet
  });

  // KRITISCH: explizit ein natives v5-Save (version: 5) testen. Mit dem alten
  // Gate `fromVersion < ENGINE_VERSION = 6` waere 5 < 6 = true -> legacyFlat ->
  // die Umlenkung haette das Upgrade { [hybridId]: 2 } nach generators
  // verschoben. Das war die Korruption, die PR #10 urspruenglich gefixt hat
  // und die durch den v6-Bump reintroduziert worden waere.
  it('natives v5-Save (version: 5) nach v6-Bump: Upgrade bleibt Upgrade (Gate-Fix Regression)', () => {
    expect(FIRST_NATIVE_VERSION).toBe(5); // Sanity-Check: Konstante wirklich fix
    expect(ENGINE_VERSION).toBeGreaterThan(FIRST_NATIVE_VERSION); // v6-Bump aktiv
    const id = hybridId!;
    const v5save = { version: 5, upgrades: { [id]: 2 }, generators: {} };
    const { data, fromVersion, migrated } = migrateSavePayload(v5save);
    expect(fromVersion).toBe(5);
    expect(migrated).toBe(true); // v5 -> v6 ist ein Migrations-Schritt
    expect(data.upgrades[id]).toBe(2); // Upgrade erhalten (KRITISCH)
    expect(data.generators[id] ?? 0).toBe(0); // NICHT in Generatoren umgedeutet (KRITISCH)
  });

  it('echter v1-Flat-Save: Generator-Kauf im upgrades-Feld wandert weiter nach generators', () => {
    const id = hybridId!;
    // v1: kein version-Feld, flach. Generator-ID im upgrades-Feld = Generator-Kauf.
    const v1save = { cycles: 0, upgrades: { [id]: 4 } };
    const { data, fromVersion } = migrateSavePayload(v1save);
    expect(fromVersion).toBeLessThan(FIRST_NATIVE_VERSION);
    expect(data.generators[id]).toBe(4); // v1-Verhalten erhalten
  });
});

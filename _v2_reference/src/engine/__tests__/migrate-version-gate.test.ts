// Regression: die Generator<->Upgrade-Umlenkung (PR #10) muss VERSIONS-ISOLIERT
// sein. Das Legacy-Flat-Format (Vorgänger-Saves saveVersion 1..4) vermischte
// Generator-Käufe ins `upgrades`-Feld; das native Format (ENGINE_VERSION = 5) hat
// getrennte generators/upgrades. Lief die Umlenkung für ALLE Versionen, ging ein
// legitimes natives Upgrade mit Generator-Twin-ID (server/vm/ssd) beim Laden
// verloren (Save-Roundtrip-Korruption). Codex CRITICAL.
import { describe, it, expect } from 'vitest';
import { migrateSavePayload } from '../migrate';
import { GENERATORS, UPGRADES, ENGINE_VERSION } from '../config';

// Eine ID, die SOWOHL Generator ALS AUCH Upgrade ist (Hybrid-Twin).
const genIds = new Set(GENERATORS.map((g) => g.id));
const hybridId = UPGRADES.map((u) => u.id).find((id) => genIds.has(id));

describe('Migration: v1-Generator-Extraktion ist versions-isoliert', () => {
  it('Voraussetzung: es existiert eine Hybrid-ID (Generator == Upgrade)', () => {
    expect(hybridId).toBeTruthy();
  });

  it('natives Save (ENGINE_VERSION): Upgrade mit Generator-Twin-ID bleibt Upgrade (kein Datenverlust)', () => {
    const id = hybridId!;
    const v5save = { version: ENGINE_VERSION, upgrades: { [id]: 3 }, generators: {} };
    const { data, fromVersion } = migrateSavePayload(v5save);
    expect(fromVersion).toBe(ENGINE_VERSION);
    expect(data.upgrades[id]).toBe(3); // Upgrade erhalten
    expect(data.generators[id] ?? 0).toBe(0); // NICHT in Generatoren umgedeutet
  });

  it('echter v1-Flat-Save: Generator-Kauf im upgrades-Feld wandert weiter nach generators', () => {
    const id = hybridId!;
    // v1: kein version-Feld, flach. Generator-ID im upgrades-Feld = Generator-Kauf.
    const v1save = { cycles: 0, upgrades: { [id]: 4 } };
    const { data, fromVersion } = migrateSavePayload(v1save);
    expect(fromVersion).toBeLessThan(2);
    expect(data.generators[id]).toBe(4); // v1-Verhalten erhalten
  });
});

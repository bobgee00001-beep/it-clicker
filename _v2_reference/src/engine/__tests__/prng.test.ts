// Tests für den deterministischen Counter-basierten PRNG (SplitMix64).
//
// Diese Tests pinnen BIT-IDENTISCHE Vektoren gegen die Vigna-Reference-
// Implementation (https://xorshift.di.unimi.it/splitmix64.c, public domain).
// Wer die Konstanten in prng.ts ändert, ändert diese Erwartungen — und
// PASST NICHT MEHR zum Server-Validator, der dieselben Reference-Werte
// nutzt. Audit-Pfad: jeder Server-Implementierer kann mit den identischen
// 6 Hex-Werten (unten) verifizieren, dass sein Stream bit-identisch ist.
//
// Conformance-Vektoren stammen aus einer unabhaengigen JS-Portierung von
// Vigna's C-Code (manuell uebersetzt + ausgefuehrt). NICHT aus prng.ts
// selbst generiert — sonst waere der Test wertlos (beweist nur interne
// Konsistenz, nicht Standard-Konformitaet).
import { describe, it, expect } from 'vitest';
import { splitmix64, splitmix64Modulo, SPLITMIX_GAMMA } from '../prng';
import { RNG_DEFAULT_SEED } from '../config';

describe('SplitMix64 — Conformance vs. Vigna-Reference (https://xorshift.di.unimi.it/splitmix64.c)', () => {
  // Erste 6 Vektoren: next(seed) = splitmix64(seed + GAMMA) in Vigna-Notation.
  // Wir rufen splitmix64(seed) direkt auf — die Reference-Outputs entsprechen
  // exakt diesem Aufruf (siehe JSDoc in prng.ts).
  //
  // Vigna-Referenz-Werte (unabhaengig verifiziert am 2026-06-26 via JS-Port
  // der Original-C-Routine, NICHT aus prng.ts gelesen):
  //
  //   next(0)   = 0xe220a8397b1dcdaf
  //   next(1)   = 0x910a2dec89025cc1
  //   next(2)   = 0x975835de1c9756ce
  //   next(3)   = 0x1d0b14e4db018fed
  //   next(4)   = 0x6e73e372e2338aca
  //   next(5)   = 0x63033b0ca389c35a
  //   next(100) = 0x23259b94f13cf544
  //
  // Wenn ein Server-Implementierer in Phase 3 denselben Stream baut, muss
  // er exakt diese Outputs produzieren koennen — sonst divergiert die
  // Leaderboard-Validierung.
  it('splitmix64(0) == 0xe220a8397b1dcdaf (Vigna next(0))', () => {
    expect(splitmix64(0n)).toBe(0xe220a8397b1dcdafn);
  });
  it('splitmix64(1) == 0x910a2dec89025cc1 (Vigna next(1))', () => {
    expect(splitmix64(1n)).toBe(0x910a2dec89025cc1n);
  });
  it('splitmix64(2) == 0x975835de1c9756ce (Vigna next(2))', () => {
    expect(splitmix64(2n)).toBe(0x975835de1c9756cen);
  });
  it('splitmix64(3) == 0x1d0b14e4db018fed (Vigna next(3))', () => {
    expect(splitmix64(3n)).toBe(0x1d0b14e4db018fedn);
  });
  it('splitmix64(5) == 0x63033b0ca389c35a (Vigna next(5))', () => {
    expect(splitmix64(5n)).toBe(0x63033b0ca389c35an);
  });
  it('splitmix64(100) == 0x23259b94f13cf544 (Vigna next(100))', () => {
    expect(splitmix64(100n)).toBe(0x23259b94f13cf544n);
  });

  it('GAMMA-Konstante == floor(2^64 / phi) — Vignas Identitaet (Drift-Detektor)', () => {
    // Wenn jemand das versehentlich aendert, kollabiert die Streuung.
    expect(SPLITMIX_GAMMA).toBe(0x9E37_79B9_7F4A_7C15n);
  });
});

describe('SplitMix64 — Counter-Mix für Deploy-Roll (kollisionsfrei)', () => {
  // Conformance: counter*GAMMA + seed ist kollisionsfrei fuer verschiedene
  // seeds (Georg's #2 Feinheit, 2026-06-26). Diese Tests pinnen NICHT
  // spezifische Roll-Werte (die waeren RNG_DEFAULT_SEED-spezifisch und
  // koennten bei einem Server-PIN-Update breaken) — sie pinnen die
  // STRUKTURELLE Eigenschaft (Kollisionsfreiheit, Reproduzierbarkeit).
  it('Counter-Mix: gleicher (seed, counter) liefert immer gleichen Roll (idempotent)', () => {
    const z10 = RNG_DEFAULT_SEED + 10n * SPLITMIX_GAMMA;
    const z10Again = RNG_DEFAULT_SEED + 10n * SPLITMIX_GAMMA;
    expect(z10).toBe(z10Again);
    expect(splitmix64Modulo(z10, 10000n)).toBe(splitmix64Modulo(z10Again, 10000n));
  });

  it('Counter-Mix: counter-basierte Reproduzierbarkeit ueber den ganzen Counter-Bereich', () => {
    // Der ganze Punkt von counter-basiert: kein mutierender rngState. Jede
    // (seed, counter)-Kombi ergibt einen festen Wert. 100 Counter-Werte
    // muessen alle in [0, 10000) liegen.
    for (let c = 0n; c < 100n; c++) {
      const z = RNG_DEFAULT_SEED + c * SPLITMIX_GAMMA;
      const roll = splitmix64Modulo(z, 10000n);
      expect(roll).toBeGreaterThanOrEqual(0n);
      expect(roll).toBeLessThan(10000n);
    }
  });

  it('Kollisionssicherheit: (seed=10,c=5) und (seed=14,c=1) sind UNTERSCHIEDLICH', () => {
    // Georg's #2 Feinheit: naive seed+counter wuerde fuer (10+5) und (14+1)
    // denselben Input produzieren. Mit counter*GAMMA ist die Kollision weg.
    const z_a = 10n + 5n * SPLITMIX_GAMMA;
    const z_b = 14n + 1n * SPLITMIX_GAMMA;
    expect(z_a).not.toBe(z_b);
    expect(splitmix64(z_a)).not.toBe(splitmix64(z_b));
  });

  it('Sanity: naive seed+counter-Addition WUERDE kollidieren (Beweis fuer Fix-Notwendigkeit)', () => {
    // Dokumentation der Bug-Klasse, die der Fix verhindert. Wenn dieser Test
    // irgendwann scheitert, hat JS sein Additions-Verhalten geaendert (unwahr-
    // scheinlich) oder jemand hat die Argumente vertauscht.
    const naive_a = 10n + 5n;
    const naive_b = 14n + 1n;
    expect(naive_a).toBe(naive_b);
  });
});

describe('SplitMix64 — Verteilungs-Sanity (NICHT Conformance — nur Sanity)', () => {
  // Diese Tests sind KEINE Conformance-Tests. Sie verifizieren nur, dass
  // die Implementierung grob uniform verteilt (sonst waere der ganze
  // SplitMix64 zwecklos). Konkrete Bins koennen je nach RNG_DEFAULT_SEED
  // und Counter-Start variieren — bei Server-PIN-Update breaken sie.
  it('10k Counter-Roll-Bps verteilen sich halbwegs uniform (jedes 1000er-Bucket ±10%)', () => {
    const bins = new Array(10).fill(0);
    for (let c = 0n; c < 10000n; c++) {
      const z = RNG_DEFAULT_SEED + c * SPLITMIX_GAMMA;
      const roll = Number(splitmix64Modulo(z, 10000n));
      bins[Math.floor(roll / 1000)]++;
    }
    for (const count of bins) {
      expect(count).toBeGreaterThan(900);
      expect(count).toBeLessThan(1100);
    }
  });
});

describe('splitmix64Modulo — Defensive Guards', () => {
  it('lehnt mod <= 0 ab', () => {
    expect(() => splitmix64Modulo(1n, 0n)).toThrow(RangeError);
    expect(() => splitmix64Modulo(1n, -1n)).toThrow(RangeError);
  });
});
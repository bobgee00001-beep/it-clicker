// Sanitizer-Helpers: pure functions, keine Side-Effects.
// Brücke für Save-Load/Migration: unbekannte/giftige Werte -> wohldefinierter Fallback.

/**
 * Sanitisiert einen Wert zu einer endlichen number.
 * Akzeptiert ausschließlich `typeof v === 'number'` und Number.isFinite.
 * NaN, Infinity, -Infinity, null, undefined, Strings -> fallback.
 */
export function numberOr(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return fallback;
}

/** Sanitisiert einen Wert zu boolean. Nur echte booleans werden akzeptiert. */
export function boolOr(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Sanitisiert einen Wert zu string. Nur echte Strings werden akzeptiert. */
export function stringOr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * Konvertiert einen Wert zu einem nicht-negativen bigint.
 * Akzeptiert:
 *   - String aus reinen Ziffern ("123") -> BigInt
 *   - sicheren nicht-negativen Integer als Number -> BigInt
 * Lehnt ab:
 *   - "1.5", "-5", "", "0xFF", "123abc"
 *   - NaN, Infinity, nicht-safe Integer Numbers
 *   - null, undefined, boolean, Array, Object
 */
export function toNonNegBigInt(v: unknown, fallback: bigint): bigint {
  if (typeof v === 'string' && /^\d+$/.test(v)) {
    try {
      return BigInt(v);
    } catch {
      return fallback;
    }
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 0) return BigInt(Math.round(v));
    return fallback;
  }
  if (typeof v === 'bigint') return v < 0n ? fallback : v;
  return fallback;
}

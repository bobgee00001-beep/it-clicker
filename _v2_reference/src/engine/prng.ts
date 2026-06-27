// SplitMix64 — counter-basierter PRNG für deterministische Deploy-Rolls.
//
// Georg's Spec ([A] finishDeploy-RNG, 2026-06-26):
//   - Counter-basiert, NICHT stateful-LCG
//   - Bit-identisch reproduzierbar (client + späterer Server-Validator)
//   - Statistische Qualität ist NICHT der Property; Determinismus ist.
//
// Algorithmus (Sebastian Vigna, https://xorshift.di.unimi.it/splitmix64.c;
// public domain):
//   z += 0x9E3779B97F4A7C15n
//   z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9n
//   z = (z ^ (z >> 27)) * 0x94D049BB133111EBn
//   return z ^ (z >> 31)
//
// Input: 64-bit bigint. release.ts baut den kanonischen Input als
//   state = rngSeed + deployCounter * SPLITMIX_GAMMA  (mod 2^64)
// und uebergibt ihn hier. Kollisionsfrei zwischen seeds (counter-Streuung
// um SPLITMIX_GAMMA versetzt) und innerhalb eines seeds (counter-Er-
// hoehung um 1 verschiebt Input um SPLITMIX_GAMMA). Cycle-Length: 2^64.
//
// Output: 64-bit bigint. release.ts mappt auf [0, 10000) (Basispunkte) fuer
// den integer Risk-Threshold-Vergleich (`rollBp < riskBp`).
//
// Determinismus-Notiz zu JS bigint:
//   Wir rechnen mod 2^64 via `& MASK_64`. JS `bigint >> n` ist signed
//   right-shift — auf u64-Werten (alle < 2^63 nach wrap-around) ist das
//   identisch mit unsigned right-shift. Daher keine Sonderbehandlung nötig.
export const SPLITMIX_GAMMA = 0x9E37_79B9_7F4A_7C15n;
const SPLITMIX_C1 = 0xBF58_476D_1CE4_E5B9n;
const SPLITMIX_C2 = 0x94D0_49BB_1331_11EBn;
const MASK_64 = (1n << 64n) - 1n;

function u64(x: bigint): bigint {
  return x & MASK_64;
}

export function splitmix64(z: bigint): bigint {
  z = u64(z + SPLITMIX_GAMMA);
  z = u64((z ^ (z >> 30n)) * SPLITMIX_C1);
  z = u64((z ^ (z >> 27n)) * SPLITMIX_C2);
  z = u64(z ^ (z >> 31n));
  return z;
}

// Mappt splitmix64-Output auf [0, mod) als Integer.
// 64-bit-bigint % bigint → bigint. JS: bigint % bigint ist exakt, kein Float.
export function splitmix64Modulo(z: bigint, mod: bigint): bigint {
  if (mod <= 0n) throw new RangeError(`splitmix64Modulo: mod must be positive, got ${mod}`);
  return splitmix64(z) % mod;
}

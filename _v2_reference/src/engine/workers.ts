// Worker-Mathematik: Worker sind Generatoren, deren Rate in Klicks/s statt
// Cycles/s gemessen wird. Jeder Worker-Klick erzeugt die aktuelle effektive
// Klick-Power (inkl. aller Click-Boosts), daher ist ihr CPS-Equivalent
// abhängig von der Click-Power des Spielers.
import { SCALE, type Scaled, type GameState } from './types';

// Worker-IDs: Frequenz ist 1 Klick pro Sekunde geteilt durch Interval-Sekunden.
// v1-Mapping:
//   intern  -> 1 Klick alle 2s
//   junior  -> 1 Klick/s
//   senior  -> 2 Klicks/s
//   staff   -> 4 Klicks/s
const WORKER_INTERVAL_SECONDS: Record<string, number> = {
  intern: 2,
  junior: 1,
  senior: 0.5,
  staff: 0.25,
};

/** Ist die ID ein Worker-Generator? */
export function isWorker(id: string): boolean {
  return id in WORKER_INTERVAL_SECONDS;
}

/** Alle gekauften Worker-Generatoren. */
export function workerGenerators(s: GameState): { id: string; count: number; intervalSeconds: number }[] {
  const out: { id: string; count: number; intervalSeconds: number }[] = [];
  for (const id of Object.keys(WORKER_INTERVAL_SECONDS)) {
    const count = s.generators[id] ?? 0;
    if (count > 0) {
      out.push({ id, count, intervalSeconds: WORKER_INTERVAL_SECONDS[id] });
    }
  }
  return out;
}

/** Clicks/s aller gekauften Worker (Summe, float). */
export function workerClickRatePerSec(s: GameState): number {
  let rate = 0;
  for (const { count, intervalSeconds } of workerGenerators(s)) {
    rate += count / intervalSeconds;
  }
  return rate;
}

/** CPS-Equivalent der Worker: Worker-Clicks/s × effektive Klick-Power.
 *  Der clickPower-Parameter erlaubt es engine.ts, die volle effectiveClickScaled
 *  (inkl. aller Click-Boosts/Multiplikatoren) zu injizieren, ohne eine
 *  Zirkularität zwischen engine.ts und workers.ts zu erzeugen. */
export function workerCpsScaled(s: GameState, clickPower: Scaled): Scaled {
  const clickRate = workerClickRatePerSec(s);
  if (clickRate === 0) return 0n;
  // clickRate ist Clicks/s (float); clickPower ist milli-cycles.
  // Gesamt: (clickRate * SCALE) * clickPower / SCALE = clickRate * clickPower
  // Da clickPower bereits mit SCALE skaliert ist, ist das Ergebnis wieder Scaled.
  const rateNum = BigInt(Math.round(clickRate * Number(SCALE)));
  return (rateNum * clickPower) / SCALE;
}

/** Anzahl Worker-Clicks, die in dtMs fällig werden (diskret). */
export function workerTicksForDt(s: GameState, dtMs: number): number {
  const dtSeconds = dtMs / 1000;
  return Math.floor(workerClickRatePerSec(s) * dtSeconds);
}

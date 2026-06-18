// Display-only Numerik. break_infinity.js lebt AUSSCHLIESSLICH hier — es darf
// nie in die autoritative Engine durchsickern (FP-Divergenz client/server).
import Decimal from 'break_infinity.js';
import { SCALE } from '../engine/types';

const SCALE_NUM = Number(SCALE);

export function scaledToDecimal(scaled: bigint): Decimal {
  const whole = scaled / SCALE;
  const frac = scaled % SCALE;
  return new Decimal(whole.toString()).plus(new Decimal(Number(frac) / SCALE_NUM));
}

const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function formatCycles(scaled: bigint): string {
  const d = scaledToDecimal(scaled);
  if (d.lt(1000)) {
    const n = d.toNumber();
    return Number.isInteger(n) ? n.toString() : n.toFixed(1);
  }
  const exp = Math.floor(d.log10() / 3);
  if (exp > 0 && exp < UNITS.length) {
    const mant = d.div(Decimal.pow(1000, exp));
    return mant.toFixed(2) + UNITS[exp];
  }
  return d.toExponential(2);
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

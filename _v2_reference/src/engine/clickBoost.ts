// Klick-Boosts: additive clickBonus-Upgrades und deren Multiplikatoren.
// Vollständig zustandslos — liest nur State und die zugehörigen Upgrade-Defs.
import { type Scaled, type GameState } from './types';
import { UPGRADES, ACHIEVEMENTS } from './config';

function upgradeLevel(s: GameState, id: string): number {
  return s.upgrades[id] ?? 0;
}

/** Summe aller additiven clickBonus (milli-cycles). */
export function additiveClickPowerScaled(s: GameState): Scaled {
  let add = 0n;
  for (const u of UPGRADES) {
    if (u.target.kind === 'clickAdd') {
      add += BigInt(upgradeLevel(s, u.id)) * u.target.addScaled;
    }
  }
  // Auch Achievements können additive Click-Boni geben (v1-Parität).
  for (const a of ACHIEVEMENTS) {
    if (a.target.kind === 'clickAdd' && (s.achievements[a.id] ?? 0) >= 1) {
      add += a.target.addScaled;
    }
  }
  return add;
}

/** Effektive Klick-Power = (Basis + Additive) × Click-Multiplikatoren. */
export function effectiveClickScaled(s: GameState): Scaled {
  let num = 1n;
  let den = 1n;
  for (const u of UPGRADES) {
    if (u.target.kind === 'click') {
      const level = upgradeLevel(s, u.id);
      for (let i = 0; i < level; i++) {
        num *= u.factorNum;
        den *= u.factorDen;
      }
    }
  }
  for (const a of ACHIEVEMENTS) {
    if (a.target.kind === 'click' && (s.achievements[a.id] ?? 0) >= 1) {
      num *= a.factorNum;
      den *= a.factorDen;
    }
  }
  const baseAndAdd = s.clickPowerScaled + additiveClickPowerScaled(s);
  return (baseAndAdd * num) / den;
}

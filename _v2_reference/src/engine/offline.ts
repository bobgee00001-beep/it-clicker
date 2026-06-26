// Offline-Earnings: pure function, no localStorage/DOM.
// Rechnet passive Produktion über die verstrichene Zeit mit Cap + Penalty.
// Nutzt die gleiche produce()-Logik wie tick() (via engine.ts applyOffline).
import type { GameState } from './types';
import { OFFLINE_CAP_MS, OFFLINE_MIN_MS, OFFLINE_PENALTY } from './config';
import { applyOffline as engineApplyOffline } from './engine';

export type OfflineResult = {
  state: GameState;
  gainedScaled: bigint;
  elapsedMs: number;
  capped: boolean;
};

/**
 * Wendet passive Offline-Earnings auf `s` an.
 *
 * - elapsedMs wird auf OFFLINE_CAP_MS gedeckelt.
 * - Unter OFFLINE_MIN_MS wird sofort returned (gainedScaled = 0n).
 * - Gewinn: engineApplyOffline() akkumuliert die passive Basisrate über elapsedMs
 *   mit Rest-Übertrag (accrue, kein temporaler Faktor, keine Worker/Achievements/
 *   Tickets — Whitelist); danach wird OFFLINE_PENALTY auf den Gewinn angewandt
 *   (nicht auf die Rate, damit Übertrag/Floor-Invarianten erhalten bleiben).
 * - lastSavedMs wird auf `nowMs` gesetzt, lastOnline optional gefüllt.
 */
export function applyOfflineEarnings(s: GameState, nowMs: number): OfflineResult {
  const rawElapsed = Math.trunc(nowMs - s.lastSavedMs);
  const capped = rawElapsed > OFFLINE_CAP_MS;
  const elapsedMs = Math.max(0, Math.min(rawElapsed, OFFLINE_CAP_MS));

  if (elapsedMs < OFFLINE_MIN_MS) {
    return {
      state: s,
      gainedScaled: 0n,
      elapsedMs,
      capped,
    };
  }

  const { state: next, gainedScaled } = engineApplyOffline(s, nowMs);
  // Penalty wird auf den akkumulierten Gewinn angewandt (nicht auf Rate, damit
  // Übertrag- und Floor-Invarianten erhalten bleiben).
  const penalizedGain = (gainedScaled * BigInt(Math.round(OFFLINE_PENALTY * 10000))) / 10000n;
  return {
    state: {
      ...next,
      cyclesScaled: s.cyclesScaled + penalizedGain,
      totalEarnedScaled: s.totalEarnedScaled + penalizedGain,
      lastOnline: nowMs,
    },
    gainedScaled: penalizedGain,
    elapsedMs,
    capped,
  };
}

// Zeitgesteuerte Gates + Tracking-Funktionen für Achievements.
// Pure Functions — Zeit wird als `now` (Date) injectiert, KEIN Date.now() in der Logik.
import type { GameState, SpendEvent } from './types';
import { SCALE } from './types';

const PAGER_DUTY_HOUR_START = 3;
const PAGER_DUTY_HOUR_END = 4; // exklusiv: 03:00–04:00
const MONDAY_MORNING_HOUR_START = 9;
const MONDAY_MORNING_HOUR_END = 10; // exklusiv: 09:00–10:00
const MONDAY_MORNING_WEEKDAY = 1; // Montag
const FAST_TICKET_MS = 2000;
const SPEND_WINDOW_MS = 60_000;

/**
 * PagerDuty 3AM Gate: 03:00–04:00 lokal, max. 1x pro Tag.
 * @param now - Zu testender Zeitpunkt (kein Date.now()).
 */
export function checkPagerDuty(s: GameState, now: Date): GameState {
  const hour = now.getHours();
  const dateKey = dateKeyOf(now);
  if (hour >= PAGER_DUTY_HOUR_START && hour < PAGER_DUTY_HOUR_END) {
    if (s.pagerDutyDate !== dateKey) {
      return { ...s, pagerDutyTriggered: true, pagerDutyDate: dateKey };
    }
  }
  return s;
}

/**
 * Monday Morning Gate: Montag 09:00–10:00. Zählt Klicks in diesem Fenster
 * und setzt sie außerhalb zurück, damit Achievements wie monday_morning
 * korrekt triggern.
 */
export function checkMondayMorning(s: GameState, now: Date): GameState {
  const inWindow =
    now.getDay() === MONDAY_MORNING_WEEKDAY &&
    now.getHours() >= MONDAY_MORNING_HOUR_START &&
    now.getHours() < MONDAY_MORNING_HOUR_END;
  if (inWindow) return s;
  if (s.mondayClicks === 0) return s;
  return { ...s, mondayClicks: 0 };
}

function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Inkrementiert mondayClicks, falls der Klick im Monday-Morning-Fenster fällt.
 * @param now - Zeitpunkt des Klicks.
 */
export function trackMondayClick(s: GameState, now: Date): GameState {
  const inWindow =
    now.getDay() === MONDAY_MORNING_WEEKDAY &&
    now.getHours() >= MONDAY_MORNING_HOUR_START &&
    now.getHours() < MONDAY_MORNING_HOUR_END;
  if (!inWindow) return s;
  return { ...s, mondayClicks: s.mondayClicks + 1 };
}

/**
 * Schnelles Ticket-Tracking: resolveTimeMs < 2s zählt als fastTickets++.
 */
export function trackFastTicket(s: GameState, resolveTimeMs: number): GameState {
  if (resolveTimeMs < FAST_TICKET_MS && resolveTimeMs >= 0) {
    return { ...s, fastTickets: s.fastTickets + 1 };
  }
  return s;
}

/**
 * Ausgaben-Tracking in 60s-Ringbuffer (v1: burn_rate bei 500k in 60s).
 * `amountScaled` wird als Scaled-Wert (Cycles * SCALE) übergeben.
 * @param nowMs - Zeitpunkt des Kaufs in ms.
 */
export function trackSpend(s: GameState, amountScaled: bigint, nowMs: number): GameState {
  if (amountScaled <= 0n) return s;
  const newest: SpendEvent = { time: nowMs, amountScaled };
  const cutoff = nowMs - SPEND_WINDOW_MS;
  const kept = s.spendEvents.filter((e) => e.time > cutoff);
  const window: SpendEvent[] = [...kept, newest];
  const total = window.reduce((sum, e) => sum + e.amountScaled, 0n);
  return {
    ...s,
    spendEvents: window,
    maxSpendIn60s: s.maxSpendIn60s > total ? s.maxSpendIn60s : total,
  };
}

/**
 * Erhöht maxCyclesWithoutUpgrades, wenn keine Upgrades gekauft wurden.
 * Erwartet den aktuellen Cycle-Wert; das Maximum ohne Upgrades wird
 * gespeichert. Nach einem Upgrade-Kauf muss der State resettet werden.
 */
export function trackMaxCyclesNoUpgrades(s: GameState): GameState {
  if (s.upgradesEverBought) return { ...s, maxCyclesWithoutUpgrades: 0n };
  const current = s.cyclesScaled / SCALE;
  if (current > s.maxCyclesWithoutUpgrades / SCALE) {
    return { ...s, maxCyclesWithoutUpgrades: current * SCALE };
  }
  return s;
}

/**
 * Setzt den "keine Upgrades"-Tracker zurück. Wird von buyUpgrade/buyGenerator
 * aufgerufen.
 */
export function resetMaxCyclesNoUpgrades(s: GameState): GameState {
  return { ...s, maxCyclesWithoutUpgrades: 0n };
}

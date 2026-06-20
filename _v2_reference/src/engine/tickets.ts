// Ticket-Lebenszyklus: Spawn, SLA-Decay, Auto-Close, Resolve, Expire, SEV1.
// Pure Functions — KEINE DOM-/Zufalls-Abhängigkeiten ohne injectierte rng().
import { SCALE, type GameState, type Ticket, type TicketType } from './types';
import {
  TICKET_TITLES,
  SLA_SECONDS_BY_TYPE,
  REWARD_CYCLES_BY_TYPE,
  TICKET_SPAWN_WEIGHTS,
  MAX_CONCURRENT_TICKETS,
  SEV1_THRESHOLD_TICKETS,
  SEV1_TIMER_SECONDS,
} from './config';
import { autoCloseSeconds } from './itsm';

/** Default-Zufallszahl-Quelle (0..1). Für Tests wird rng() als Parameter injiziert. */
export function defaultRng(): number {
  return Math.random();
}

/** Gewichteten Ticket-Typen ziehen. Deterministisch gegeben rng(). */
export function rollTicketType(rng: () => number): TicketType {
  const total = TICKET_SPAWN_WEIGHTS.reduce((sum: number, w) => sum + w.weight, 0);
  let r = rng() * total;
  for (const { type, weight } of TICKET_SPAWN_WEIGHTS) {
    r -= weight;
    if (r <= 0) return type;
  }
  return TICKET_SPAWN_WEIGHTS[TICKET_SPAWN_WEIGHTS.length - 1].type;
}

/** Sichere Nummern-Hilfe: float auf ≥0 begrenzen, NaN→0. */
function toNonNeg(n: number): number {
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

let TICKET_ID_COUNTER = 0;

/** Neues Ticket erzeugen. Optional rng für deterministische Tests. */
export function spawnTicket(s: GameState, rng: () => number = defaultRng): GameState {
  if (s.tickets.length >= MAX_CONCURRENT_TICKETS) return s;
  const type = rollTicketType(rng);
  const titles = TICKET_TITLES[type];
  const title = titles[TICKET_ID_COUNTER % titles.length];
  TICKET_ID_COUNTER++;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const ticket: Ticket = {
    id: `t_${TICKET_ID_COUNTER.toString(36)}_${now.toString(36)}`,
    type,
    title,
    sla: SLA_SECONDS_BY_TYPE[type],
    maxSla: SLA_SECONDS_BY_TYPE[type],
    rewardScaled: REWARD_CYCLES_BY_TYPE[type] * SCALE,
    autoCloseTimer: autoCloseSeconds(s, type),
    spawnTime: now,
  };
  return { ...s, tickets: [...s.tickets, ticket], lastTicketSpawn: now };
}

/** Einzelnes Ticket um dtMs vorrücken (SLA-Decay, Auto-Close, Expire). */
function advanceTicket(s: GameState, t: Ticket, dtSeconds: number): { ticket: Ticket | null; expired: boolean } {
  const dt = toNonNeg(dtSeconds);
  if (t.sla > dt) {
    const remaining = t.sla - dt;
    const closedTimer = t.autoCloseTimer > 0 ? Math.max(0, t.autoCloseTimer - dt) : 0;
    if (closedTimer === 0 && t.autoCloseTimer > 0) {
      // Auto-Close ausgelöst: Ticket verschwindet ohne Penalty.
      return { ticket: null, expired: false };
    }
    return { ticket: { ...t, sla: remaining, autoCloseTimer: closedTimer }, expired: false };
  }
  // SLA abgelaufen -> expire
  return { ticket: null, expired: true };
}

/** Tickets vorrücken lassen: SLA-Decay, Auto-Close, Expire. */
export function updateTickets(s: GameState, dtMs: number): GameState {
  const dtSeconds = toNonNeg(dtMs) / 1000;
  let expiredCount = 0;
  const remaining: Ticket[] = [];
  for (const t of s.tickets) {
    const result = advanceTicket(s, t, dtSeconds);
    if (result.ticket) {
      remaining.push(result.ticket);
    } else if (result.expired) {
      expiredCount++;
    }
  }
  if (remaining.length === s.tickets.length && expiredCount === 0) return s;
  const next: GameState = {
    ...s,
    tickets: remaining,
    ticketsExpired: s.ticketsExpired + expiredCount,
  };
  if (expiredCount > 0) {
    return applyExpirePenalty(next, expiredCount);
  }
  return next;
}

/** CPS-Penalty nach Expire: 0.8 für 30s (v1-Wert). */
function applyExpirePenalty(s: GameState, expiredCount: number): GameState {
  const durationSeconds = 30 * Math.max(1, expiredCount);
  return { ...s, cpsPenalty: 0.8, cpsPenaltyTimer: durationSeconds };
}

/** CPS-Penalty-Timer herunterzählen (wird in updateSev1 oder separat getickt). */
export function decayCpsPenalty(s: GameState, dtMs: number): GameState {
  if (s.cpsPenaltyTimer <= 0 || s.cpsPenalty >= 1) return s;
  const dtSeconds = toNonNeg(dtMs) / 1000;
  const nextTimer = Math.max(0, s.cpsPenaltyTimer - dtSeconds);
  if (nextTimer === 0) {
    return { ...s, cpsPenalty: 1, cpsPenaltyTimer: 0 };
  }
  return { ...s, cpsPenaltyTimer: nextTimer };
}

/** Ticket auflösen: +Cycles (Reward × multiplier), Statistik. */
export function resolveTicket(s: GameState, idx: number): GameState {
  if (idx < 0 || idx >= s.tickets.length) return s;
  const t = s.tickets[idx];
  const reward = (t.rewardScaled * BigInt(Math.max(1, Math.trunc(s.multiplier)))) / SCALE;
  const nextTickets = [...s.tickets];
  nextTickets.splice(idx, 1);
  return {
    ...s,
    cyclesScaled: s.cyclesScaled + reward,
    totalEarnedScaled: s.totalEarnedScaled + reward,
    tickets: nextTickets,
    ticketsResolved: s.ticketsResolved + 1,
    lastTicketSpawn: s.lastTicketSpawn,
  };
}

/** Ticket entfernen mit CPS-Penalty (expliziter Expire, falls nötig). */
export function expireTicket(s: GameState, idx: number): GameState {
  if (idx < 0 || idx >= s.tickets.length) return s;
  const nextTickets = [...s.tickets];
  nextTickets.splice(idx, 1);
  const next: GameState = {
    ...s,
    tickets: nextTickets,
    ticketsExpired: s.ticketsExpired + 1,
    lastTicketSpawn: s.lastTicketSpawn,
  };
  return applyExpirePenalty(next, 1);
}

/** SEV1-Kaskade auslösen. */
export function triggerSev1(s: GameState): GameState {
  if (s.sev1Active) return s;
  return { ...s, sev1Active: true, sev1Timer: SEV1_TIMER_SECONDS, sev1Survived: false };
}

/** SEV1-Zustand ticken: Timer-Countdown, Recovery. */
export function updateSev1(s: GameState, dtMs: number): GameState {
  if (!s.sev1Active) return s;
  const dtSeconds = toNonNeg(dtMs) / 1000;
  const nextTimer = Math.max(0, s.sev1Timer - dtSeconds);
  if (nextTimer === 0) {
    // SEV1 überlebt -> Flag setzen; aktive Tickets bleiben, Timer resettet.
    return { ...s, sev1Active: false, sev1Timer: 0, sev1Survived: true };
  }
  return { ...s, sev1Timer: nextTimer };
}

/** Überprüft >10 offene Tickets und löst ggf. SEV1 aus. */
export function checkSev1Threshold(s: GameState): GameState {
  if (s.tickets.length > SEV1_THRESHOLD_TICKETS) {
    return triggerSev1(s);
  }
  return s;
}
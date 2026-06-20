// ITSM-Helper: Auto-Close, SLA-Entfernung und Auto-Ticketing-CPS-Bonus.
// Pure Functions — lesen nur State und Upgrade/Achievement-Defs.
import type { GameState, TicketType } from './types';
import { UPGRADES, ACHIEVEMENTS } from './config';

function upgradeLevel(s: GameState, id: string): number {
  return s.upgrades[id] ?? 0;
}

interface ItsmRule {
  autoCloseSeconds: number;
  noSla: boolean;
  cpsPerTicket?: number;
}

function itsmTargets(): { type: 'p3' | 'p2' | 'p1' | 'all'; rule: ItsmRule }[] {
  const out: { type: 'p3' | 'p2' | 'p1' | 'all'; rule: ItsmRule }[] = [];
  for (const u of UPGRADES) {
    if (u.target.kind === 'itsm' && upgradeLevel(EMPTY_STATE, u.id) >= 0) continue; // Nur Struktur, Level irrelevant hier
    if (u.target.kind === 'itsm') {
      out.push({ type: u.target.itsmType, rule: u.target });
    }
  }
  for (const a of ACHIEVEMENTS) {
    if (a.target.kind === 'itsm') {
      out.push({ type: a.target.itsmType, rule: a.target });
    }
  }
  return out;
}

// Leerer State für reine Definition-Iteration (nur UPGRADES/ACHIEVEMENTS werden gelesen).
const EMPTY_STATE: GameState = {} as unknown as GameState;

function mergeRules(rules: ItsmRule[]): ItsmRule {
  let autoCloseSeconds = 0;
  let noSla = false;
  let cpsPerTicket: number | undefined;
  for (const r of rules) {
    // Kürzeste Auto-Close-Zeit gewinnt (größter Benefit).
    if (r.autoCloseSeconds > 0 && (autoCloseSeconds === 0 || r.autoCloseSeconds < autoCloseSeconds)) {
      autoCloseSeconds = r.autoCloseSeconds;
    }
    noSla = noSla || r.noSla;
    if (r.cpsPerTicket !== undefined) {
      cpsPerTicket = (cpsPerTicket ?? 0) + r.cpsPerTicket;
    }
  }
  return { autoCloseSeconds, noSla, cpsPerTicket };
}

function typeRules(s: GameState, type: TicketType): ItsmRule {
  const matching: ItsmRule[] = [];
  // Upgrades
  for (const u of UPGRADES) {
    if (u.target.kind !== 'itsm') continue;
    if ((s.upgrades[u.id] ?? 0) < 1) continue;
    if (u.target.itsmType !== type && u.target.itsmType !== 'all') continue;
    matching.push(u.target);
  }
  // Achievements
  for (const a of ACHIEVEMENTS) {
    if (a.target.kind !== 'itsm') continue;
    if ((s.achievements[a.id] ?? 0) < 1) continue;
    if (a.target.itsmType !== type && a.target.itsmType !== 'all') continue;
    matching.push(a.target);
  }
  return mergeRules(matching);
}

/** Sekunden bis Auto-Close für Ticket-Typ type (0 = deaktiviert). */
export function autoCloseSeconds(s: GameState, type: TicketType): number {
  return typeRules(s, type).autoCloseSeconds;
}

/** Ist die SLA für diesen Ticket-Typ aufgehoben? */
export function hasNoSla(s: GameState, type: TicketType): boolean {
  return typeRules(s, type).noSla;
}

/** Anzahl aktiver Auto-Ticketing-Quellen. */
export function autoTicketSources(s: GameState): number {
  let count = 0;
  for (const u of UPGRADES) {
    if (u.target.kind === 'itsm' && u.target.cpsPerTicket !== undefined && (s.upgrades[u.id] ?? 0) >= 1) {
      count++;
    }
  }
  for (const a of ACHIEVEMENTS) {
    if (a.target.kind === 'itsm' && a.target.cpsPerTicket !== undefined && (s.achievements[a.id] ?? 0) >= 1) {
      count++;
    }
  }
  return count;
}

/** +1% CPS pro offenem Ticket × Anzahl Auto-Ticket-Quellen. */
export function cpsPerTicketBonus(s: GameState): number {
  const sources = autoTicketSources(s);
  if (sources === 0 || s.tickets.length === 0) return 0;
  return 0.01 * sources * s.tickets.length;
}

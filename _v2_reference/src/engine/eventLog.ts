// EventLog: FIFO-Ring-Puffer + Filter für reine Engine-Events.
// Pure Functions — KEIN DOM.
import { EVENT_LOG_MAX_ENTRIES } from './config';

export type Severity = 'info' | 'warning' | 'critical' | 'success';
export type EventCategory = 'ticket' | 'sev1' | 'deploy' | 'achievement' | 'economy' | 'system';

export interface GameEvent {
  id: string;
  timestamp: number;
  message: string;
  severity: Severity;
  category: EventCategory;
  metadata?: Record<string, unknown>;
}

export interface EventLog {
  entries: GameEvent[];
  maxEntries: number;
  filterCategory: EventCategory | null;
}

let EVENT_COUNTER = 0;

function makeId(): string {
  EVENT_COUNTER++;
  return `e_${EVENT_COUNTER.toString(36)}_${Date.now().toString(36)}`;
}

/** Neues, leeres EventLog anlegen. */
export function createEventLog(maxEntries: number = EVENT_LOG_MAX_ENTRIES): EventLog {
  const safeMax = Number.isFinite(maxEntries) && maxEntries > 0 ? Math.trunc(maxEntries) : EVENT_LOG_MAX_ENTRIES;
  return { entries: [], maxEntries: safeMax, filterCategory: null };
}

/** Anzahl der Einträge im Log. */
export function eventCount(log: EventLog): number {
  return log.entries.length;
}

/** Event hinzufügen. FIFO, wenn > maxEntries. */
export function addEvent(
  log: EventLog,
  message: string,
  severity: Severity = 'info',
  category: EventCategory = 'system',
  metadata?: Record<string, unknown>,
): EventLog {
  const safeMessage = typeof message === 'string' ? message : String(message);
  const entry: GameEvent = {
    id: makeId(),
    timestamp: Date.now(),
    message: safeMessage,
    severity,
    category,
    metadata,
  };
  const nextEntries = [...log.entries, entry];
  if (nextEntries.length > log.maxEntries) {
    nextEntries.shift();
  }
  return { ...log, entries: nextEntries };
}

/** Filter setzen (null = alle anzeigen). */
export function setFilter(log: EventLog, category: EventCategory | null): EventLog {
  return { ...log, filterCategory: category };
}

/** EventLog leeren. */
export function clear(log: EventLog): EventLog {
  return { ...log, entries: [] };
}

/** Gefilterte Einträge liefern (ohne Filter: alle). */
export function filteredEntries(log: EventLog): GameEvent[] {
  if (!log.filterCategory) return log.entries;
  return log.entries.filter((e) => e.category === log.filterCategory);
}

/** Kategorie-Check, um Typos im Engine-Code abzufangen. */
export function isValidCategory(cat: string): cat is EventCategory {
  return ['ticket', 'sev1', 'deploy', 'achievement', 'economy', 'system'].includes(cat);
}

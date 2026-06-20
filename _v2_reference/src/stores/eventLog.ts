import { writable, type Readable } from 'svelte/store';
import { createEventLog, addEvent, setFilter, clear, filteredEntries } from '../engine/eventLog';
import type { EventLog, GameEvent, Severity, EventCategory } from '../engine/eventLog';

export type EventLogStore = Readable<EventLog> & {
  add(message: string, severity?: Severity, category?: EventCategory, metadata?: Record<string, unknown>): void;
  filter(category: EventCategory | null): void;
  clear(): void;
  getFiltered(): GameEvent[];
};

function createEventLogStore(): EventLogStore {
  const { subscribe, set, update } = writable<EventLog>(createEventLog());

  return {
    subscribe,
    add(message: string, severity: Severity = 'info', category: EventCategory = 'system', metadata?: Record<string, unknown>) {
      update((log) => addEvent(log, message, severity, category, metadata));
    },
    filter(category: EventCategory | null) {
      update((log) => setFilter(log, category));
    },
    clear() {
      update((log) => clear(log));
    },
    getFiltered() {
      let current: EventLog = createEventLog();
      const unsub = subscribe((value) => {
        current = value;
      });
      unsub();
      return filteredEntries(current);
    },
  };
}

export const eventLog = createEventLogStore();

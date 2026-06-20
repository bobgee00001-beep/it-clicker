import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  spawnTicket,
  resolveTicket,
  expireTicket,
  tick,
  addEvent,
  createEventLog,
  setFilter,
  clear,
  filteredEntries,
} from '../engine';
import { SLA_SECONDS_BY_TYPE, SEV1_THRESHOLD_TICKETS, SEV1_TIMER_SECONDS } from '../config';
import { updateTickets, rollTicketType, triggerSev1, updateSev1 } from '../tickets';
import { SCALE } from '../types';

function deterministicRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

describe('Stage 3: Tickets + SEV1 + EventLog', () => {
  it('spawnTicket erzeugt 1 Ticket im Array', () => {
    const s = createInitialState(0);
    const after = spawnTicket(s);
    expect(after.tickets.length).toBe(1);
    expect(after.eventLog.entries.length).toBeGreaterThan(s.eventLog.entries.length);
  });

  it('Ticket-Type ist p3|p2|p1', () => {
    const s = createInitialState(0);
    const after = spawnTicket(s, () => 0.5);
    expect(['p3', 'p2', 'p1']).toContain(after.tickets[0].type);
  });

  it('rollTicketType ist deterministisch gegeben rng', () => {
    expect(rollTicketType(() => 0.0)).toBe('p3');
    expect(rollTicketType(() => 0.61)).toBe('p2');
    expect(rollTicketType(() => 0.91)).toBe('p1');
  });

  it('Nach 46s (p3 SLA 45s + 1s): Ticket ist expired ODER cpsPenalty === 0.8', () => {
    const s = createInitialState(0);
    const withTicket = spawnTicket(s, () => 0.0); // p3
    expect(withTicket.tickets[0].type).toBe('p3');
    const after = updateTickets(withTicket, (SLA_SECONDS_BY_TYPE.p3 + 1) * 1000);
    expect(after.tickets.length === 0 || after.cpsPenalty === 0.8).toBe(true);
  });

  it('Mit 11 offenen Tickets: sev1Active === true', () => {
    let s = createInitialState(0);
    for (let i = 0; i < SEV1_THRESHOLD_TICKETS + 1; i++) {
      s = spawnTicket(s);
    }
    expect(s.tickets.length).toBe(SEV1_THRESHOLD_TICKETS + 1);
    expect(s.sev1Active).toBe(true);
    expect(s.sev1Timer).toBe(SEV1_TIMER_SECONDS);
  });

  it('resolveTicket gibt +Cycles und entfernt Ticket', () => {
    const s = createInitialState(0);
    const withTicket = spawnTicket(s, () => 0.0); // p3 = 50 cycles
    const beforeCycles = withTicket.cyclesScaled;
    const after = resolveTicket(withTicket, 0);
    expect(after.tickets.length).toBe(0);
    expect(after.ticketsResolved).toBe(1);
    expect(after.cyclesScaled).toBe(beforeCycles + 50n * SCALE);
  });

  it('expireTicket entfernt Ticket und setzt cpsPenalty=0.8 für 30s', () => {
    const s = createInitialState(0);
    const withTicket = spawnTicket(s, () => 0.0);
    const after = expireTicket(withTicket, 0);
    expect(after.tickets.length).toBe(0);
    expect(after.ticketsExpired).toBe(1);
    expect(after.cpsPenalty).toBe(0.8);
    expect(after.cpsPenaltyTimer).toBe(30);
  });

  it('updateSev1 zählt Timer herunter und recovered bei 0', () => {
    const s = createInitialState(0);
    const sev1 = triggerSev1(s);
    expect(sev1.sev1Active).toBe(true);
    const half = updateSev1(sev1, (SEV1_TIMER_SECONDS / 2) * 1000);
    expect(half.sev1Timer).toBe(SEV1_TIMER_SECONDS / 2);
    expect(half.sev1Active).toBe(true);
    const done = updateSev1(sev1, SEV1_TIMER_SECONDS * 1000 + 1);
    expect(done.sev1Active).toBe(false);
    expect(done.sev1Survived).toBe(true);
  });

  it('tick ruft updateTickets + updateSev1 auf', () => {
    let s = createInitialState(0);
    for (let i = 0; i < 11; i++) {
      s = spawnTicket(s);
    }
    expect(s.sev1Active).toBe(true);
    const after = tick(s, SEV1_TIMER_SECONDS * 1000);
    expect(after.sev1Active).toBe(false);
    expect(after.sev1Survived).toBe(true);
  });

  it('EventLog: addEvent, FIFO, filter, clear', () => {
    let log = createEventLog(3);
    log = addEvent(log, 'a', 'info', 'system');
    log = addEvent(log, 'b', 'warning', 'ticket');
    log = addEvent(log, 'c', 'critical', 'ticket');
    expect(log.entries.length).toBe(3);
    log = addEvent(log, 'd', 'success', 'system');
    expect(log.entries.length).toBe(3);
    expect(log.entries[0].message).toBe('b'); // a wurde verworfen
    log = setFilter(log, 'ticket');
    expect(filteredEntries(log).length).toBe(2);
    log = clear(log);
    expect(filteredEntries(log).length).toBe(0);
  });
});

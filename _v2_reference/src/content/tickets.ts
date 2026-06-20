import type { TicketType } from '../engine/types';

// v1-Ticket-Titel (index.html: "TICKET_TITLES" Block).
export const TICKET_TITLES: Record<TicketType, string[]> = {
  p3: [
    'Printer Offline',
    'Passwort reset',
    'VPN langsam',
    'Mailbox voll',
    'Monitor flackert',
    'Tastatur defekt',
    'Maus hängt',
  ],
  p2: [
    'Database Slow',
    'API Timeout',
    'Build Failed',
    'Deploy Error',
    'Memory Leak',
    'SSL Expired',
    'Backup Failed',
  ],
  p1: [
    'Full Disk',
    'Service Down',
    'Data Loss',
    'Security Breach',
    'Network Outage',
    'DB Corruption',
    'DDoS Attack',
  ],
};

// v1-SLA in Sekunden (spawnTicket Zeile 1724).
export const SLA_SECONDS_BY_TYPE: Record<TicketType, number> = {
  p3: 45,
  p2: 30,
  p1: 15,
};

// v1-Belohnung in Cycles (spawnTicket Zeile 1725).
export const REWARD_CYCLES_BY_TYPE: Record<TicketType, bigint> = {
  p3: 50n,
  p2: 150n,
  p1: 500n,
};

// v1-Spawn-Wahrscheinlichkeiten (spawnTicket Zeile 1715–1719).
export const TICKET_SPAWN_WEIGHTS: { type: TicketType; weight: number }[] = [
  { type: 'p3', weight: 60 },
  { type: 'p2', weight: 30 },
  { type: 'p1', weight: 10 },
];

// v1-Maximal gleichzeitig offene Tickets (spawnTicket Zeile 1713).
export const MAX_CONCURRENT_TICKETS = 15;

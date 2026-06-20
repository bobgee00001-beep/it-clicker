// v1-Achievement-Werte 1:1 auf v2-Fixed-Point übertragen.
// Keine Logik — reine Daten-Exporte; die Evaluierung lebt in engine/achievements.ts.

import { SCALE, type AchievementDef } from '../engine/types';

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_click',
    name: 'Erster Klick',
    flavor: 'Klicke zum ersten Mal',
    condition: { kind: 'clicks', atLeast: 1n },
    target: { kind: 'click' },
    factorNum: 101n,
    factorDen: 100n, // +1% Click Power
  },
  {
    id: 'first-server',
    name: 'First Server',
    flavor: 'Kaufe deinen ersten Server',
    condition: { kind: 'genCount', genId: 'server', atLeast: 1 },
    target: { kind: 'click' },
    factorNum: 2n,
    factorDen: 1n, // ×2 Klick
  },
  {
    id: 'small-farm',
    name: 'Small Farm',
    flavor: '10 Generatoren',
    condition: { kind: 'totalGenerators', atLeast: 10 },
    target: { kind: 'globalProd' },
    factorNum: 105n,
    factorDen: 100n,
  },
  {
    id: 'hundred',
    name: 'Centurion',
    flavor: '100 Cycles gesammelt',
    condition: { kind: 'totalEarned', atLeastScaled: 100n * SCALE },
    target: { kind: 'globalProd' },
    factorNum: 102n,
    factorDen: 100n, // +2% CPS
  },
  {
    id: 'thousand',
    name: 'Kilo',
    flavor: '1.000 Cycles',
    condition: { kind: 'totalEarned', atLeastScaled: 1_000n * SCALE },
    target: { kind: 'globalProd' },
    factorNum: 103n,
    factorDen: 100n, // +3% CPS
  },
  {
    id: 'megacycle',
    name: 'Megacycle',
    flavor: '1.000.000 Cycles',
    condition: { kind: 'totalEarned', atLeastScaled: 1_000_000n * SCALE },
    target: { kind: 'globalProd' },
    factorNum: 105n,
    factorDen: 100n, // +5% CPS
  },
  {
    id: 'maintenance-window',
    name: 'Maintenance Window',
    flavor: '25 Generatoren',
    condition: { kind: 'totalGenerators', atLeast: 25 },
    target: { kind: 'globalProd' },
    factorNum: 110n,
    factorDen: 100n,
  },
  {
    id: 'going-public',
    name: 'Going Public',
    flavor: 'Erste Share',
    condition: { kind: 'shares', atLeast: 1n },
    target: { kind: 'globalProd' },
    factorNum: 110n,
    factorDen: 100n,
  },
  {
    id: 'rsi',
    name: 'RSI',
    flavor: '1.000 Klicks',
    condition: { kind: 'clicks', atLeast: 1_000n },
    target: { kind: 'click' },
    factorNum: 105n,
    factorDen: 100n,
  },
  {
    id: 'million',
    name: 'Mega',
    flavor: '1.000.000 Cycles',
    condition: { kind: 'totalEarned', atLeastScaled: 1_000_000n * SCALE },
    target: { kind: 'globalProd' },
    factorNum: 105n,
    factorDen: 100n, // +5% CPS
  },
  {
    id: 'first_upgrade',
    name: 'Investor',
    flavor: 'Erstes Upgrade gekauft',
    condition: { kind: 'anyUpgradeBought' },
    target: { kind: 'click' },
    factorNum: 103n,
    factorDen: 100n, // -3% Upgrade-Kosten als Click-Bonus-Proxy
  },
  {
    id: 'first_ticket',
    name: 'Support Hero',
    flavor: 'Erstes Ticket gelöst',
    condition: { kind: 'ticketsResolved', atLeast: 1 },
    target: { kind: 'click' },
    factorNum: 105n,
    factorDen: 100n, // +5% Ticket-Rewards via click-target-Proxy
  },
  {
    id: 'first_prestige',
    name: 'IPO!',
    flavor: 'Erstes Prestige',
    condition: { kind: 'shares', atLeast: 1n },
    target: { kind: 'globalProd' },
    factorNum: 110n,
    factorDen: 100n, // +10% Prestige-Punkte (globalProd-Proxy)
  },
  {
    id: 'ten_tickets',
    name: 'Ticket Machine',
    flavor: '10 Tickets gelöst',
    condition: { kind: 'ticketsResolved', atLeast: 10 },
    target: { kind: 'click' },
    factorNum: 105n,
    factorDen: 100n, // +5% Ticket-Speed via click-target-Proxy
  },
  {
    id: 'its_always_dns',
    name: "It's always DNS",
    flavor: 'Lasse ein P1-Ticket autogeschlossen',
    condition: { kind: 'p1AutoClosed', atLeast: 1 },
    target: { kind: 'globalProd' },
    factorNum: 110n,
    factorDen: 100n, // +10% CPS
  },
  {
    id: 'have_you_tried',
    name: 'Turned it off and on',
    flavor: 'Löse 10 Tickets insgesamt',
    condition: { kind: 'ticketsResolved', atLeast: 10 },
    target: { kind: 'click' },
    factorNum: 105n,
    factorDen: 100n, // +5% Ticket-Rewards
  },
  {
    id: 'printer_phone',
    name: 'Printer over phone',
    flavor: 'Löse ein Ticket in unter 2 Sekunden',
    condition: { kind: 'fastTickets', atLeast: 1 },
    target: { kind: 'click' },
    factorNum: 101n,
    factorDen: 100n, // +1% Ticket-Spawn-Speed via click-target-Proxy
  },
  {
    id: 'budget_approved',
    name: 'Budget approved!',
    flavor: 'Prestige 5x',
    condition: { kind: 'prestigeCount', atLeast: 5 },
    target: { kind: 'globalProd' },
    factorNum: 125n,
    factorDen: 100n, // +25% Prestige-Punkte
  },
  {
    id: 'ms_certified',
    name: 'Microsoft Certified',
    flavor: 'Mindestens ein Upgrade in jeder Kategorie',
    condition: { kind: 'allCategoriesMaxed' },
    target: { kind: 'globalProd' },
    factorNum: 115n,
    factorDen: 100n, // +15% CPS
  },
  {
    id: 'monday_morning',
    name: 'Monday Morning Outage',
    flavor: '100 Klicks Montag 09:00-10:00',
    condition: { kind: 'mondayClicks', atLeast: 100 },
    target: { kind: 'globalProd' },
    factorNum: 120n,
    factorDen: 100n, // 2x CPS Montag 5min via globalProd-Proxy
  },
  {
    id: 'coffee_coder',
    name: 'Coffee → Code',
    flavor: '1.000 Klicks in einer Session (ohne Prestige)',
    condition: { kind: 'sessionClicks', atLeast: 1000 },
    target: { kind: 'click' },
    factorNum: 102n,
    factorDen: 100n, // +2% Click Power
  },
  {
    id: 'shadow_it',
    name: 'Shadow IT',
    flavor: 'Erreiche 100 Cycles ohne Upgrade-Kauf',
    condition: { kind: 'maxCyclesNoUpgrades', atLeastScaled: 100n * SCALE },
    target: { kind: 'click' },
    factorNum: 150n,
    factorDen: 100n, // +50 Start-Cycles via click-Proxy
  },
  {
    id: 'zero_day',
    name: 'Zero Day',
    flavor: 'Gleichzeitig 3 P1-Tickets offen',
    condition: { kind: 'maxSimultaneousP1', atLeast: 3 },
    target: { kind: 'click' },
    factorNum: 120n,
    factorDen: 100n, // +20% P1-Rewards via click-Proxy
  },
  {
    id: 'migration_master',
    name: 'Migration Master',
    flavor: '1M Cycles, letzte 100k nur passiv',
    condition: { kind: 'migrationMaster' },
    target: { kind: 'globalProd' },
    factorNum: 120n,
    factorDen: 100n, // +20% Cloud-Einkommen
  },
  {
    id: 'burn_rate',
    name: 'Burn Rate Critical',
    flavor: '500k Cycles in unter 60s ausgeben',
    condition: { kind: 'maxSpendIn60s', atLeastScaled: 500_000n * SCALE },
    target: { kind: 'click' },
    factorNum: 110n,
    factorDen: 100n, // -10% Upgrade-Kosten via click-Proxy
  },
  {
    id: 'golden_cursor',
    name: 'Golden Cursor',
    flavor: '10.000 Klicks insgesamt',
    condition: { kind: 'clicks', atLeast: 10_000n },
    target: { kind: 'click' },
    factorNum: 105n,
    factorDen: 100n, // +5% Click Power
  },
  {
    id: 'pager_duty',
    name: 'PagerDuty 3AM',
    flavor: 'Spiel zwischen 03:00-04:00 geöffnet',
    condition: { kind: 'pagerDutyTriggered' },
    target: { kind: 'globalProd' },
    factorNum: 130n,
    factorDen: 100n, // 3x CPS 10min
  },
  {
    id: 'legacy_code',
    name: 'Legacy Code',
    flavor: 'Prestige mit exakt 1.048.576 Cycles',
    condition: { kind: 'legacyCodeTriggered' },
    target: { kind: 'globalProd' },
    factorNum: 110n,
    factorDen: 100n, // +1 Bonus-Prestige-Punkt via globalProd-Proxy
  },
  {
    id: 'unicorn',
    name: 'Unicorn Startup',
    flavor: '10M Cycles in unter 30 Minuten',
    condition: { kind: 'unicornStartup' },
    target: { kind: 'globalProd' },
    factorNum: 150n,
    factorDen: 100n, // +50% CPS
  },
  {
    id: 'release_manager',
    name: 'Release Manager',
    flavor: 'Führe einen erfolgreichen Deploy durch',
    condition: { kind: 'successfulDeploys', atLeast: 1 },
    target: { kind: 'globalProd' },
    factorNum: 108n,
    factorDen: 100n, // +8% CPS
  },
  {
    id: 'rollback_ready',
    name: 'Rollback Ready',
    flavor: 'Führe einen Rollback durch oder überwache ein Release fehlerfrei',
    condition: { kind: 'rollbackReady' },
    target: { kind: 'globalProd' },
    factorNum: 106n,
    factorDen: 100n, // +6% CPS
  },
  {
    id: 'team_lead',
    name: 'Team Lead',
    flavor: 'Stelle jede Worker-Rolle mindestens einmal ein',
    condition: { kind: 'teamLead', workerIds: ['intern', 'junior', 'senior', 'staff'] },
    target: { kind: 'globalProd' },
    factorNum: 105n,
    factorDen: 100n, // +5% CPS
  },
];

// Release Train: vollständiger Deploy-Lebenszyklus (Build→Test→Staging→Deploy→Observe).
// Pure Functions — KEINE DOM-Abhängigkeiten, KEIN Date.now(). Zeit via dtMs / Parameter.
import type { GameState, DeploymentQuality } from './types';
import {
  RELEASE_STAGES,
  RELEASE_DEPLOY_BONUS_SECONDS,
  BASE_DEPLOY_RISK,
  MAX_DEPLOY_RISK,
} from './config';
import { addEvent } from './eventLog';
import { evaluateAchievements } from './achievements';

/** Voraussetzungen für Deploy-Start prüfen. */
export function canStartDeploy(s: GameState): boolean {
  return s.releaseStatus === 'idle' && !s.sev1Active && s.tickets.length <= 5;
}

/** Release Train starten: Status → building. */
export function startDeploy(s: GameState, nowMs: number = 0): GameState {
  if (!canStartDeploy(s)) {
    const reason = s.sev1Active
      ? 'SEV1 aktiv: Change Freeze.'
      : 'Zu viele offene Tickets: erst Backlog stabilisieren.';
    return {
      ...s,
      releaseMessage: reason,
      eventLog: addEvent(s.eventLog, `Deploy blockiert: ${reason}`, 'warning', 'deploy'),
    };
  }
  return {
    ...s,
    deploysStarted: s.deploysStarted + 1,
    releaseStatus: 'building',
    releaseStageIndex: 0,
    releaseStageTimer: stageDurationSeconds(0),
    releaseMessage: 'Build läuft. Bitte keine Panik-Commits.',
    eventLog: addEvent(s.eventLog, 'Release Train gestartet.', 'info', 'deploy'),
  };
}

/** Dauer der Stage in Sekunden. */
function stageDurationSeconds(stageIndex: number): number {
  const stage = RELEASE_STAGES[stageIndex];
  return stage?.durationSeconds ?? 2.5;
}

/**
 * Deploy-Risiko berechnen.
 * Baseline 0.18 + Ticket-Druck + P1-Incidents - Observability-Credit - Experience-Credit.
 */
export function calculateRisk(s: GameState): number {
  const p1Count = s.tickets.filter((t) => t.type === 'p1').length;
  const ticketRisk = s.tickets.length * 0.04;
  const incidentRisk = p1Count * 0.12;
  const budgetRisk = Math.max(0, 60 - s.errorBudget) * 0.003;
  const observabilityCredit = Math.max(0, s.observabilityScore - 70) * 0.003;
  const experienceCredit = Math.min(0.25, s.successfulDeploys * 0.04 + s.prestige * 0.03 + s.ticketsResolved * 0.001);
  const sev1Risk = s.sev1Active ? 0.9 : 0;
  const risk = BASE_DEPLOY_RISK + ticketRisk + incidentRisk + budgetRisk + sev1Risk - observabilityCredit - experienceCredit;
  return Math.max(0.05, Math.min(MAX_DEPLOY_RISK + 0.001, risk));
}

function stageIdToStatus(stageId: string): GameState['releaseStatus'] {
  if (stageId === 'deploy') return 'deploying';
  if (stageId === 'build') return 'building';
  if (stageId === 'test') return 'testing';
  if (stageId === 'security') return 'security';
  return 'idle';
}

const ACTIVE_RELEASE_STATUSES: readonly GameState['releaseStatus'][] = ['building', 'testing', 'security', 'deploying'];

/**
 * Release Train über dtMs vorrücken lassen.
 * - Verringert den aktiven Bonus-Timer.
 * - Verringert Stage-Timer; bei Ablauf nächste Stage oder finishDeploy.
 */
export function updateReleaseTrain(s: GameState, dtMs: number, successChance?: () => number): GameState {
  if (dtMs <= 0) return s;
  let state = updateDeployBonusTimer(s, dtMs);
  if (!ACTIVE_RELEASE_STATUSES.includes(state.releaseStatus)) {
    return state;
  }
  const dtSeconds = dtMs / 1000;
  let remaining = dtSeconds;
  let stageIndex = state.releaseStageIndex;
  let stageTimer = state.releaseStageTimer;
  let status: GameState['releaseStatus'] = state.releaseStatus;
  let message = state.releaseMessage;

  // Aktuelle Stage abbauen; überlaufende Zeit in die nächste(n) Stages tragen.
  const consumeCurrent = Math.min(stageTimer, remaining);
  stageTimer -= consumeCurrent;
  remaining -= consumeCurrent;

  const labels: Record<string, string> = {
    testing: 'Tests laufen.',
    security: 'Security Review läuft.',
    deploying: 'Deploy wird vorbereitet.',
  };

  while (stageTimer < 1e-9 && stageIndex < RELEASE_STAGES.length - 1) {
    stageIndex++;
    const nextStage = RELEASE_STAGES[stageIndex];
    status = stageIdToStatus(nextStage.id);
    const duration = stageDurationSeconds(stageIndex);
    message = labels[status] ?? 'Release läuft.';
    const consumeNext = Math.min(duration, remaining);
    stageTimer = duration - consumeNext;
    remaining -= consumeNext;
  }

  if (stageTimer < 1e-9 && stageIndex >= RELEASE_STAGES.length - 1) {
    // Deploy fertig — Ergebnis bestimmen.
    state = finishDeploy({ ...state, releaseStageIndex: stageIndex, releaseStageTimer: 0, releaseMessage: message }, successChance);
    return state;
  }

  // Wenn keine echte Änderung vorliegt, vermeide State-Klon.
  if (
    stageIndex === state.releaseStageIndex &&
    status === state.releaseStatus &&
    Math.abs(stageTimer - state.releaseStageTimer) <= 1e-9 &&
    message === state.releaseMessage
  ) {
    return { ...state, releaseStageTimer: stageTimer };
  }
  return { ...state, releaseStageIndex: stageIndex, releaseStatus: status, releaseStageTimer: stageTimer, releaseMessage: message };
}

function updateDeployBonusTimer(s: GameState, dtMs: number): GameState {
  if (s.releaseDeployBonusTimer <= 0) {
    // Normalisierung: ein 'success'-State ohne laufenden Bonus-Timer (z.B. aus
    // einem geladenen Save mit timer=0) bliebe sonst für immer in 'success' und
    // blockiert canStartDeploy() dauerhaft. Terminal-State sauber auf 'idle'
    // ziehen (inkl. Multiplier auf 1, damit der Save-State konsistent ist).
    if (s.releaseStatus === 'success') {
      return {
        ...s,
        releaseStatus: 'idle',
        releaseStageIndex: -1,
        releaseStageTimer: 0,
        releaseDeployBonusTimer: 0,
        releaseDeployBonusMultiplier: 1,
        releaseMessage: 'Change Window bereit.',
      };
    }
    return s;
  }
  const next = Math.max(0, s.releaseDeployBonusTimer - dtMs / 1000);
  if (next > 0) return { ...s, releaseDeployBonusTimer: next };
  // next === 0: Bonus-Fenster vorbei -> Release-Zyklus IMMER schließen
  // (status unabhängig vom Multiplier, sonst Soft-Lock bis zum nächsten Tick).
  // Event/Reset nur wenn der Bonus tatsächlich aktiv war.
  const wasActive = s.releaseDeployBonusMultiplier !== 1;
  return {
    ...s,
    releaseDeployBonusTimer: 0,
    releaseDeployBonusMultiplier: 1,
    releaseStatus: s.releaseStatus === 'success' ? 'idle' : s.releaseStatus,
    releaseStageIndex: s.releaseStatus === 'success' ? -1 : s.releaseStageIndex,
    releaseMessage: s.releaseStatus === 'success' ? 'Change Window bereit.' : s.releaseMessage,
    eventLog: wasActive ? addEvent(s.eventLog, 'Release-Bonus ausgelaufen.', 'info', 'deploy') : s.eventLog,
  };
}

/**
 * Deploy abschließen: Erfolg oder Fehler per Zufall gegeben Risiko.
 * @param successChance - Optional rng (0..1); bei undefined IMMER Erfolg (deterministische Tests).
 */
export function finishDeploy(s: GameState, successChance?: () => number): GameState {
  const risk = calculateRisk(s);
  const roll = successChance ? successChance() : 1; // ohne rng immer Erfolg (deterministische Tests)
  const failed = roll < risk;

  if (failed) {
    const next: GameState = {
      ...s,
      failedDeploys: s.failedDeploys + 1,
      releaseStatus: 'failed',
      releaseStageIndex: RELEASE_STAGES.length - 1,
      releaseMessage: 'Deploy fehlgeschlagen: Incident erzeugt, Rollback bereit.',
      activeIncidents: s.activeIncidents + 1,
      rollbackAvailable: true,
      errorBudget: Math.max(0, s.errorBudget - 24),
      errorRate: Math.min(9.99, s.errorRate + 2.4),
      uptime: Math.max(95, s.uptime - 0.35),
      observabilityScore: Math.max(25, s.observabilityScore - 18),
      lastDeploymentQuality: 'failed',
      observabilityMessage: 'P1 nach Deploy: Rollback empfohlen.',
      lastReleaseEvidence: `Failed deploy #${s.deploysStarted} - ${s.lastDeployAt ?? 0}`,
      eventLog: addEvent(s.eventLog, 'Deploy fehlgeschlagen: P1 eröffnet.', 'critical', 'deploy'),
    };
    return addFailedDeployP1(next);
  }

  const nowMs = s.lastDeployAt ?? 0;
  const finished: GameState = {
    ...s,
    successfulDeploys: s.successfulDeploys + 1,
    lastDeployAt: nowMs,
    releaseStatus: 'success',
    releaseStageIndex: RELEASE_STAGES.length,
    releaseDeployBonusTimer: RELEASE_DEPLOY_BONUS_SECONDS,
    releaseDeployBonusMultiplier: 1.5, // v2 plan: CPS × 1.5
    monitoringTimer: 60,
    errorBudget: Math.min(100, s.errorBudget + 8),
    errorRate: Math.max(0.01, s.errorRate - 0.08),
    uptime: Math.min(99.99, s.uptime + 0.03),
    observabilityScore: Math.min(100, s.observabilityScore + 7),
    rollbackAvailable: false,
    lastDeploymentQuality: 'clean',
    lastReleaseEvidence: `Successful deploy #${s.successfulDeploys + 1} - ${nowMs}`,
    observabilityMessage: 'Post-Deploy-Monitoring läuft.',
    releaseMessage: 'Production stabil: +50% CPS für 120 Sekunden.',
    cyclesScaled: s.cyclesScaled + BigInt(Math.trunc(250 * s.multiplier)) * 1000n,
    totalEarnedScaled: s.totalEarnedScaled + BigInt(Math.trunc(250 * s.multiplier)) * 1000n,
    eventLog: addEvent(s.eventLog, 'Deploy erfolgreich: Release-Bonus aktiv!', 'success', 'deploy'),
  };
  return evaluateAchievements(finished);
}

/** Fügt nach fehlgeschlagenem Deploy ein P1-Ticket hinzu (nur Engine-Shape, kein DOM). */
function addFailedDeployP1(s: GameState): GameState {
  return {
    ...s,
    tickets: [
      ...s.tickets,
      {
        id: `failed-deploy-${s.deploysStarted}-${s.lastDeployAt ?? 0}`,
        type: 'p1',
        title: 'Failed deployment rollback',
        sla: 20,
        maxSla: 20,
        rewardScaled: 500n * 1000n,
        autoCloseTimer: 0,
        spawnTime: 0,
      },
    ],
  };
}

/** Rollback-Bedingung prüfen. */
export function canRollback(s: GameState): boolean {
  return s.rollbackAvailable || s.activeIncidents > 0 || s.errorRate >= 1.5 || s.errorBudget < 45;
}

/**
 * Rollback durchführen. Revertiert Release-Status und zieht Cycles-Strafe ab.
 * @returns neuer State
 */
export function performRollback(s: GameState): GameState {
  if (!canRollback(s)) {
    return {
      ...s,
      observabilityMessage: 'Rollback nicht nötig: Systeme stabil.',
      eventLog: addEvent(s.eventLog, 'Rollback nicht nötig: Systeme stabil.', 'warning', 'deploy'),
    };
  }
  const rollbackCostScaled = BigInt(Math.trunc(Math.min(Number(s.cyclesScaled / 1000n), 150 * s.multiplier + s.activeIncidents * 100)));
  const nextCycles = s.cyclesScaled > rollbackCostScaled * 1000n ? s.cyclesScaled - rollbackCostScaled * 1000n : 0n;
  const next: GameState = {
    ...s,
    cyclesScaled: nextCycles,
    rollbacksPerformed: s.rollbacksPerformed + 1,
    lastRollbackAt: s.lastRollbackAt ?? 0,
    activeIncidents: Math.max(0, s.activeIncidents - 1),
    errorBudget: Math.min(100, s.errorBudget + 28),
    errorRate: Math.max(0.05, s.errorRate * 0.35),
    uptime: Math.min(99.99, s.uptime + 0.25),
    observabilityScore: Math.min(100, s.observabilityScore + 18),
    rollbackAvailable: false,
    monitoringTimer: 0,
    // Release-Zyklus nach Rollback schließen — sonst bleibt releaseStatus auf
    // 'failed'/'deploying' und canStartDeploy() ist dauerhaft false (Soft-Lock).
    releaseStatus: 'idle',
    releaseStageIndex: -1,
    releaseStageTimer: 0,
    releaseMessage: 'Rollback abgeschlossen: Change Window bereit.',
    releaseDeployBonusTimer: 0,
    releaseDeployBonusMultiplier: 1,
    lastDeploymentQuality: 'rolled back',
    lastReleaseEvidence: `Rollback #${s.rollbacksPerformed + 1} - ${s.lastRollbackAt ?? 0}`,
    observabilityMessage: `Rollback abgeschlossen. Kosten: ${rollbackCostScaled} Cycles.`,
    eventLog: addEvent(s.eventLog, 'Rollback abgeschlossen: Incident-Druck sinkt.', 'success', 'deploy'),
  };
  // P1-Ticket „Failed deployment rollback“ entfernen, falls vorhanden.
  const idx = next.tickets.findIndex((t) => t.title.toLowerCase().includes('deployment'));
  if (idx >= 0) {
    const cleanedTickets = [...next.tickets];
    cleanedTickets.splice(idx, 1);
    return { ...next, tickets: cleanedTickets };
  }
  return next;
}

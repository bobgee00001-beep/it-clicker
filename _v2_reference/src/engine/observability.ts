// Observability: Score-Decay, Uptime-Decay, Error-Rate, Deployment-Quality.
// Pure Functions — KEINE DOM-Abhängigkeiten, KEIN Date.now(). Zeit via dtMs.
import type { GameState, DeploymentQuality } from './types';
import { CLEAN_WINDOWS_FOR_QUALITY } from './config';
import { addEvent } from './eventLog';

/** Aktuelle Uptime als Prozentzahl (0–100). */
export function calculateUptime(s: GameState): number {
  return Math.max(95, Math.min(99.99, s.uptime));
}

/** Aktuelle Fehlerrate als Prozentzahl. */
export function calculateErrorRate(s: GameState): number {
  return Math.max(0.01, Math.min(9.99, s.errorRate));
}

/**
 * Qualität der letzten Deployments ableiten.
 * - 'good': clean windows ≥ 3, keine offenen Incidents, Score ≥ 75.
 * - 'degraded': clean windows < 3, Score ≥ 50, Budget ≥ 45.
 * - 'bad': Score < 50, Budget < 45, aktive Incidents oder letzte Quality = 'failed'/'rolled back'.
 */
export function deploymentQuality(s: GameState): DeploymentQuality {
  if (s.lastDeploymentQuality === 'failed' || s.lastDeploymentQuality === 'rolled back') {
    return 'bad';
  }
  if (s.cleanMonitoringWindows >= CLEAN_WINDOWS_FOR_QUALITY && s.activeIncidents === 0 && s.observabilityScore >= 75) {
    return 'clean';
  }
  if (s.observabilityScore >= 50 && s.errorBudget >= 45 && s.activeIncidents === 0) {
    return 'degraded';
  }
  return 'bad';
}

/**
 * Observability über dtMs aktualisieren.
 * - Decay von Score/Uptime/Error-Budget abhängig von Ticket-Druck + Incidents.
 * - Monitoring-Fenster nach erfolgreichem Deploy auswerten.
 */
export function updateObservability(s: GameState, dtMs: number): GameState {
  if (dtMs <= 0) return s;
  const dtSeconds = dtMs / 1000;
  const p1Count = s.tickets.filter((t) => t.type === 'p1').length;
  const backlogPressure = Math.max(0, s.tickets.length - 5) * dtSeconds * 0.02;
  const incidentPressure = p1Count * dtSeconds * 0.04 + s.activeIncidents * dtSeconds * 0.05 + backlogPressure;

  let errorBudget = s.errorBudget;
  let errorRate = s.errorRate;
  let uptime = s.uptime;
  let observabilityScore = s.observabilityScore;

  if (incidentPressure > 0) {
    errorBudget = Math.max(0, errorBudget - incidentPressure);
    errorRate = Math.min(9.99, errorRate + incidentPressure * 0.08);
    uptime = Math.max(95, uptime - incidentPressure * 0.01);
    observabilityScore = Math.max(20, observabilityScore - incidentPressure * 0.25);
  } else {
    errorBudget = Math.min(100, errorBudget + dtSeconds * 0.015);
    errorRate = Math.max(0.01, errorRate - dtSeconds * 0.003);
    uptime = Math.min(99.99, uptime + dtSeconds * 0.001);
    observabilityScore = Math.min(100, observabilityScore + dtSeconds * 0.02);
  }

  let state: GameState = {
    ...s,
    errorBudget,
    errorRate,
    uptime,
    observabilityScore,
  };

  if (state.monitoringTimer > 0) {
    const nextMonitoringTimer = Math.max(0, state.monitoringTimer - dtSeconds);
    let rollbackAvailable = state.rollbackAvailable;
    let activeIncidents = state.activeIncidents;
    let lastDeploymentQuality = state.lastDeploymentQuality;
    let observabilityMessage = state.observabilityMessage;
    let cleanMonitoringWindows = state.cleanMonitoringWindows;

    if (p1Count > 0 || state.errorRate >= 1.5 || state.errorBudget < 50) {
      rollbackAvailable = true;
      activeIncidents = Math.max(activeIncidents, 1);
      lastDeploymentQuality = 'degraded';
      observabilityMessage = 'Monitoring meldet Regression: Rollback prüfen.';
    }

    if (nextMonitoringTimer === 0) {
      if (!rollbackAvailable && activeIncidents === 0 && state.errorBudget >= 70) {
        cleanMonitoringWindows = state.cleanMonitoringWindows + 1;
        lastDeploymentQuality = 'clean';
        observabilityMessage = 'Monitoring-Fenster sauber abgeschlossen.';
      }
    }

    state = {
      ...state,
      monitoringTimer: nextMonitoringTimer,
      rollbackAvailable,
      activeIncidents,
      lastDeploymentQuality,
      observabilityMessage,
      cleanMonitoringWindows,
      eventLog:
        nextMonitoringTimer === 0 && cleanMonitoringWindows > state.cleanMonitoringWindows
          ? addEvent(state.eventLog, 'Monitoring-Fenster sauber abgeschlossen.', 'success', 'deploy')
          : state.eventLog,
    };
  }

  return state;
}

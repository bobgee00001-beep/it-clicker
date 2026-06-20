<script lang="ts">
  interface Props {
    score: number;
    uptime: number;
    errorRate: number;
    errorBudget: number;
    activeIncidents: number;
    quality: string;
    cleanWindows: number;
    rollbackAvailable: boolean;
    onrollback: () => void;
    'data-testid'?: string;
  }

  let {
    score,
    uptime,
    errorRate,
    errorBudget,
    activeIncidents,
    quality,
    cleanWindows,
    rollbackAvailable,
    onrollback,
    'data-testid': dataTestId,
  }: Props = $props();
</script>

<section class="observability-panel" aria-label="Observability" data-testid={dataTestId}>
  <div class="score-row">
    <span class="score-label">Observability Score</span>
    <span class="score-value" class:bad={score < 50} class:warn={score >= 50 && score < 75}>{score.toFixed(1)}</span>
  </div>
  <div class="bar">
    <span class="bar-fill" style="width: {Math.max(0, Math.min(100, score))}%"></span>
  </div>

  <div class="metrics">
    <div class="metric">
      <span class="label">Uptime</span>
      <span class="value">{uptime.toFixed(2)}%</span>
    </div>
    <div class="metric">
      <span class="label">Error Rate</span>
      <span class="value">{errorRate.toFixed(2)}%</span>
    </div>
    <div class="metric">
      <span class="label">Error Budget</span>
      <span class="value">{errorBudget.toFixed(1)}</span>
    </div>
    <div class="metric">
      <span class="label">Incidents</span>
      <span class="value">{activeIncidents}</span>
    </div>
  </div>

  <div class="quality-row">
    <span class="label">Deployment Quality</span>
    <span class="quality">{quality}</span>
    <span class="windows">Clean windows: {cleanWindows}</span>
  </div>

  {#if rollbackAvailable}
    <button type="button" class="rollback-btn" aria-label="Rollback ausführen" onclick={onrollback}>
      rollback
    </button>
  {/if}
</section>

<style>
  .observability-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .score-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .score-label {
    color: var(--dim);
    font-size: 12px;
  }
  .score-value {
    color: var(--green);
    font-weight: 600;
    font-size: 14px;
  }
  .score-value.warn {
    color: var(--amb);
  }
  .score-value.bad {
    color: #e25b4a;
  }
  .bar {
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .bar-fill {
    display: block;
    height: 100%;
    background: var(--green);
    transition: width 0.2s ease;
  }
  .metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .metric {
    display: flex;
    justify-content: space-between;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 5px 8px;
    font-size: 12px;
  }
  .label {
    color: var(--dim);
  }
  .value {
    color: var(--muted);
  }
  .quality-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
  }
  .quality {
    color: var(--amb);
  }
  .windows {
    color: var(--muted);
    font-size: 11px;
  }
  .rollback-btn {
    background: #1a0f0f;
    border: 1px solid #8a2a2a;
    border-radius: 6px;
    color: #e25b4a;
    padding: 7px 12px;
    font-size: 13px;
  }
  .rollback-btn:hover {
    filter: brightness(1.15);
  }
  .rollback-btn:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
</style>

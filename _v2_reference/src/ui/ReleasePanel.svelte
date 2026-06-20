<script lang="ts">
  import type { ReleaseStatus } from '../engine/types';

  interface Props {
    status: ReleaseStatus;
    stageName: string;
    stageTimer: number;
    risk: number;
    bonusMultiplier: number;
    message: string;
    canStart: boolean;
    canRollback: boolean;
    onstart: () => void;
    onrollback: () => void;
    'data-testid'?: string;
  }

  let {
    status,
    stageName,
    stageTimer,
    risk,
    bonusMultiplier,
    message,
    canStart,
    canRollback,
    onstart,
    onrollback,
    'data-testid': dataTestId,
  }: Props = $props();

  const statusLabel: Record<ReleaseStatus, string> = {
    idle: 'Bereit',
    building: 'Build',
    testing: 'Test',
    security: 'Security',
    deploying: 'Deploy',
    observing: 'Observe',
    success: 'Erfolg',
    failed: 'Fehlschlag',
  };
</script>

<section class="release-panel" aria-label="Release Train" data-testid={dataTestId}>
  <div class="status-row">
    <span class="status-badge" class:active={status !== 'idle'&&status !== 'success'&&status !== 'failed'}>
      {statusLabel[status] ?? status}
    </span>
    <span class="stage">{stageName} {stageTimer.toFixed(1)}s</span>
  </div>

  <div class="metrics">
    <div class="metric">
      <span class="label">Risiko</span>
      <span class="value risk" style="color: hsl({120 - risk * 120}, 70%, 60%)">{(risk * 100).toFixed(1)}%</span>
    </div>
    <div class="metric">
      <span class="label">CPS Bonus</span>
      <span class="value bonus">×{bonusMultiplier.toFixed(2)}</span>
    </div>
  </div>

  <p class="message">{message}</p>

  <div class="actions">
    <button
      type="button"
      class="deploy-btn"
      disabled={!canStart}
      aria-label="Deploy starten"
      onclick={onstart}
    >
      git push --tags
    </button>
    {#if canRollback}
      <button
        type="button"
        class="rollback-btn"
        aria-label="Rollback ausführen"
        onclick={onrollback}
      >
        rollback
      </button>
    {/if}
  </div>
</section>

<style>
  .release-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .status-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .status-badge {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--muted);
    font-size: 11px;
    padding: 3px 7px;
  }
  .status-badge.active {
    background: #10210f;
    border-color: var(--green-dim);
    color: var(--green);
  }
  .stage {
    color: var(--dim);
    font-size: 12px;
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
  }
  .label {
    color: var(--dim);
    font-size: 11px;
  }
  .value {
    font-size: 12px;
  }
  .bonus {
    color: var(--amb);
  }
  .message {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    min-height: 18px;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .deploy-btn {
    flex: 1;
    background: #1b150a;
    border: 1px solid #7a5a1e;
    border-radius: 6px;
    color: #e6c06a;
    padding: 8px 12px;
    font-size: 13px;
  }
  .deploy-btn:hover:not(:disabled) {
    filter: brightness(1.15);
  }
  .deploy-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .rollback-btn {
    background: #1a0f0f;
    border: 1px solid #8a2a2a;
    border-radius: 6px;
    color: #e25b4a;
    padding: 8px 12px;
    font-size: 13px;
  }
  .rollback-btn:hover {
    filter: brightness(1.15);
  }
  .deploy-btn:focus-visible,
  .rollback-btn:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
</style>

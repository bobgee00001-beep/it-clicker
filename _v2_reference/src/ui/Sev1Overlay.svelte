<script lang="ts">
  interface Props {
    active: boolean;
    timer: number;
    'data-testid'?: string;
  }

  let { active, timer, 'data-testid': dataTestId }: Props = $props();
</script>

{#if active}
  <div class="sev1-overlay" role="alertdialog" aria-live="assertive" aria-labelledby="sev1-title" data-testid={dataTestId}>
    <div class="card">
      <h2 id="sev1-title">🚨 SEV1 INCIDENT 🚨</h2>
      <p class="subtitle">Zu viele offene Tickets — alles steht still.</p>
      <div class="timer">
        <span class="label">Recovery in</span>
        <span class="value">{timer.toFixed(1)}s</span>
      </div>
      <p class="hint">Löse Tickets, um die Kaskade zu stoppen.</p>
    </div>
  </div>
{/if}

<style>
  .sev1-overlay {
    position: fixed;
    inset: 0;
    background: rgba(60, 10, 10, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    animation: pulse 1.2s ease-in-out infinite;
  }
  .card {
    text-align: center;
    border: 2px solid #e25b4a;
    border-radius: 12px;
    background: #1a0f0f;
    padding: 30px;
    max-width: 400px;
  }
  h2 {
    color: #e25b4a;
    margin: 0 0 10px;
    font-size: 24px;
  }
  .subtitle {
    color: #f5b0a8;
    margin: 0 0 18px;
    font-size: 14px;
  }
  .timer {
    display: flex;
    justify-content: center;
    gap: 8px;
    font-size: 18px;
    margin-bottom: 10px;
  }
  .label {
    color: #f5b0a8;
  }
  .value {
    color: #ffcf44;
    font-weight: 700;
  }
  .hint {
    color: var(--dim);
    font-size: 12px;
    margin: 0;
  }
  @keyframes pulse {
    0%, 100% { background-color: rgba(60, 10, 10, 0.92); }
    50% { background-color: rgba(90, 15, 15, 0.96); }
  }
</style>

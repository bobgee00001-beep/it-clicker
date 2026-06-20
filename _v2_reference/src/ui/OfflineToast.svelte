<script lang="ts">
  import { formatDuration } from '../lib/format';

  interface Props {
    elapsedMs: number;
    gainedScaled: bigint;
    ondismiss: () => void;
    'data-testid'?: string;
  }

  let { elapsedMs, gainedScaled, ondismiss, 'data-testid': dataTestId }: Props = $props();
</script>

<div class="offline-toast" role="status" aria-live="polite" data-testid={dataTestId}>
  <span class="text">
    Willkommen zurück! Du warst {formatDuration(elapsedMs)} offline.
    <strong>+{gainedScaled.toString()} cycles</strong> eingeheimst.
  </span>
  <button type="button" class="dismiss" aria-label="Offline Meldung schließen" onclick={ondismiss}>
    ×
  </button>
</div>

<style>
  .offline-toast {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    background: #0e1a12;
    border: 1px solid var(--border);
    border-bottom: 0;
    padding: 8px 13px;
    font-size: 12px;
  }
  .text {
    color: var(--muted);
  }
  .text strong {
    color: var(--green);
  }
  .dismiss {
    background: none;
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--muted);
    padding: 2px 8px;
    font-size: 11px;
  }
  .dismiss:hover {
    color: var(--text);
    border-color: var(--green-dim);
  }
  .dismiss:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
</style>

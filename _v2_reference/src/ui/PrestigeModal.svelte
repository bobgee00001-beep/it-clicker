<script lang="ts">
  import { formatCycles } from '../lib/format';

  interface Props {
    open: boolean;
    oldPoints: number;
    newPoints: number;
    multiplier: number;
    canPrestige: boolean;
    onconfirm: () => void;
    oncancel: () => void;
    'data-testid'?: string;
  }

  let { open, oldPoints, newPoints, multiplier, canPrestige, onconfirm, oncancel, 'data-testid': dataTestId }: Props = $props();
</script>

{#if open}
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="prestige-title" data-testid={dataTestId}>
    <div class="modal">
      <h2 id="prestige-title">🚀 IPO / Prestige</h2>
      <div class="body">
        <p>
          Veröffentliche eine neue Version und sammle ★ Stars.
          Alle Generatoren, Upgrades und Cycles werden zurückgesetzt.
        </p>
        <div class="preview">
          <span class="label">Aktuelle Sterne:</span>
          <span class="value">{oldPoints}</span>
        </div>
        <div class="preview">
          <span class="label">Neue Sterne:</span>
          <span class="value">+{newPoints - oldPoints}</span>
        </div>
        <div class="preview">
          <span class="label">Neuer Multiplikator:</span>
          <span class="value">{multiplier.toFixed(2)}×</span>
        </div>
      </div>
      <div class="actions">
        <button
          type="button"
          class="confirm"
          disabled={!canPrestige}
          aria-label="Prestige bestätigen"
          onclick={onconfirm}
        >
          git push --tags
        </button>
        <button type="button" class="cancel" aria-label="Prestige abbrechen" onclick={oncancel}>
          cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
    max-width: 360px;
    width: calc(100% - 32px);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }
  h2 {
    margin: 0 0 12px;
    color: var(--amb);
    font-size: 16px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }
  .body p {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .preview {
    display: flex;
    justify-content: space-between;
    background: #0d1410;
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 6px 10px;
    font-size: 12px;
  }
  .label {
    color: var(--dim);
  }
  .value {
    color: var(--green);
  }
  .actions {
    display: flex;
    gap: 10px;
  }
  .actions button {
    flex: 1;
    padding: 9px 12px;
    border-radius: 6px;
    font-size: 13px;
  }
  .confirm {
    background: #1b150a;
    border: 1px solid #7a5a1e;
    color: #e6c06a;
  }
  .confirm:hover:not(:disabled) {
    filter: brightness(1.15);
  }
  .confirm:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .cancel {
    background: var(--panel);
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .cancel:hover {
    border-color: var(--green-dim);
  }
  .actions button:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
</style>

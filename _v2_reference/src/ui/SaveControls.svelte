<script lang="ts">
  interface Props {
    lastSavedAt?: number;
    onexport: () => void;
    onimport: (file: File) => void;
    onreset: () => void;
    'data-testid'?: string;
  }

  let { lastSavedAt, onexport, onimport, onreset, 'data-testid': dataTestId }: Props = $props();
  let fileInput: HTMLInputElement | undefined = $state();

  function handleFile(e: Event & { currentTarget: HTMLInputElement }): void {
    const file = e.currentTarget.files?.[0];
    if (file) {
      onimport(file);
      e.currentTarget.value = '';
    }
  }

  function fmtDate(ts: number): string {
    return new Date(ts).toLocaleString('de-DE');
  }
</script>

<section class="save-controls" aria-label="Spielstand Verwaltung" data-testid={dataTestId}>
  <div class="actions">
    <button type="button" class="btn" aria-label="Spielstand exportieren" onclick={onexport}>
      export
    </button>
    <button
      type="button"
      class="btn"
      aria-label="Spielstand importieren"
      onclick={() => fileInput?.click()}
    >
      import
    </button>
    <button type="button" class="btn danger" aria-label="Spielstand zurücksetzen" onclick={onreset}>
      reset
    </button>
  </div>
  <input
    bind:this={fileInput}
    type="file"
    accept="application/json"
    class="hidden"
    aria-label="Import Datei"
    onchange={handleFile}
  />
  {#if lastSavedAt}
    <span class="saved-at">Last save: {fmtDate(lastSavedAt)}</span>
  {/if}
</section>

<style>
  .save-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .btn {
    flex: 1;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--muted);
    padding: 6px 10px;
    font-size: 12px;
  }
  .btn:hover {
    border-color: var(--green-dim);
    color: var(--text);
  }
  .btn.danger:hover {
    border-color: #e25b4a;
    color: #e25b4a;
  }
  .btn:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
  .hidden {
    display: none;
  }
  .saved-at {
    color: var(--dim);
    font-size: 11px;
  }
</style>

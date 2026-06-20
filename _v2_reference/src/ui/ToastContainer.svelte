<script lang="ts">
  import type { ToastType } from '../stores/toast';

  interface Props {
    toasts: readonly { id: number; message: string; type: ToastType }[];
    ondismiss: (id: number) => void;
    'data-testid'?: string;
  }

  let { toasts, ondismiss, 'data-testid': dataTestId }: Props = $props();

  const icon: Record<ToastType, string> = {
    success: '✓',
    warning: '⚠',
    error: '✕',
    info: 'ℹ',
  };
</script>

{#if toasts.length > 0}
  <div class="toast-container" role="status" aria-live="polite" aria-label="Notifications" data-testid={dataTestId}>
    {#each toasts as t (t.id)}
      <div class="toast {t.type}">
        <span class="icon" aria-hidden="true">{icon[t.type]}</span>
        <span class="message">{t.message}</span>
        <button
          type="button"
          class="close"
          aria-label="Toast schließen"
          onclick={() => ondismiss(t.id)}
        >
          ×
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 500;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 11px;
    font-size: 12px;
    min-width: 180px;
    animation: slide-in 250ms ease-out;
  }
  .toast.success { border-color: var(--green-dim); }
  .toast.warning { border-color: var(--amb); }
  .toast.error { border-color: #e25b4a; }
  .toast.info { border-color: var(--border); }
  .icon {
    color: var(--green);
  }
  .toast.warning .icon { color: var(--amb); }
  .toast.error .icon { color: #e25b4a; }
  .message {
    flex: 1;
    color: var(--text);
  }
  .close {
    background: none;
    border: none;
    color: var(--dim);
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
  }
  .close:hover {
    color: var(--text);
  }
  @keyframes slide-in {
    0% { opacity: 0; transform: translateX(20px); }
    100% { opacity: 1; transform: translateX(0); }
  }
</style>

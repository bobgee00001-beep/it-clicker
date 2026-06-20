<script lang="ts">
  interface Props {
    theme: 'dark' | 'light';
    ontoggle: () => void;
    'data-testid'?: string;
  }

  let { theme, ontoggle, 'data-testid': dataTestId }: Props = $props();
</script>

<button
  type="button"
  class="theme-toggle"
  aria-label={theme === 'dark' ? 'Auf helles Theme umschalten' : 'Auf dunkles Theme umschalten'}
  data-testid={dataTestId}
  onclick={ontoggle}
>
  <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
  <span class="label">{theme === 'dark' ? 'light' : 'dark'}</span>
</button>

<style>
  .theme-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--muted);
    padding: 5px 10px;
    font-size: 12px;
  }
  .theme-toggle:hover {
    border-color: var(--green-dim);
  }
  .theme-toggle:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
  .label {
    text-transform: lowercase;
  }
</style>

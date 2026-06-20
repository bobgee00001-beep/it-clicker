<script lang="ts">
  interface Props {
    tabs: readonly { id: string; label: string }[];
    active: string;
    onselect: (id: string) => void;
    'data-testid'?: string;
  }

  let { tabs, active, onselect, 'data-testid': dataTestId }: Props = $props();
</script>

<div class="shop-tabs" role="tablist" aria-label="Shop Kategorien" data-testid={dataTestId}>
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      role="tab"
      class="tab"
      class:active={tab.id === active}
      aria-selected={tab.id === active}
      aria-label={tab.label}
      onclick={() => onselect(tab.id)}
    >
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .shop-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  .tab {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--muted);
    padding: 5px 10px;
    font-size: 12px;
    transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
  }
  .tab:hover {
    border-color: var(--green-dim);
  }
  .tab:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
  .tab.active {
    background: #10210f;
    border-color: var(--green-dim);
    color: var(--green);
  }
</style>

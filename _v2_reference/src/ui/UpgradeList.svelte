<script lang="ts">
  import type { UpgradeDef } from '../engine/types';

  interface Props {
    upgrades: readonly UpgradeDef[];
    owned: Record<string, number>;
    affordable: Record<string, boolean>;
    cyclesScaled: bigint;
    onbuy: (id: string) => void;
    'data-testid'?: string;
  }

  let { upgrades, owned, affordable, cyclesScaled, onbuy, 'data-testid': dataTestId }: Props = $props();

  function fmt(n: bigint): string {
    return n.toString();
  }
</script>

<div class="upgrade-list" aria-label="Verfügbare Upgrades" data-testid={dataTestId}>
  {#each upgrades as up (up.id)}
    {@const level = owned[up.id] ?? 0}
    {@const installed = level >= up.maxLevel}
    {@const canBuy = !installed && (affordable[up.id] ?? false)}
    <button
      type="button"
      class="upgrade-card"
      class:installed
      disabled={!canBuy}
      aria-label={`${up.name}, Level ${level}/${up.maxLevel}, Kosten ${fmt(up.costScaled)}`}
      onclick={() => onbuy(up.id)}
    >
      <div class="row-main">
        <span class="name">{up.name}</span>
        <span class="state">
          {installed ? 'installiert' : `${fmt(up.costScaled)} c`}
        </span>
      </div>
      <div class="row-sub">
        <span class="flavor">{up.flavor}</span>
        <span class="level">Lv {level}/{up.maxLevel}</span>
      </div>
      {#if cyclesScaled < up.costScaled && !installed}
        <span class="need">Noch {fmt(up.costScaled - cyclesScaled)} c</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .upgrade-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .upgrade-card {
    width: 100%;
    text-align: left;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 8px 10px;
    font-size: 13px;
    transition: border-color 0.1s ease, background 0.1s ease, opacity 0.1s ease;
  }
  .upgrade-card:hover:not(:disabled) {
    border-color: var(--green-dim);
    background: #0d1410;
  }
  .upgrade-card:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .upgrade-card.installed {
    border-color: var(--green-dim);
    opacity: 0.65;
  }
  .upgrade-card.installed .name,
  .upgrade-card.installed .state {
    color: var(--green);
  }
  .upgrade-card:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
  .row-main {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }
  .name {
    color: var(--green);
  }
  .state {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .row-sub {
    display: flex;
    justify-content: space-between;
    margin-top: 3px;
    gap: 10px;
  }
  .flavor {
    color: var(--dim);
    font-size: 11.5px;
  }
  .level {
    color: var(--muted);
    font-size: 11.5px;
  }
  .need {
    display: block;
    margin-top: 4px;
    color: var(--amb);
    font-size: 11px;
  }
</style>

<script lang="ts">
  import type { AchievementDef } from '../engine/types';

  interface Props {
    achievements: readonly AchievementDef[];
    unlocked: Record<string, number>;
    progress: Record<string, number>;
    'data-testid'?: string;
  }

  let { achievements, unlocked, progress, 'data-testid': dataTestId }: Props = $props();

  function isUnlocked(id: string): boolean {
    return (unlocked[id] ?? 0) >= 1;
  }

  function prog(id: string): number {
    return progress[id] ?? 0;
  }
</script>

<section class="achievement-list" aria-label="Erfolge" data-testid={dataTestId}>
  <ul class="list" role="list">
    {#each achievements as a (a.id)}
      {@const unlocked = isUnlocked(a.id)}
      {@const p = prog(a.id)}
      <li class="achievement-card" class:locked={!unlocked}>
        <div class="row-main">
          <span class="marker" aria-hidden="true">{unlocked ? '✓' : '🔒'}</span>
          <span class="name">{a.name}</span>
        </div>
        <div class="row-sub">
          <span class="flavor">{a.flavor}</span>
          {#if p > 0 && !unlocked}
            <span class="progress">{p}%</span>
          {/if}
        </div>
        {#if p > 0 && !unlocked}
          <div class="progress-bar">
            <span class="progress-fill" style="width: {Math.max(0, Math.min(100, p))}%"></span>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .achievement-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .achievement-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 10px;
  }
  .achievement-card.locked {
    opacity: 0.55;
  }
  .row-main {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .marker {
    color: var(--green);
  }
  .achievement-card.locked .marker {
    color: var(--dim);
  }
  .name {
    color: var(--text);
    font-size: 13px;
  }
  .achievement-card.locked .name {
    color: var(--dim);
  }
  .row-sub {
    display: flex;
    justify-content: space-between;
    margin-top: 3px;
    gap: 10px;
  }
  .flavor {
    color: var(--muted);
    font-size: 11.5px;
  }
  .progress {
    color: var(--amb);
    font-size: 11.5px;
  }
  .progress-bar {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 5px;
  }
  .progress-fill {
    display: block;
    height: 100%;
    background: var(--amb);
  }
</style>

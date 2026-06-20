<script lang="ts">
  import type { GameEvent, EventCategory } from '../engine/eventLog';

  interface Props {
    entries: readonly GameEvent[];
    filter: EventCategory | null;
    count: number;
    categories: readonly EventCategory[];
    onfilter: (cat: EventCategory | null) => void;
    onclear: () => void;
    'data-testid'?: string;
  }

  let { entries, filter, count, categories, onfilter, onclear, 'data-testid': dataTestId }: Props = $props();

  const labels: Record<EventCategory | 'all', string> = {
    all: 'Alle',
    ticket: 'Tickets',
    sev1: 'SEV1',
    deploy: 'Deploy',
    achievement: 'Erfolge',
    economy: 'Economy',
    system: 'System',
  };

  function fmtTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function severityClass(sev: GameEvent['severity']): string {
    return `entry ${sev}`;
  }
</script>

<section class="event-log-panel" aria-label="Event Log" data-testid={dataTestId}>
  <div class="toolbar">
    <div class="filters" role="group" aria-label="Event Filter">
      <button
        type="button"
        class="filter-btn"
        class:active={filter === null}
        aria-pressed={filter === null}
        aria-label="Alle Events"
        onclick={() => onfilter(null)}
      >
        {labels.all}
      </button>
      {#each categories as cat (cat)}
        <button
          type="button"
          class="filter-btn"
          class:active={filter === cat}
          aria-pressed={filter === cat}
          aria-label={labels[cat]}
          onclick={() => onfilter(cat)}
        >
          {labels[cat]}
        </button>
      {/each}
    </div>
    <button type="button" class="clear-btn" aria-label="Event Log leeren" onclick={onclear}>
      clear
    </button>
  </div>

  <div class="entries" role="log" aria-live="off" aria-atomic="false">
    <span class="count">{entries.length}/{count} events</span>
    <ul class="entry-list" role="list">
      {#each entries as entry (entry.id)}
        <li class={severityClass(entry.severity)}>
          <span class="ts">{fmtTime(entry.timestamp)}</span>
          <span class="cat">[{entry.category}]</span>
          <span class="msg">{entry.message}</span>
        </li>
      {/each}
    </ul>
  </div>
</section>

<style>
  .event-log-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .filter-btn {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--muted);
    font-size: 11px;
    padding: 3px 7px;
  }
  .filter-btn.active {
    background: #10210f;
    border-color: var(--green-dim);
    color: var(--green);
  }
  .clear-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--dim);
    font-size: 11px;
    padding: 3px 8px;
  }
  .clear-btn:hover {
    color: #e25b4a;
    border-color: #8a2a2a;
  }
  .entries {
    background: #0d1410;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    max-height: 220px;
    overflow-y: auto;
  }
  .count {
    display: block;
    color: var(--dim);
    font-size: 11px;
    margin-bottom: 6px;
  }
  .entry-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .entry {
    display: flex;
    gap: 8px;
    font-size: 12px;
    color: var(--text);
  }
  .ts {
    color: var(--dim);
    white-space: nowrap;
  }
  .cat {
    color: var(--amb);
    white-space: nowrap;
  }
  .msg {
    color: var(--muted);
  }
  .entry.success .msg {
    color: var(--green);
  }
  .entry.warning .msg {
    color: var(--amb);
  }
  .entry.critical .msg {
    color: #e25b4a;
  }
</style>

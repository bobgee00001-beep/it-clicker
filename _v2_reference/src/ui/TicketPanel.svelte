<script lang="ts">
  import type { Ticket, TicketType } from '../engine/types';
  import { SLA_SECONDS_BY_TYPE, REWARD_CYCLES_BY_TYPE } from '../engine/config';

  interface Props {
    tickets: readonly Ticket[];
    onresolve: (idx: number) => void;
    'data-testid'?: string;
  }

  let { tickets, onresolve, 'data-testid': dataTestId }: Props = $props();

  function badgeClass(type: TicketType): string {
    return `badge ${type}`;
  }

  function fmt(n: bigint): string {
    return n.toString();
  }
</script>

<section class="ticket-panel" aria-label="Offene Tickets" data-testid={dataTestId}>
  {#if tickets.length === 0}
    <p class="empty" aria-live="polite">Keine offenen Tickets. Das Backlog ist grün.</p>
  {:else}
    <ul class="ticket-list" role="list">
      {#each tickets as ticket, idx (ticket.id)}
        {@const remaining = Math.max(0, ticket.sla)}
        {@const max = ticket.maxSla > 0 ? ticket.maxSla : SLA_SECONDS_BY_TYPE[ticket.type]}
        {@const pct = max > 0 ? (remaining / max) * 100 : 0}
        <li class="ticket-card" class:p1={ticket.type === 'p1'}>
          <div class="ticket-header">
            <span class={badgeClass(ticket.type)} role="img" aria-label={`Priorität ${ticket.type.toUpperCase()}`}>
              {ticket.type.toUpperCase()}
            </span>
            <span class="title">{ticket.title}</span>
          </div>
          <div class="sla-bar" aria-label={`SLA Restzeit ${remaining.toFixed(1)} Sekunden`}>
            <span class="sla-fill" style="width: {pct}%" class:critical={pct < 25}></span>
          </div>
          <div class="ticket-footer">
            <span class="reward">+{fmt(REWARD_CYCLES_BY_TYPE[ticket.type])} c</span>
            <span class="countdown">SLA {remaining.toFixed(1)}s</span>
            <button
              type="button"
              class="resolve-btn"
              aria-label={`Ticket ${ticket.title} lösen`}
              onclick={() => onresolve(idx)}
            >
              resolve
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .ticket-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .empty {
    color: var(--dim);
    font-size: 12px;
    margin: 0;
  }
  .ticket-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ticket-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
  }
  .ticket-card.p1 {
    border-color: #8a2a2a;
    background: #1a0f0f;
  }
  .ticket-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 5px;
    border-radius: 4px;
    background: var(--dim);
    color: var(--bg);
  }
  .badge.p1 {
    background: #e25b4a;
    color: #fff;
  }
  .badge.p2 {
    background: var(--amb);
    color: #000;
  }
  .badge.p3 {
    background: var(--green-dim);
    color: #fff;
  }
  .title {
    color: var(--text);
    font-size: 12px;
  }
  .sla-bar {
    height: 5px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .sla-fill {
    display: block;
    height: 100%;
    background: var(--green);
    transition: width 0.2s linear;
  }
  .sla-fill.critical {
    background: #e25b4a;
  }
  .ticket-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .reward {
    color: var(--green);
    font-size: 12px;
  }
  .countdown {
    color: var(--muted);
    font-size: 11px;
  }
  .resolve-btn {
    background: #10210f;
    border: 1px solid var(--green-dim);
    color: var(--green);
    border-radius: 5px;
    padding: 3px 8px;
    font-size: 11px;
  }
  .resolve-btn:hover {
    filter: brightness(1.15);
  }
  .resolve-btn:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
</style>

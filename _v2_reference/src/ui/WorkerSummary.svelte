<script lang="ts">
  interface Props {
    workerCps: bigint;
    clickRate: number;
    internCount: number;
    juniorCount: number;
    seniorCount: number;
    staffCount: number;
    'data-testid'?: string;
  }

  let { workerCps, clickRate, internCount, juniorCount, seniorCount, staffCount, 'data-testid': dataTestId }: Props = $props();
</script>

<section class="worker-summary" aria-label="Worker Zusammenfassung" data-testid={dataTestId}>
  <div class="kpi">
    <span class="kpi-label">Worker CPS</span>
    <span class="kpi-value">{workerCps.toString()} /s</span>
  </div>
  <div class="kpi">
    <span class="kpi-label">Clicks/s</span>
    <span class="kpi-value">{clickRate.toFixed(2)}</span>
  </div>
  <div class="roster">
    <span class="chip">Intern ×{internCount}</span>
    <span class="chip">Junior ×{juniorCount}</span>
    <span class="chip">Senior ×{seniorCount}</span>
    <span class="chip">Staff ×{staffCount}</span>
  </div>
</section>

<style>
  .worker-summary {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .kpi {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }
  .kpi-label {
    color: var(--dim);
    font-size: 12px;
  }
  .kpi-value {
    color: var(--green);
    font-size: 13px;
  }
  .roster {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--muted);
    font-size: 11px;
    padding: 3px 7px;
  }
</style>

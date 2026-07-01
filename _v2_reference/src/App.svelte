<script lang="ts">
  import { onMount } from 'svelte';
  import {
    game,
    offline,
    doClick as clickAction,
    buy as buyAction,
    buyUp as buyUpgradeAction,
    doPrestige,
    dismissOffline,
    hardReset,
    setTab,
    setVolume,
    toggleMute,
    setSound,
  } from './stores/game';
  import { theme } from './stores/theme';
  import { audio, playThemeSound } from './stores/audio';
  import { toasts } from './stores/toast';
  import {
    nextCostScaled,
    genCount,
    productionPerSecScaled,
    canAfford,
    canAffordUpgrade,
    effectiveClickScaled,
    canPrestige,
    prestigeGain,
  } from './engine/engine';
  import {
    GENERATORS,
    UPGRADES,
    ACHIEVEMENTS,
    TAB_NAMES,
    SHOP_TAB_IDS,
    TAB_UPGRADES,
  } from './engine/config';
  import { formatCycles } from './lib/format';
  import type { EventCategory } from './engine/eventLog';
  import type { SoundThemeId } from './engine/types';

  // UI components
  import ShopTabs from './ui/ShopTabs.svelte';
  import UpgradeList from './ui/UpgradeList.svelte';
  import TicketPanel from './ui/TicketPanel.svelte';
  import WorkerSummary from './ui/WorkerSummary.svelte';
  import ReleasePanel from './ui/ReleasePanel.svelte';
  import ObservabilityPanel from './ui/ObservabilityPanel.svelte';
  import AchievementList from './ui/AchievementList.svelte';
  import EventLogPanel from './ui/EventLogPanel.svelte';
  import AudioPanel from './ui/AudioPanel.svelte';
  import PrestigeModal from './ui/PrestigeModal.svelte';
  import Sev1Overlay from './ui/Sev1Overlay.svelte';
  import ClickEffect from './ui/ClickEffect.svelte';
  import ToastContainer from './ui/ToastContainer.svelte';
  import ThemeToggle from './ui/ThemeToggle.svelte';
  import SaveControls from './ui/SaveControls.svelte';
  import OfflineToast from './ui/OfflineToast.svelte';
  import LoginPanel from './ui/LoginPanel.svelte';
  import { workerCpsScaled, workerClickRatePerSec } from './engine/workers';
  import { deploymentQuality, calculateUptime, calculateErrorRate } from './engine/observability';
  import { calculateRisk, canStartDeploy, canRollback } from './engine/release';

  // ── local reactive state ───────────────────────────────────────
  let popups = $state<{ id: number; text: string }[]>([]);
  let popupId = 0;
  let showPrestige = $state(false);
  let logFilter = $state<EventCategory | null>(null);
  let activeTab = $state('hardware');

  // derive filtered log entries
  const logEntries = $derived(
    logFilter ? $game.eventLog.entries.filter((e) => e.category === logFilter) : $game.eventLog.entries,
  );

  // derive upgrades for active tab
  const tabUpgrades = $derived(TAB_UPGRADES[activeTab as keyof typeof TAB_UPGRADES] ?? []);

  const affordableUpgrades = $derived(
    UPGRADES.reduce(
      (acc: Record<string, boolean>, u) => {
        acc[u.id] = canAffordUpgrade($game, u.id);
        return acc;
      },
      {} as Record<string, boolean>,
    ),
  );

  const releaseStageName = $derived($game.releaseStageIndex >= 0 ? `Stage ${$game.releaseStageIndex + 1}` : '-');

  // ── mount ──────────────────────────────────────────────────────
  onMount(() => {
    game.init();

    function onKey(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      if (e.code === 'Space' && target && !['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(target.tagName)) {
        e.preventDefault();
        handleClick();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── achievement toasts ─────────────────────────────────────────
  let prevAchievements: Record<string, number> = { ...$game.achievements };
  $effect(() => {
    const cur = $game.achievements;
    const prev = prevAchievements;
    prevAchievements = { ...cur };
    for (const a of ACHIEVEMENTS) {
      if ((cur[a.id] ?? 0) >= 1 && (prev[a.id] ?? 0) < 1) {
        toasts.push(`Erfolg freigeschaltet: ${a.name}`, 'success', 4000);
        playThemeSound($audio, 'achievement');
      }
    }
  });

  // ── interactions ───────────────────────────────────────────────
  function handleClick(): void {
    const gain = formatCycles(effectiveClickScaled($game));
    clickAction();
    playThemeSound($audio, 'click');
    const id = ++popupId;
    popups = [...popups, { id, text: `+${gain}` }];
    setTimeout(() => {
      popups = popups.filter((p) => p.id !== id);
    }, 700);
  }

  function handleBuyGenerator(id: string): void {
    buyAction(id);
    playThemeSound($audio, 'buy');
  }

  function handleBuyUpgrade(id: string): void {
    buyUpgradeAction(id);
    playThemeSound($audio, 'buy');
  }

  function handleTabSelect(id: string): void {
    activeTab = id;
    setTab(id);
  }

  function handleResolveTicket(idx: number): void {
    game.resolveTicket(idx);
  }

  function handleStartDeploy(): void {
    game.startDeploy();
    playThemeSound($audio, 'deploy');
  }

  function handleRollback(): void {
    game.rollback();
  }

  function handlePrestigeConfirm(): void {
    doPrestige();
    showPrestige = false;
    playThemeSound($audio, 'achievement');
  }

  function handleExport(): void {
    const blob = game.doExport();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `it-clicker-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(file: File): void {
    game.doImport(file).catch(() => {
      toasts.push('Import fehlgeschlagen', 'error', 4000);
    });
  }

  function handleReset(): void {
    if (confirm('Spielstand wirklich löschen?')) {
      hardReset();
    }
  }

  function handleAudioSelect(id: SoundThemeId): void {
    setSound(id);
  }

  function handleLogFilter(cat: EventCategory | null): void {
    logFilter = cat;
  }

  function handleLogClear(): void {
    game.clearEventLog();
  }

  const tabs = SHOP_TAB_IDS.map((id) => ({ id, label: TAB_NAMES[id] ?? id }));
</script>

<main class="term" data-testid="app-root">
  <ToastContainer toasts={$toasts} ondismiss={(id) => toasts.dismiss(id)} data-testid="toast-container" />
  <Sev1Overlay active={$game.sev1Active} timer={$game.sev1Timer} data-testid="sev1-overlay" />

  <div class="titlebar">
    <span class="dots" aria-hidden="true">
      <i class="d r"></i>
      <i class="d a"></i>
      <i class="d g"></i>
    </span>
    <span class="who">georg@datacenter: ~/it-clicker — zsh</span>
    <div class="title-actions">
      <ThemeToggle theme={$theme} ontoggle={() => theme.toggle()} data-testid="theme-toggle" />
      <button class="rm" onclick={handleReset} title="Save löschen">rm -rf ~/save</button>
    </div>
  </div>

  {#if $offline}
    <OfflineToast elapsedMs={$offline.elapsedMs} gainedScaled={$offline.gainedScaled} ondismiss={dismissOffline} data-testid="offline-toast" />
  {/if}

  <div class="statusbar">
    <span class="seg">
      <span class="lbl">cycles</span>
      <b>{formatCycles($game.cyclesScaled)}</b>
    </span>
    <span class="seg">
      <span class="lbl">throughput</span>
      <b>{formatCycles(productionPerSecScaled($game))}/s</b>
    </span>
    <span class="seg">
      <span class="lbl">stars</span>
      <span class="amb">{$game.shares}</span>
    </span>
    <span class="seg">
      <span class="lbl">erfolge</span>
      <b>
        {ACHIEVEMENTS.filter((a) => ($game.achievements[a.id] ?? 0) >= 1).length}/{ACHIEVEMENTS.length}
      </b>
    </span>
    <span class="seg">
      <span class="lbl">Σ lifetime</span>
      {formatCycles($game.totalEarnedScaled)}
    </span>
  </div>

  <div class="grid">
    <!-- LEFT COLUMN -->
    <div class="col">
      <section class="pane click-pane" data-testid="click-area" style="position: relative">
        <p class="ph">
          <span class="k">$</span> ./boot.sh
          <span class="dim">— manueller cycle (Space=Click)</span>
        </p>
        <button class="run" aria-label="Cycle generieren" onclick={handleClick}>
          <span class="run-cmd">&gt; ./boot.sh <span class="caret">▮</span></span>
          <span class="run-gain">+{formatCycles(effectiveClickScaled($game))} / run</span>
        </button>
        {#each popups as p (p.id)}
          <ClickEffect amount={p.text} />
        {/each}
      </section>

      <section class="pane grow" data-testid="generators-panel">
        <p class="ph">
          <span class="k">$</span> df -h
          <span class="dim">— infrastruktur</span>
        </p>
        {#each GENERATORS as def (def.id)}
          {@const owned = genCount($game, def.id)}
          {@const affordable = canAfford($game, def.id)}
          <button
            class="row drive"
            disabled={!affordable}
            aria-label={`Generator ${def.name} kaufen für ${formatCycles(nextCostScaled(def, owned))}`}
            onclick={() => handleBuyGenerator(def.id)}
          >
            <div class="row-main">
              <span class="nm">
                <span class="path">/dev/</span>{def.id}
              </span>
              <span class="cnt">×{owned}</span>
            </div>
            <div class="row-sub">
              <span class="flav">{def.flavor}</span>
              <span class="cost">{formatCycles(nextCostScaled(def, owned))} c</span>
            </div>
          </button>
        {/each}
      </section>

      <section class="pane" data-testid="worker-summary">
        <p class="ph">
          <span class="k">$</span> uptime
          <span class="dim">— worker summary</span>
        </p>
        <WorkerSummary
          workerCps={workerCpsScaled($game, effectiveClickScaled($game))}
          clickRate={workerClickRatePerSec($game)}
          internCount={$game.generators['intern'] ?? 0}
          juniorCount={$game.generators['junior'] ?? 0}
          seniorCount={$game.generators['senior'] ?? 0}
          staffCount={$game.generators['staff'] ?? 0}
          data-testid="worker-summary-component"
        />
      </section>

      <section class="pane" data-testid="ticket-panel">
        <p class="ph">
          <span class="k">$</span> incidents
          <span class="dim">— open tickets</span>
        </p>
        <TicketPanel tickets={$game.tickets} onresolve={(idx) => handleResolveTicket(idx)} data-testid="ticket-panel-component" />
      </section>
    </div>

    <!-- RIGHT COLUMN -->
    <div class="col">
      <section class="pane" data-testid="shop-tabs" style="min-height: 80px">
        <ShopTabs tabs={tabs} active={activeTab} onselect={handleTabSelect} data-testid="shop-tabs-component" />
        <UpgradeList
          upgrades={tabUpgrades}
          owned={$game.upgrades}
          affordable={affordableUpgrades}
          cyclesScaled={$game.cyclesScaled}
          onbuy={handleBuyUpgrade}
          data-testid="upgrade-list-component"
        />
      </section>

      <section class="pane" data-testid="release-panel">
        <p class="ph">
          <span class="k">$</span> deploy --tag
          <span class="dim">— release train</span>
        </p>
        <ReleasePanel
          status={$game.releaseStatus}
          stageName={releaseStageName}
          stageTimer={$game.releaseStageTimer}
          risk={calculateRisk($game)}
          bonusMultiplier={$game.releaseDeployBonusMultiplier}
          message={$game.releaseMessage}
          canStart={canStartDeploy($game)}
          canRollback={canRollback($game)}
          onstart={handleStartDeploy}
          onrollback={handleRollback}
          data-testid="release-panel-component"
        />
      </section>

      <section class="pane" data-testid="observability-panel">
        <p class="ph">
          <span class="k">$</span> observability
          <span class="dim">— health & metrics</span>
        </p>
        <ObservabilityPanel
          score={$game.observabilityScore}
          uptime={calculateUptime($game)}
          errorRate={calculateErrorRate($game)}
          errorBudget={$game.errorBudget}
          activeIncidents={$game.activeIncidents}
          quality={deploymentQuality($game)}
          cleanWindows={$game.cleanMonitoringWindows}
          rollbackAvailable={$game.rollbackAvailable}
          onrollback={handleRollback}
          data-testid="observability-panel-component"
        />
      </section>

      <section class="pane" data-testid="achievement-list">
        <p class="ph">
          <span class="k">$</span> git log
          <span class="dim">— erfolge</span>
        </p>
        <AchievementList
          achievements={ACHIEVEMENTS}
          unlocked={$game.achievements}
          progress={$game.achievementProgress}
          data-testid="achievement-list-component"
        />
      </section>

      <section class="pane" data-testid="event-log-panel">
        <p class="ph">
          <span class="k">$</span> journalctl
          <span class="dim">— event log</span>
        </p>
        <EventLogPanel
          entries={logEntries}
          filter={logFilter}
          count={$game.eventLog.entries.length}
          categories={['ticket', 'sev1', 'deploy', 'achievement', 'economy', 'system']}
          onfilter={handleLogFilter}
          onclear={handleLogClear}
          data-testid="event-log-panel-component"
        />
      </section>

      <section class="pane" data-testid="audio-panel">
        <p class="ph">
          <span class="k">$</span> pactl
          <span class="dim">— audio</span>
        </p>
        <AudioPanel
          selected={$game.selectedSound}
          volume={$game.masterVolume}
          muted={$game.muted}
          prestigeLevel={$game.prestige}
          onselect={handleAudioSelect}
          onvolume={setVolume}
          onmute={toggleMute}
          data-testid="audio-panel-component"
        />
      </section>

      <section class="pane" data-testid="account-panel">
        <p class="ph">
          <span class="k">$</span> ssh login
          <span class="dim">— cloud-save</span>
        </p>
        <LoginPanel />
      </section>

      <section class="pane" data-testid="save-controls">
        <p class="ph">
          <span class="k">$</span> savectl
          <span class="dim">— persist</span>
        </p>
        <SaveControls
          lastSavedAt={$game.lastSavedMs}
          onexport={handleExport}
          onimport={handleImport}
          onreset={handleReset}
          data-testid="save-controls-component"
        />
      </section>
    </div>
  </div>

  <button
    class="prestige-fab"
    aria-label="Prestige Modal öffnen"
    disabled={!canPrestige($game)}
    onclick={() => (showPrestige = true)}
  >
    git push --tags
  </button>

  <PrestigeModal
    open={showPrestige}
    oldPoints={Number($game.shares)}
    newPoints={Number($game.shares + prestigeGain($game))}
    multiplier={Number($game.shares * 2n + 50n) / 50}
    canPrestige={canPrestige($game)}
    onconfirm={handlePrestigeConfirm}
    oncancel={() => (showPrestige = false)}
    data-testid="prestige-modal-component"
  />
</main>

<style>
  .term {
    --amb: #e0a83a;
    --dim: #4a5a4f;
    --green-dim: #2f8f54;
    max-width: 960px;
    margin: 0 auto;
    padding: 16px;
    padding-bottom: 72px;
    font-size: 13px;
    line-height: 1.5;
  }
  .titlebar {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    padding: 8px 12px;
    color: var(--muted);
    font-size: 12px;
  }
  .title-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dots {
    display: inline-flex;
    gap: 6px;
  }
  .d {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    display: inline-block;
  }
  .d.r {
    background: #e25b4a;
  }
  .d.a {
    background: var(--amb);
  }
  .d.g {
    background: var(--green);
  }
  .who {
    flex: 1;
  }
  .rm {
    background: none;
    border: none;
    color: var(--dim);
    font-size: 11px;
  }
  .rm:hover {
    color: #ff5a5a;
  }
  .statusbar {
    display: flex;
    flex-wrap: wrap;
    background: #0d1410;
    border: 1px solid var(--border);
    border-bottom: 0;
  }
  .seg {
    padding: 7px 13px;
    border-right: 1px solid var(--border);
    color: var(--muted);
    font-size: 12px;
  }
  .seg .lbl {
    color: var(--dim);
  }
  .seg b {
    color: var(--green);
    font-weight: 500;
  }
  .seg .amb {
    color: var(--amb);
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    border: 1px solid var(--border);
    border-radius: 0 0 8px 8px;
    overflow: hidden;
  }
  @media (min-width: 720px) {
    .grid {
      grid-template-columns: 1.2fr 1fr;
    }
    .col + .col {
      border-left: 1px solid var(--border);
    }
  }
  .col {
    display: flex;
    flex-direction: column;
  }
  .pane {
    padding: 11px 14px;
    border-bottom: 1px solid var(--border);
  }
  .pane.grow {
    flex: 1;
  }
  .col:last-child .pane:last-child {
    border-bottom: 0;
  }
  .ph {
    margin: 0 0 9px;
    color: var(--green-dim);
    font-size: 11.5px;
    letter-spacing: 0.3px;
  }
  .ph .k {
    color: var(--green);
  }
  .ph .dim {
    color: var(--dim);
  }
  .run {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #10210f;
    border: 1px solid var(--green-dim);
    border-radius: 6px;
    color: #7ef0a0;
    padding: 11px 13px;
    font-size: 13px;
    transition: filter 0.1s ease, transform 0.05s ease;
  }
  .run:hover {
    filter: brightness(1.15);
  }
  .run:active {
    transform: scale(0.99);
  }
  .run-gain {
    color: var(--green);
  }
  .caret {
    animation: blink 1.1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  .row {
    width: 100%;
    text-align: left;
    display: block;
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 7px 9px;
    color: var(--text);
    transition: border-color 0.1s ease, background 0.1s ease, opacity 0.1s ease;
  }
  .row + .row {
    margin-top: 4px;
  }
  .row-main {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .row-sub {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-top: 2px;
  }
  .nm {
    color: var(--green);
  }
  .path {
    color: var(--dim);
  }
  .cnt {
    color: var(--muted);
  }
  .flav {
    color: var(--dim);
    font-size: 11.5px;
  }
  .cost {
    color: var(--muted);
    font-size: 11.5px;
    white-space: nowrap;
  }
  button.drive:hover:not(:disabled) {
    border-color: var(--green-dim);
    background: #0d1410;
  }
  button.drive:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .prestige-fab {
    position: fixed;
    bottom: 16px;
    right: 16px;
    background: #1b150a;
    border: 1px solid #7a5a1e;
    border-radius: 8px;
    color: #e6c06a;
    padding: 10px 16px;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }
  .prestige-fab:hover:not(:disabled) {
    filter: brightness(1.15);
  }
  .prestige-fab:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .prestige-fab:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }

  :global(.theme-light) .term {
    --amb: #b07010;
    --dim: #6a7a6f;
    --green-dim: #3fa76e;
  }
  :global(.theme-light) .statusbar {
    background: #f4f6f4;
  }
  :global(.theme-light) .run {
    background: #e8f7ec;
    color: #0d5c28;
  }
</style>

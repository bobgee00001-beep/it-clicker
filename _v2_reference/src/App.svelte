<script lang="ts">
  import { game, offline, doClick, buy, buyUp, doPrestige, dismissOffline, hardReset } from './stores/game';
  import {
    nextCostScaled,
    genCount,
    productionPerSecScaled,
    canAfford,
    canAffordUpgrade,
    upgradeLevel,
    effectiveClickScaled,
    canPrestige,
    prestigeGain,
  } from './engine/engine';
  import { GENERATORS, UPGRADES, ACHIEVEMENTS } from './engine/config';
  import { formatCycles, formatDuration } from './lib/format';

  // ── juice state ──────────────────────────────────────────────
  let popups = $state<{ id: number; text: string }[]>([]);
  let popupId = 0;

  let bootLog = $state<string[]>([]);

  let shake = $state(false);

  let toasts = $state<{ id: number; name: string }[]>([]);
  let toastId = 0;

  // ── onBoot: click + popup + log ──────────────────────────────
  function onBoot() {
    const gainText = formatCycles(effectiveClickScaled($game));
    doClick();

    // floating popup
    const id = ++popupId;
    popups.push({ id, text: `+${gainText}` });
    setTimeout(() => {
      popups = popups.filter((p) => p.id !== id);
    }, 700);

    // boot log
    bootLog = [`+${gainText} cycles`, ...bootLog].slice(0, 5);
  }

  // ── achievement toast + shake ─────────────────────────────────
  let prevAchievements: Record<string, number> = { ...$game.achievements };
  $effect(() => {
    const cur = $game.achievements;
    const prev = prevAchievements;
    prevAchievements = { ...cur };

    for (const a of ACHIEVEMENTS) {
      if ((cur[a.id] ?? 0) >= 1 && (prev[a.id] ?? 0) < 1) {
        // toast
        const id = ++toastId;
        toasts.push({ id, name: a.name });
        setTimeout(() => {
          toasts = toasts.filter((t) => t.id !== id);
        }, 2500);

        // shake
        shake = true;
        setTimeout(() => {
          shake = false;
        }, 400);
      }
    }
  });
</script>

<main class="term" class:shake>
  <div class="titlebar">
    <span class="dots" aria-hidden="true"><i class="d r"></i><i class="d a"></i><i class="d g"></i></span>
    <span class="who">georg@datacenter: ~/it-clicker — zsh</span>
    <button class="rm" onclick={hardReset} title="Save löschen">rm -rf ~/save</button>
  </div>

  {#if toasts.length}
    <div class="toasts" role="status" aria-live="polite">
      {#each toasts as t (t.id)}
        <div class="toast">✓ commit: {t.name}</div>
      {/each}
    </div>
  {/if}

  <div class="statusbar">
    <span class="seg"><span class="lbl">cycles</span> <b>{formatCycles($game.cyclesScaled)}</b></span>
    <span class="seg"><span class="lbl">throughput</span> <b>{formatCycles(productionPerSecScaled($game))}/s</b></span>
    <span class="seg"><span class="lbl">stars</span> <span class="amb">{$game.shares}</span></span>
    <span class="seg"><span class="lbl">erfolge</span> <b>{ACHIEVEMENTS.filter((a) => ($game.achievements[a.id] ?? 0) >= 1).length}/{ACHIEVEMENTS.length}</b></span>
    <span class="seg"><span class="lbl">Σ lifetime</span> {formatCycles($game.totalEarnedScaled)}</span>
  </div>

  {#if $offline}
    <div class="notice" role="status">
      <span><span class="dim">[offline {formatDuration($offline.elapsedMs)}]</span> cron lief weiter — <b>+{formatCycles($offline.gainedScaled)}</b> cycles</span>
      <button class="x" onclick={dismissOffline}>dismiss</button>
    </div>
  {/if}

  <div class="grid">
    <div class="col">
      <section class="pane" style="position:relative">
        <p class="ph"><span class="k">$</span> ./boot.sh <span class="dim">— manueller cycle</span></p>
        <button class="run" onclick={onBoot}>
          <span class="run-cmd">&gt; ./boot.sh <span class="caret">▮</span></span>
          <span class="run-gain">+{formatCycles(effectiveClickScaled($game))} / run</span>
        </button>
        {#each popups as p (p.id)}
          <span class="popup" style="left:{50 + (p.id % 7 - 3) * 9}%">{p.text}</span>
        {/each}
        <div class="boot-log" id="boot-log">
          {#each bootLog as line, i}
            <div class="boot-line" style="color:{i === 0 ? 'var(--green)' : i === 1 ? 'var(--muted)' : 'var(--dim)'}">{line}</div>
          {/each}
        </div>
      </section>

      <section class="pane grow">
        <p class="ph"><span class="k">$</span> df -h <span class="dim">— infrastruktur</span></p>
        {#each GENERATORS as def (def.id)}
          {@const owned = genCount($game, def.id)}
          {@const cost = nextCostScaled(def, owned)}
          {@const affordable = canAfford($game, def.id)}
          <button class="row drive" disabled={!affordable} onclick={() => buy(def.id)}>
            <div class="row-main">
              <span class="nm"><span class="path">/dev/</span>{def.id}</span>
              <span class="cnt">×{owned}</span>
            </div>
            <div class="row-sub">
              <span class="flav">{def.flavor}</span>
              <span class="cost">{formatCycles(cost)} c</span>
            </div>
          </button>
        {/each}
      </section>
    </div>

    <div class="col">
      <section class="pane">
        <p class="ph"><span class="k">$</span> apt install <span class="dim">— skripte</span></p>
        {#each UPGRADES as up (up.id)}
          {@const installed = upgradeLevel($game, up.id) >= up.maxLevel}
          {@const affordable = canAffordUpgrade($game, up.id)}
          <button
            class="row pkg"
            class:installed
            disabled={installed || !affordable}
            onclick={() => buyUp(up.id)}
          >
            <div class="row-main">
              <span class="nm">{up.name}</span>
              <span class="state">{installed ? 'installed' : `${formatCycles(up.costScaled)} c`}</span>
            </div>
            <div class="row-sub"><span class="flav">{up.flavor}</span></div>
          </button>
        {/each}
      </section>

      <section class="pane">
        <p class="ph"><span class="k">$</span> git log <span class="dim">— erfolge</span></p>
        {#each ACHIEVEMENTS as a (a.id)}
          {@const unlocked = ($game.achievements[a.id] ?? 0) >= 1}
          <div class="row commit" class:unlocked>
            <div class="row-main">
              <span class="nm"><span class="sha">{unlocked ? '●' : '○'}</span> {a.name}</span>
              <span class="mark">{unlocked ? '✓' : '🔒'}</span>
            </div>
            <div class="row-sub"><span class="flav">{a.flavor}</span></div>
          </div>
        {/each}
      </section>

      <section class="pane">
        <p class="ph"><span class="k">$</span> deploy --tag <span class="dim">— IPO / release</span></p>
        <div class="stars">★ <span class="amb">{$game.shares}</span> stars <span class="dim">→ +{$game.shares * 2n}% throughput</span></div>
        <button class="deploy" disabled={!canPrestige($game)} onclick={() => doPrestige()}>
          <span>git push --tags</span>
          <span class="gain">+{prestigeGain($game)} ★</span>
        </button>
      </section>
    </div>
  </div>
</main>

<style>
  .term {
    --amb: #e0a83a;
    --dim: #4a5a4f;
    --green-dim: #2f8f54;
    max-width: 820px;
    margin: 0 auto;
    padding: 16px;
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
  .notice {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    background: #0e1a12;
    border: 1px solid var(--border);
    border-bottom: 0;
    padding: 8px 13px;
    font-size: 12px;
  }
  .notice b {
    color: var(--green);
  }
  .notice .x {
    background: none;
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 5px;
    padding: 2px 8px;
    font-size: 11px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    border: 1px solid var(--border);
    border-radius: 0 0 8px 8px;
    overflow: hidden;
  }
  @media (min-width: 680px) {
    .grid {
      grid-template-columns: 1.25fr 1fr;
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
  .boot-log {
    margin-top: 8px;
    min-height: 18px;
    color: var(--muted);
    font-size: 12px;
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
  .cnt,
  .state {
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
  button.drive:hover:not(:disabled),
  button.pkg:hover:not(:disabled) {
    border-color: var(--green-dim);
    background: #0d1410;
  }
  button.drive:disabled,
  button.pkg:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .pkg.installed {
    opacity: 0.75;
    border-color: var(--border);
  }
  .pkg.installed .state {
    color: var(--green);
  }
  .commit .sha {
    color: var(--amb);
  }
  .commit:not(.unlocked) {
    opacity: 0.45;
  }
  .commit:not(.unlocked) .nm,
  .commit:not(.unlocked) .sha {
    color: var(--dim);
  }
  .commit.unlocked .mark {
    color: var(--green);
  }
  .stars {
    color: var(--muted);
    font-size: 12px;
    margin-bottom: 8px;
  }
  .deploy {
    width: 100%;
    display: flex;
    justify-content: space-between;
    background: #1b150a;
    border: 1px solid #7a5a1e;
    border-radius: 6px;
    color: #e6c06a;
    padding: 10px 13px;
    font-size: 13px;
    transition: filter 0.1s ease;
  }
  .deploy:hover:not(:disabled) {
    filter: brightness(1.15);
  }
  .deploy:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .deploy .gain {
    color: var(--amb);
  }

  /* ── floating click popup ─────────────────────────────────── */
  .popup {
    position: absolute;
    bottom: 48px;
    color: var(--green);
    font-family: monospace;
    font-size: 13px;
    font-weight: 600;
    pointer-events: none;
    white-space: nowrap;
    animation: pop-float 700ms ease-out forwards;
  }
  @keyframes pop-float {
    0% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-36px);
    }
  }

  /* ── boot log lines ───────────────────────────────────────── */
  .boot-line {
    font-family: monospace;
    font-size: 12px;
    line-height: 1.4;
  }

  /* ── achievement toasts ───────────────────────────────────── */
  .toasts {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    padding: 6px 13px;
    background: #0d1410;
    border-bottom: 1px solid var(--border);
  }
  .toast {
    background: #10210f;
    border: 1px solid var(--green-dim);
    border-radius: 5px;
    color: var(--green);
    font-family: monospace;
    font-size: 12px;
    padding: 5px 10px;
    animation: toast-in 300ms ease-out;
  }
  @keyframes toast-in {
    0% {
      opacity: 0;
      transform: translateX(20px);
    }
    100% {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* ── screen shake ─────────────────────────────────────────── */
  .term.shake {
    animation: shake 400ms ease-out;
  }
  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    10% {
      transform: translateX(-3px);
    }
    30% {
      transform: translateX(3px);
    }
    50% {
      transform: translateX(-2px);
    }
    70% {
      transform: translateX(2px);
    }
    90% {
      transform: translateX(-1px);
    }
  }
</style>

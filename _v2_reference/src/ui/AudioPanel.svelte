<script lang="ts">
  import { SOUND_THEMES } from '../engine/config';
  import type { SoundThemeId } from '../engine/types';

  interface Props {
    selected: SoundThemeId;
    volume: number;
    muted: boolean;
    prestigeLevel: number;
    onselect: (id: SoundThemeId) => void;
    onvolume: (v: number) => void;
    onmute: () => void;
    'data-testid'?: string;
  }

  let { selected, volume, muted, prestigeLevel, onselect, onvolume, onmute, 'data-testid': dataTestId }: Props = $props();

  const unlockedThemes = SOUND_THEMES.filter((t) => t.unlockAt === 0 || prestigeLevel >= t.unlockAt);
</script>

<section class="audio-panel" aria-label="Audio Einstellungen" data-testid={dataTestId}>
  <div class="volume-row">
    <label for="master-volume">Volume {Math.round(volume * 100)}%</label>
    <input
      id="master-volume"
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={volume}
      aria-label="Lautstärke"
      oninput={(e) => onvolume(Number(e.currentTarget.value))}
    />
    <button
      type="button"
      class="mute-btn"
      aria-pressed={muted}
      aria-label={muted ? 'Ton einschalten' : 'Ton stummschalten'}
      onclick={onmute}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  </div>

  <div class="theme-list" role="radiogroup" aria-label="Sound Theme">
    {#each unlockedThemes as theme (theme.id)}
      <button
        type="button"
        role="radio"
        class="theme-btn"
        class:active={theme.id === selected}
        aria-checked={theme.id === selected}
        aria-label={theme.name}
        onclick={() => onselect(theme.id)}
      >
        <span class="theme-name">{theme.name}</span>
        <span class="theme-desc">{theme.description}</span>
      </button>
    {/each}
  </div>
</section>

<style>
  .audio-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .volume-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  label {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }
  input[type='range'] {
    flex: 1;
    accent-color: var(--green);
  }
  .mute-btn {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--muted);
    padding: 3px 7px;
    font-size: 13px;
  }
  .mute-btn:hover {
    border-color: var(--green-dim);
  }
  .theme-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .theme-btn {
    width: 100%;
    text-align: left;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 7px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .theme-btn.active {
    border-color: var(--green-dim);
    background: #10210f;
  }
  .theme-name {
    color: var(--green);
    font-size: 13px;
  }
  .theme-desc {
    color: var(--dim);
    font-size: 11px;
  }
  .theme-btn:focus-visible,
  input:focus-visible,
  .mute-btn:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
</style>

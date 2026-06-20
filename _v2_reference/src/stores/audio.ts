import { writable, type Readable } from 'svelte/store';
import { SOUND_THEMES } from '../engine/config';
import type { SoundThemeId } from '../engine/types';

export interface AudioSettings {
  masterVolume: number;
  muted: boolean;
  selectedTheme: SoundThemeId;
}

export type AudioStore = Readable<AudioSettings> & {
  setVolume(value: number): void;
  toggleMute(): void;
  selectTheme(id: SoundThemeId): void;
  getUnlockedThemes(prestigeLevel: number): typeof SOUND_THEMES;
};

const STORAGE_KEY = 'it-clicker-v2-audio';

function readStoredAudio(): Partial<AudioSettings> | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<AudioSettings>) : null;
  } catch {
    return null;
  }
}

function writeStoredAudio(s: AudioSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    }
  } catch {
    // Storage access may be denied in test env; ignore.
  }
}

function isValidThemeId(id: unknown): id is SoundThemeId {
  if (typeof id !== 'string') return false;
  return SOUND_THEMES.some((t) => t.id === id);
}

function createAudioStore(): AudioStore {
  const stored = readStoredAudio();
  const initial: AudioSettings = {
    masterVolume: Math.max(0, Math.min(1, stored?.masterVolume ?? 0.5)),
    muted: typeof stored?.muted === 'boolean' ? stored.muted : false,
    selectedTheme: isValidThemeId(stored?.selectedTheme) ? stored.selectedTheme : 'none',
  };

  const { subscribe, set, update } = writable<AudioSettings>(initial);

  function persist(next: AudioSettings): AudioSettings {
    writeStoredAudio(next);
    return next;
  }

  return {
    subscribe,
    setVolume(value: number) {
      update((s) => persist({ ...s, masterVolume: Math.max(0, Math.min(1, value)) }));
    },
    toggleMute() {
      update((s) => persist({ ...s, muted: !s.muted }));
    },
    selectTheme(id: SoundThemeId) {
      if (!isValidThemeId(id)) return;
      update((s) => persist({ ...s, selectedTheme: id }));
    },
    getUnlockedThemes(prestigeLevel: number) {
      return SOUND_THEMES.filter((t) => t.unlockAt === 0 || prestigeLevel >= t.unlockAt);
    },
  };
}

export const audio = createAudioStore();

let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;

function ensureAudio(settings: AudioSettings): { ctx: AudioContext; gain: GainNode } | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext: typeof AudioContext }).AudioContext
    ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtx();
    gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => undefined);
  }
  if (gainNode) {
    gainNode.gain.value = settings.muted ? 0 : settings.masterVolume;
  }
  return { ctx: audioCtx, gain: gainNode! };
}

/** Play a synthetic sound for the current theme. No external files. */
export function playThemeSound(settings: AudioSettings, type: 'click' | 'buy' | 'achievement' | 'error' | 'deploy' = 'click'): void {
  if (settings.muted || settings.selectedTheme === 'none' || typeof window === 'undefined') return;
  const pair = ensureAudio(settings);
  if (!pair) return;
  const { ctx, gain } = pair;
  const now = ctx.currentTime;

  switch (settings.selectedTheme) {
    case 'dialup': {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
      const localGain = ctx.createGain();
      localGain.gain.setValueAtTime(0.15, now);
      localGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(localGain).connect(gain);
      osc.start(now);
      osc.stop(now + 0.25);
      break;
    }
    case 'mechanical': {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(type === 'buy' ? 300 : 600, now);
      const localGain = ctx.createGain();
      localGain.gain.setValueAtTime(0.12, now);
      localGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(localGain).connect(gain);
      osc.start(now);
      osc.stop(now + 0.08);
      break;
    }
    case 'retro': {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      const freq = type === 'achievement' ? 880 : type === 'error' ? 220 : 440;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.12);
      const localGain = ctx.createGain();
      localGain.gain.setValueAtTime(0.1, now);
      localGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(localGain).connect(gain);
      osc.start(now);
      osc.stop(now + 0.15);
      break;
    }
    case 'scifi': {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.35);
      const localGain = ctx.createGain();
      localGain.gain.setValueAtTime(0.1, now);
      localGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(localGain).connect(gain);
      osc.start(now);
      osc.stop(now + 0.35);
      break;
    }
    default:
      break;
  }
}

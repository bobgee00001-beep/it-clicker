// Svelte-Store-Brücke: hält den GameState, treibt Tick, Auto-Save, Export/Import/Reset.
import { writable, type Readable } from 'svelte/store';
import type { GameState, SoundThemeId } from '../engine/types';
import {
  createInitialState,
  tick as engTick,
  click as engClick,
  buyGenerator as engBuy,
  buyUpgrade as engBuyUpgrade,
  applyPrestige as engPrestige,
  resolveTicket as engResolveTicket,
} from '../engine/engine';
import { startDeploy as engStartDeploy, performRollback as engRollback } from '../engine/release';
import { serialize, deserialize, exportPayload, importPayload, clearSave, clearCorruptSave } from '../engine/save';
import { applyOfflineEarnings } from '../engine/offline';
import { TICK_MS, SHOP_TAB_IDS } from '../engine/config';
import { attachCloudSync, type CloudSync } from './cloudSave';

const SAVE_KEY = 'it-clicker-v2-save';
const SAVE_VERSION_SUFFIX = 'v5';
const FULL_KEY = `${SAVE_KEY}:${SAVE_VERSION_SUFFIX}`;

export interface OfflineInfo {
  gainedScaled: bigint;
  elapsedMs: number;
}

export type GameStore = Readable<GameState> & {
  offline: Readable<OfflineInfo | null>;
  init(): void;
  tick(deltaMs: number, nowMs?: number): void;
  click(now?: Date): void;
  prestige(): void;
  buy(id: string): void;
  buyUpgrade(id: string): void;
  setTab(tab: string): void;
  setSound(id: SoundThemeId): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  doExport(): Blob;
  doImport(file: File): Promise<void>;
  doReset(): void;
  dismissOffline(): void;
  clearEventLog(): void;
  resolveTicket(idx: number): void;
  startDeploy(): void;
  rollback(): void;
};

function withLocalStorage<T>(fn: () => T, fallback: T): T {
  try {
    if (typeof localStorage !== 'undefined') {
      return fn();
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function readSaveFromStorage(): GameState | null {
  return withLocalStorage(() => {
    const raw = localStorage.getItem(FULL_KEY) ?? localStorage.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  }, null);
}

// Cloud-Sync wird in init() verdrahtet (null = kein Login/Supabase -> reiner Lokal-Modus).
let cloudSync: CloudSync | null = null;

function writeSaveToStorage(s: GameState, notifyCloud = true): void {
  withLocalStorage(() => {
    localStorage.setItem(FULL_KEY, serialize({ ...s, lastSavedMs: Date.now() }));
  }, undefined);
  // Jeder lokale Save plant zusätzlich einen (debounced) Cloud-Upload — greift nur,
  // wenn der Spieler eingeloggt/freigeschaltet ist, sonst no-op. Beim Adoptieren
  // eines Cloud-Saves wird notifyCloud=false gesetzt (kein Re-Upload, kein Race).
  if (notifyCloud) cloudSync?.notifySaved();
}

function createGameStore(): GameStore {
  let state: GameState = createInitialState(Date.now());
  const { subscribe, set } = writable<GameState>(state);
  const { subscribe: offlineSubscribe, set: setOffline } = writable<OfflineInfo | null>(null);

  function commit(next: GameState): void {
    state = next;
    set(state);
  }

  function resolveOffline(now: number): void {
    const result = applyOfflineEarnings(state, now);
    if (result.gainedScaled > 0n) {
      setOffline({ gainedScaled: result.gainedScaled, elapsedMs: result.elapsedMs });
    } else {
      setOffline(null);
    }
    commit({ ...result.state, lastSavedMs: now });
  }

  let initialized = false;

  return {
    subscribe,

    init() {
      if (initialized) return;
      initialized = true;

      const loaded = readSaveFromStorage();
      if (loaded) {
        state = loaded;
        commit(state);
        resolveOffline(Date.now());
      } else {
        commit(createInitialState(Date.now()));
      }

      if (typeof window !== 'undefined') {
        const beforeUnloadHandler = () => writeSaveToStorage(state);
        const visibilityHandler = () => {
          if (document.visibilityState === 'visible') {
            resolveOffline(Date.now());
          }
        };
        window.addEventListener('beforeunload', beforeUnloadHandler);
        document.addEventListener('visibilitychange', visibilityHandler);
      }

      let last = Date.now();
      setInterval(() => {
        const now = Date.now();
        const dt = now - last;
        last = now;
        state = engTick(state, dt, now);
        set(state);
      }, TICK_MS);

      // Cloud-Sync verdrahten: bei 'player'-Login reconcilen (pull/merge/adopt
      // oder push), danach hält jeder Save die Cloud aktuell.
      cloudSync = attachCloudSync({
        getState: () => state,
        adopt: (s) => {
          commit(s);
          writeSaveToStorage(s, false); // kein Cloud-Re-Upload des grade adoptierten Saves
        },
      });

      // Periodischer Autosave (lokal + Cloud-Push). Vorher wurde nur bei
      // beforeunload geschrieben -> die Cloud hätte während des Spielens nie
      // etwas gesehen. 20s ist genug für ein Idle-Game.
      setInterval(() => writeSaveToStorage(state), 20000);
    },

    tick(deltaMs: number, nowMs?: number) {
      if (deltaMs <= 0) return;
      commit(engTick(state, deltaMs, nowMs ?? Date.now()));
    },

    click(now?: Date) {
      commit(engClick(state, now));
    },

    prestige() {
      commit(engPrestige(state));
    },

    buy(id: string) {
      commit(engBuy(state, id, Date.now()));
    },

    buyUpgrade(id: string) {
      commit(engBuyUpgrade(state, id, Date.now()));
    },

    setTab(tab: string) {
      if (SHOP_TAB_IDS.includes(tab as typeof SHOP_TAB_IDS[number])) {
        commit({ ...state, currentTab: tab });
      }
    },

    setSound(id: SoundThemeId) {
      commit({ ...state, selectedSound: id });
    },

    setVolume(volume: number) {
      commit({ ...state, masterVolume: Math.max(0, Math.min(1, volume)) });
    },

    toggleMute() {
      commit({ ...state, muted: !state.muted });
    },

    doExport(): Blob {
      const payload = exportPayload(state);
      return new Blob([JSON.stringify(payload)], { type: 'application/json' });
    },

    async doImport(file: File) {
      const text = await file.text();
      const imported = importPayload(text);
      if (!imported) {
        clearCorruptSave();
        throw new Error('Import failed: invalid or corrupt save file');
      }
      writeSaveToStorage(imported);
      commit(imported);
    },

    doReset() {
      clearSave();
      clearCorruptSave();
      setOffline(null);
      const fresh = createInitialState(Date.now());
      writeSaveToStorage(fresh);
      commit(fresh);
    },

    dismissOffline() {
      setOffline(null);
      commit({ ...state });
    },

    clearEventLog() {
      commit({ ...state, eventLog: { ...state.eventLog, entries: [] } });
    },

    resolveTicket(idx: number) {
      commit(engResolveTicket(state, idx, Date.now()));
    },

    startDeploy() {
      commit(engStartDeploy(state, Date.now()));
    },

    rollback() {
      commit(engRollback(state));
    },

    get offline(): Readable<OfflineInfo | null> {
      return { subscribe: offlineSubscribe };
    },
  };
}

export const game = createGameStore();
export const offline = game.offline;

export const doClick = (): void => game.click();
export const buy = (id: string): void => game.buy(id);
export const buyUp = (id: string): void => game.buyUpgrade(id);
export const doPrestige = (): void => game.prestige();
export const hardReset = (): void => game.doReset();
export const dismissOffline = (): void => game.dismissOffline();
export const setTab = (tab: string): void => game.setTab(tab);
export const setVolume = (v: number): void => game.setVolume(v);
export const toggleMute = (): void => game.toggleMute();
export const setSound = (id: SoundThemeId): void => game.setSound(id);

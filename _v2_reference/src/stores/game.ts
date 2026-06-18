// View-Brücke zwischen Engine und Svelte. ENTHÄLT KEINE SPIEL-LOGIK
// (Invariante aus DESIGN.md) — sie hält nur den aktuellen Engine-Snapshot,
// leitet Aktionen an die Engine weiter und treibt den Tick.
import { writable } from 'svelte/store';
import {
  createInitialState,
  click as engClick,
  buyGenerator as engBuy,
  buyUpgrade as engBuyUpgrade,
  tick as engTick,
  applyOffline,
  applyPrestige as engPrestige,
} from '../engine/engine';
import { TICK_MS } from '../engine/config';
import { load, save, clearSave } from '../engine/save';
import type { GameState } from '../engine/types';

let state: GameState;
let offlineInit: { gainedScaled: bigint; elapsedMs: number } | null = null;

const loaded = load();
if (loaded) {
  const r = applyOffline(loaded, Date.now());
  state = r.state;
  if (r.gainedScaled > 0n) offlineInit = { gainedScaled: r.gainedScaled, elapsedMs: r.elapsedMs };
} else {
  state = createInitialState(Date.now());
}

export const game = writable<GameState>(state);
export const offline = writable<{ gainedScaled: bigint; elapsedMs: number } | null>(offlineInit);

function commit() {
  game.set(state);
}

export function doClick() {
  state = engClick(state);
  commit();
}

export function doPrestige() {
  state = engPrestige(state);
  commit();
}

export function buy(id: string) {
  state = engBuy(state, id);
  commit();
}

export function buyUp(id: string) {
  state = engBuyUpgrade(state, id);
  commit();
}

export function dismissOffline() {
  offline.set(null);
}

export function hardReset() {
  clearSave();
  state = createInitialState(Date.now());
  offline.set(null);
  commit();
}

// Tick-Loop: treibt die deterministische Engine mit Wall-Clock-Δt.
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = now - last;
  last = now;
  state = engTick(state, dt);
  commit();
}, TICK_MS);

// Autosave + Save bei Tab-Schließen.
setInterval(() => save(state), 5000);
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => save(state));
}

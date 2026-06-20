import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { get } from 'svelte/store';
import { serialize, exportPayload } from '../../engine/save';
import { SCALE } from '../../engine/types';

// Mock localStorage
type Store = Record<string, string>;
const store: Store = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  }),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// Polyfill minimal window/document for the Node test environment.
type EventListenerMap = {
  beforeunload: Array<EventListenerOrEventListenerObject>;
  visibilitychange: Array<EventListenerOrEventListenerObject>;
};
const listeners: EventListenerMap = {
  beforeunload: [],
  visibilitychange: [],
};

const doc = {
  addEventListener: (type: string, handler: EventListenerOrEventListenerObject) => {
    if (type === 'visibilitychange') listeners.visibilitychange.push(handler);
  },
  removeEventListener: () => undefined,
  visibilityState: 'visible',
};
const win = {
  addEventListener: (type: string, handler: EventListenerOrEventListenerObject) => {
    if (type === 'beforeunload') listeners.beforeunload.push(handler);
  },
  removeEventListener: () => undefined,
};
Object.defineProperty(globalThis, 'document', { value: doc, writable: true, configurable: true });
Object.defineProperty(globalThis, 'window', { value: win, writable: true, configurable: true });

// Dynamic import so the store module sees our polyfills before it initializes.
// game.init() is idempotent, so we call it once here and reuse the captured listeners.
const { game } = await import('../game');
game.init();

const beforeunloadHandler = listeners.beforeunload[0] as EventListener | undefined;
const visibilitychangeHandler = listeners.visibilitychange[0] as EventListener | undefined;

describe('stores/game', () => {
  beforeEach(() => {
    store['it-clicker-v2-save:v5'] = '';
    store['it-clicker-v2-save'] = '';
  });

  it('doExport returns a Blob containing a valid ExportPayload', async () => {
    const blob = game.doExport();
    expect(blob).toBeInstanceOf(Blob);
    const text = await blob.text();
    const payload = JSON.parse(text);
    expect(payload.version).toBeDefined();
    expect(payload.exportedAt).toBeDefined();
    expect(typeof payload.data).toBe('string');
    expect(payload.data).toBe(serialize(get(game)));
  });

  it('doImport parses file text and updates state', async () => {
    const s = get(game);
    const exported = exportPayload({ ...s, cyclesScaled: 999_999n * SCALE, lastSavedMs: Date.now() });
    const file = new File([JSON.stringify(exported)], 'save.json', { type: 'application/json' });

    await game.doImport(file);
    const next = get(game);
    expect(next.cyclesScaled).toBe(999_999n * SCALE);
  });

  it('doImport rejects corrupt save', async () => {
    const file = new File(['not valid json'], 'save.json', { type: 'application/json' });
    await expect(game.doImport(file)).rejects.toThrow('Import failed');
  });

  it('doReset clears storage and resets state', () => {
    localStorage.setItem('it-clicker-v2-save:v5', serialize(get(game)));
    game.doReset();
    expect(localStorage.removeItem).toHaveBeenCalled();
    const next = get(game);
    expect(next.cyclesScaled).toBe(0n);
    expect(next.generators).toEqual({});
  });

  it('beforeunload listener is registered and serializes state on trigger', () => {
    expect(beforeunloadHandler).toBeDefined();
    beforeunloadHandler?.(new Event('beforeunload'));
    expect(localStorage.setItem).toHaveBeenCalled();
  });

  it('visibilitychange listener is registered and triggers offline earnings on visible', async () => {
    expect(visibilitychangeHandler).toBeDefined();
    doc.visibilityState = 'visible';
    const now = Date.now();
    const exported = exportPayload({
      ...get(game),
      cyclesScaled: 0n,
      lastSavedMs: now - 60_000,
      generators: { pi: 5 },
    });

    await game.doImport(new File([JSON.stringify(exported)], 'save.json', { type: 'application/json' }));
    // Ensure imported save has a lastSavedMs old enough to trigger offline logic.
    expect(get(game).lastSavedMs).toBeLessThanOrEqual(now - 60_000);
    const before = get(game).cyclesScaled;
    visibilitychangeHandler?.(new Event('visibilitychange'));
    expect(get(game).cyclesScaled).toBeGreaterThanOrEqual(before);
    expect(get(game).totalEarnedScaled).toBeGreaterThanOrEqual(get(game).cyclesScaled);
  });

  it('tick advances state deterministically', () => {
    const s = get(game);
    const before = s.lastTick;
    game.tick(1000, Date.now());
    const next = get(game);
    expect(next.lastTick).toBeGreaterThanOrEqual(before);
    expect(next.sessionPlayTime).toBeGreaterThanOrEqual(s.sessionPlayTime);
  });

  afterAll(() => {
    listeners.beforeunload.length = 0;
    listeners.visibilitychange.length = 0;
  });
});

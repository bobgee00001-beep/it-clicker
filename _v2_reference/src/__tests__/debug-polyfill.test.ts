import { describe, it, expect } from 'vitest';

describe('document polyfill load order', () => {
  it('sets document polyfill before importing store', async () => {
    const listeners: { type: string; handler: EventListenerOrEventListenerObject }[] = [];
    const win = {
      addEventListener: (type: string, handler: EventListenerOrEventListenerObject) => {
        listeners.push({ type, handler });
      },
      removeEventListener: () => undefined,
    };
    const doc = {
      addEventListener: (type: string, handler: EventListenerOrEventListenerObject) => {
        listeners.push({ type, handler });
      },
      removeEventListener: () => undefined,
      visibilityState: 'visible',
    };
    Object.defineProperty(globalThis, 'window', { value: win, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: doc, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
      writable: true,
      configurable: true,
    });

    // Pfad relativ zur Testdatei auflösen — portabel über alle Maschinen
    // (vorher hartkodierter Mac-Pfad /Users/bob/workspace/...).
    // @ts-ignore dynamic import
    const mod = await import(new URL('../stores/game.ts', import.meta.url).href);
    mod.game.init();
    console.log('listeners after init', listeners);
    expect(listeners.length).toBeGreaterThan(0);
    expect(listeners.some((l) => l.type === 'visibilitychange')).toBe(true);
  });
});

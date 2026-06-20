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

    // @ts-ignore dynamic import
    const mod = await import('/Users/bob/workspace/it-clicker/_v2_reference/src/stores/game.ts');
    mod.game.init();
    console.log('listeners after init', listeners);
    expect(listeners.length).toBeGreaterThan(0);
    expect(listeners.some((l) => l.type === 'visibilitychange')).toBe(true);
  });
});

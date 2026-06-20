import { writable, type Readable } from 'svelte/store';

export type Theme = 'dark' | 'light';

export type ThemeStore = Readable<Theme> & {
  toggle(): void;
  set(theme: Theme): void;
};

const STORAGE_KEY = 'it-clicker-v2-theme';
const CLASS_LIGHT = 'theme-light';

function readStoredTheme(): Theme | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'dark' || raw === 'light') return raw;
    return null;
  } catch {
    return null;
  }
}

function applyClass(theme: Theme): void {
  if (typeof document === 'undefined') return;
  if (theme === 'light') {
    document.documentElement.classList.add(CLASS_LIGHT);
  } else {
    document.documentElement.classList.remove(CLASS_LIGHT);
  }
}

function writeStoredTheme(theme: Theme): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch {
    // ignore storage errors
  }
}

function createThemeStore(): ThemeStore {
  const stored = readStoredTheme();
  const prefersLight =
    typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: light)').matches;
  const initial: Theme = stored ?? (prefersLight ? 'light' : 'dark');

  const { subscribe, set, update } = writable<Theme>(initial);
  applyClass(initial);

  return {
    subscribe,
    toggle() {
      update((current) => {
        const next: Theme = current === 'dark' ? 'light' : 'dark';
        applyClass(next);
        writeStoredTheme(next);
        return next;
      });
    },
    set(theme: Theme) {
      applyClass(theme);
      writeStoredTheme(theme);
      set(theme);
    },
  };
}

export const theme = createThemeStore();

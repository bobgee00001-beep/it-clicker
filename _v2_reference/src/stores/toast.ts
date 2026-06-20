import { writable, type Readable } from 'svelte/store';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  durationMs: number;
}

export type ToastStore = Readable<Toast[]> & {
  push(message: string, type?: ToastType, durationMs?: number): void;
  dismiss(id: number): void;
};

let toastId = 0;

function createToastStore(): ToastStore {
  const { subscribe, set, update } = writable<Toast[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  function dismiss(id: number): void {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    update((all) => all.filter((t) => t.id !== id));
  }

  return {
    subscribe,
    push(message: string, type: ToastType = 'info', durationMs: number = 3500) {
      const id = ++toastId;
      const toast: Toast = { id, message, type, durationMs };
      update((all) => [...all, toast]);
      const timer = setTimeout(() => dismiss(id), durationMs);
      timers.set(id, timer);
    },
    dismiss,
  };
}

export const toasts = createToastStore();

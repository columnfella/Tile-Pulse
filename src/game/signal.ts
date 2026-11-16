/**
 * Tiny subscribable value. During gameplay, fast-changing values (score,
 * combo, judgment, tile states) live in signals so only the small components
 * that show them re-render, instead of the whole play screen on every tap.
 */
import { useRef, useSyncExternalStore } from 'react';

export interface Signal<T> {
  get: () => T;
  set: (value: T) => void;
  update: (fn: (prev: T) => T) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createSignal<T>(initial: T): Signal<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  const set = (next: T) => {
    if (Object.is(next, value)) return;
    value = next;
    listeners.forEach((l) => l());
  };
  return {
    get: () => value,
    set,
    update: (fn) => set(fn(value)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** A signal that lives as long as the component (created once). */
export function useCreateSignal<T>(initial: T): Signal<T> {
  const ref = useRef<Signal<T> | null>(null);
  if (!ref.current) ref.current = createSignal(initial);
  return ref.current;
}

/** Re-renders the calling component when the signal changes. */
export function useSignal<T>(signal: Signal<T>): T {
  return useSyncExternalStore(signal.subscribe, signal.get, signal.get);
}

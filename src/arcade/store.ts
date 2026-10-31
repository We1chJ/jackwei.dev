// Tiny external stores shared by the 3D scene and the HTML overlay (same pattern as the
// gashapon's store, made generic for the arcade, the vending machine and the claw).
import { useSyncExternalStore } from 'react';

export function createStore<S extends object>(initial: S) {
  let state = initial;
  const listeners = new Set<() => void>();
  const store = {
    get: () => state,
    set(patch: Partial<S>) {
      const next = { ...state, ...patch };
      if ((Object.keys(patch) as (keyof S)[]).every((k) => next[k] === state[k])) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
  const use = <T,>(select: (s: S) => T): T => useSyncExternalStore(store.subscribe, () => select(state), () => select(state));
  return [store, use] as const;
}

export type MachineId = 'claw' | 'gacha' | 'vending';
/** What the camera is on: the hero overview (nothing in play), or one machine. */
export type Focus = 'hero' | MachineId;
export type Shot = 'main' | 'pickup';
/** `onScreen`: the arcade is in view (the page scrolls past it; it stops drawing when it is gone). */
export const [arcade, useArcade] = createStore({ focus: 'hero' as Focus, shot: 'main' as Shot, onScreen: true });

/** A machine asks for the pickup close-up while its prize waits (only while it has focus). */
export function wantShot(machine: MachineId, shot: Shot) {
  const a = arcade.get();
  if (a.focus === machine && a.shot !== shot) arcade.set({ shot });
}

// Tiny external store shared by the 3D machine and the HTML overlay.
import { useSyncExternalStore } from 'react';

export type Phase = 'settling' | 'idle' | 'turning' | 'dispensing' | 'ready' | 'taking' | 'held';

// `held` is the index into PROJECTS of the capsule in the visitor's hand.
type State = { phase: Phase; turns: number; sound: boolean; held: number | null };
let state: State = { phase: 'settling', turns: 0, sound: false, held: null };
const listeners = new Set<() => void>();

export const gacha = {
  get: () => state,
  set(patch: Partial<State>) {
    const next = { ...state, ...patch };
    if (Object.keys(patch).every((k) => (next as Record<string, unknown>)[k] === (state as Record<string, unknown>)[k])) return;
    state = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  // Wired by the machine once it mounts.
  actions: { putBack: () => {} },
};

export function useGacha<T>(select: (s: State) => T): T {
  return useSyncExternalStore(gacha.subscribe, () => select(state), () => select(state));
}

// The hero's opening: the machines wait out of sight above the frame once the scene is ready,
// and drop onto the floor one after another when the visitor puts the coin in.
//   loading -> ready (scene built, machines lifted, loader waiting for the coin)
//           -> dropping (from the moment the loader opens) -> done (everything landed)
import { createStore, type MachineId } from './store';

export type IntroPhase = 'loading' | 'ready' | 'dropping' | 'done';
export const [intro, useIntro] = createStore({ phase: 'loading' as IntroPhase, startedAt: 0, landed: 0 });

// Fall order and stagger (s after the loader opens).
export const DROP_DELAY: Record<MachineId, number> = { claw: 0.15, gacha: 0.5, vending: 0.85 };

type Impact = { machine: MachineId; speed: number };
const listeners = new Set<(i: Impact) => void>();
/** Something reacts to a machine hitting the floor (sound, dust, camera shake, its contents). */
export function onImpact(fn: (i: Impact) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function impact(i: Impact) { listeners.forEach((l) => l(i)); }

// Where each machine stands in the arcade, and the camera framings for each one.
// Metres; Y up, +Z toward the visitor. The gashapon stays at the origin (its logic uses world
// coordinates directly); the others are offset along X.
import type { Focus, MachineId, Shot } from './store';

export const ORDER: MachineId[] = ['claw', 'gacha', 'vending'];

export const SPOT: Record<MachineId, { x: number; label: string }> = {
  claw: { x: -1.2, label: 'Claw' },
  gacha: { x: 0, label: 'Gacha' },
  vending: { x: 1.25, label: 'Vending' },
};

type View = { target: [number, number, number]; position: [number, number, number]; minDistance: number; maxDistance: number };
const at = (x: number, target: [number, number, number], offset: [number, number, number], min: number, max: number): View => ({
  target: [x + target[0], target[1], target[2]], position: [x + offset[0], offset[1], offset[2]], minDistance: min, maxDistance: max,
});

// One shared interior light (a light costs on every surface, so there is only one): it sits in
// whichever machine has focus, under its strip light.
export const INTERIOR_LIGHT: Record<Focus, { position: [number, number, number]; intensity: number; distance: number }> = {
  hero: { position: [0, 1.43, 0.14], intensity: 0.5, distance: 1.4 },
  gacha: { position: [0, 1.43, 0.14], intensity: 0.7, distance: 1.4 },
  claw: { position: [SPOT.claw.x, 1.6, 0.12], intensity: 0.8, distance: 1.1 },
  vending: { position: [SPOT.vending.x - 0.12, 1.59, 0.18], intensity: 0.9, distance: 1.4 },
};

// Close framings: `main` frames the part you play with; `pickup` drops down to where the prize
// comes out, and is used while one is waiting there.
export const VIEW: Record<Focus, Record<Shot, View>> = {
  // The hero: nearly head on, slightly from the right, with the machines filling the right 60% of the
  // frame and facing the visitor. The name on the left turns away, shrinking toward the middle.
  hero: {
    main: at(0, [-1.27, 0.92, 0], [2.3, 1.45, 7.4], 1, 14),
    pickup: at(0, [-1.27, 0.92, 0], [2.3, 1.45, 7.4], 1, 14),
  },
  gacha: {
    main: at(0, [0, 0.95, 0], [0.7, 1.3, 3.6], 1.4, 5),
    pickup: at(0, [0, 0.6, 0.23], [0.4, 0.95, 2.3], 1, 5),
  },
  claw: {
    main: at(SPOT.claw.x, [0, 1.2, 0], [0.82, 1.58, 2.9], 1.4, 5),
    pickup: at(SPOT.claw.x, [-0.14, 0.4, 0.3], [0.46, 0.72, 1.95], 1, 5),
  },
  vending: {
    main: at(SPOT.vending.x, [0.02, 1.1, 0], [0.9, 1.38, 3.0], 1.4, 5),
    pickup: at(SPOT.vending.x, [-0.1, 0.36, 0.3], [0.5, 0.68, 1.95], 1, 5),
  },
};

// The hero name: top-left corner in normalised screen coordinates (-1..1), how far out from the
// camera it stands, each line's height as a share of the screen, and its turn away to the right.
export const HERO_NAME = { x: -0.86, y: 0.54, distance: 3.0, line: 0.185, turn: 0.52 };
/** Roughly where the name's second line ends, as a share of the screen height (for the HTML under it). */
export const HERO_TEXT_BOTTOM = 1 - (HERO_NAME.y + 1) / 2 + HERO_NAME.line * 2.25;


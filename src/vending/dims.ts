// Vending machine dimensions, metres, in the machine's own frame: origin on the floor at the
// cabinet centre, Y up, +Z out of the glass. Spiral-coil snack-machine layout: four rows (A at
// the top) of four coils behind the glass, keypad column on the right, pickup bin at the bottom.
export const VM = { w: 0.92, d: 0.8, h: 1.83, radius: 0.025, wall: 0.02 };
export const FRONT_Z = VM.d / 2;

export const WINDOW = { x0: -0.43, x1: 0.19, y0: 0.58, y1: 1.66, radius: 0.02 };
export const GLASS_Z = FRONT_Z - 0.016;
export const INSIDE = { x0: WINDOW.x0 + 0.015, x1: WINDOW.x1 - 0.015, back: -VM.d / 2 + VM.wall + 0.02 };

export const ROWS = ['A', 'B', 'C', 'D'] as const;
export const COLS = 4;
export const SHELF_Y = [1.4, 1.14, 0.88, 0.62];           // shelf surface per row, A..D
export const SHELF = { back: INSIDE.back, front: 0.24, thickness: 0.012 };
export const COL_X = Array.from({ length: COLS }, (_, c) => INSIDE.x0 + ((INSIDE.x1 - INSIDE.x0) / COLS) * (c + 0.5));

// Spiral coil: a wire helix along Z; each gap between turns holds one item.
export const COIL = { radius: 0.05, wire: 0.0034, pitch: 0.11, front: SHELF.front, back: SHELF.front - 0.11 * 5 };
export const PER_COIL = 3;
export const slotZ = (k: number) => COIL.front - COIL.pitch / 2 - k * COIL.pitch;

// Graded card in an acrylic slab, standing upright facing the glass.
export const SLAB = { w: 0.078, h: 0.112, t: 0.014 };

// Keypad column and pickup bin.
export const PANEL = { x0: 0.215, x1: 0.435 };
export const LED = { x: 0.325, y: 1.43, w: 0.18, h: 0.052 };
export const KEYPAD = { x: 0.325, y: 1.2, key: [0.04, 0.032] as [number, number], gap: 0.008 };
export const HOWTO = { x: 0.325, y: 1.31, w: 0.19, h: 0.074 };
export const BIN = { x0: -0.36, x1: 0.1, y0: 0.16, y1: 0.36, radius: 0.02, floorBack: [0.08, 0.31] as [number, number], floorFront: [GLASS_Z, 0.17] as [number, number] };
export const BIN_FLAP = { hingeY: BIN.y1 - 0.004, z: FRONT_Z + 0.003, width: BIN.x1 - BIN.x0 - 0.012, height: BIN.y1 - BIN.y0 - 0.008, thickness: 0.004 };
export const HEADER = { y0: 1.69, y1: 1.8 };

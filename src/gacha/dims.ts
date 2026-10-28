// Real-world dimensions (metres) of a single Bandai-style gashapon cabinet.
// Y up, +Z faces the viewer, origin on the floor under the cabinet centre.
// Proportions follow a standard 1-tier machine (~360 x 380 x 800 mm).

export const CAB = {
  w: 0.36,          // outer width
  d: 0.38,          // outer depth
  base: 0.03,       // plinth height
  top: 0.8,         // top of the cabinet
  wall: 0.012,      // sheet thickness
  radius: 0.014,    // edge rounding of the shell panels
};
export const FRONT_Z = CAB.d / 2;                 // outer face of the front panel
export const INNER = {                            // inside faces of the shell
  x: CAB.w / 2 - CAB.wall,
  back: -CAB.d / 2 + CAB.wall,
  front: FRONT_Z - CAB.wall,
};

// Capsule hopper seen through the front window.
export const WINDOW = { x0: -0.15, x1: 0.15, y0: 0.4, y1: 0.665, radius: 0.012 };
export const ACRYLIC_Z = INNER.front - 0.003;     // inner acrylic pane, just behind the window hole
export const HOPPER = {
  floor: 0.369,       // static floor top
  ceiling: 0.672,
  discTop: 0.377,     // rotating dispensing disc (agitator) top surface
  discRadius: 0.158,
  discThickness: 0.008,
};

// Display header above the window.
export const HEADER = { y0: 0.69, y1: 0.778, x0: -0.15, x1: 0.15 };

// Brushed-steel mechanism plate below the window.
export const PLATE = { x0: -0.156, x1: 0.156, y0: 0.085, y1: 0.378, thickness: 0.003 };
export const HANDLE = { x: 0, y: 0.272, ringRadius: 0.066, knobRadius: 0.052 };
export const COIN = { x: 0.112, y: 0.338 };
export const LABEL = { x: -0.108, y: 0.338 };

// Exit opening, the cup behind it and the hinged flap.
export const EXIT = { x0: -0.066, x1: 0.066, y0: 0.103, y1: 0.188, radius: 0.012 };
export const CUP = { floor: 0.106, back: 0.095 };   // cup floor height, cup back wall z
export const FLAP = { hingeY: EXIT.y1 - 0.002, z: FRONT_Z + 0.002, height: 0.083, width: 0.128, thickness: 0.003 };

// Capsules (65 mm is the most common gashapon size).
export const CAPSULE_R = 0.0325;
export const CAPSULE_COUNT = 64;

// Where the dispensing wheel takes a capsule.
export const DISPENSE_POINT = { x: 0.0, z: -0.12 };  // back-centre: the pile in front hides the hand-off
// Hidden chute inside the mechanism chamber: capsule is released here and rolls to the cup.
export const CHUTE_SPAWN = { x: 0.0, y: 0.262, z: 0.03 };

// Gear ratio: one handle turn advances the dispensing disc by a quarter turn.
export const DISC_RATIO = 0.25;

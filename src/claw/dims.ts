// Claw machine dimensions, metres, in the machine's own frame: origin on the floor at the
// cabinet centre, Y up, +Z toward the player. Glass play box on a lower cabinet, prize chute
// in the front-left corner, gantry under the marquee.
export const CM = { w: 0.84, d: 0.84, h: 1.92 };
export const FRONT_Z = CM.d / 2;
export const BODY_TOP = 0.98;                     // top of the lower cabinet
export const FLOOR_Y = 1.0;                       // the pit floor the prizes sit on
export const BOX_TOP = 1.66;                      // top of the glass, bottom of the marquee
export const IN = 0.38;                           // play area half-size (x and z)
export const GLASS = { inset: 0.4, y0: BODY_TOP, y1: BOX_TOP };

// Prize hole in the front-left corner, with a low acrylic guard on its two inner sides.
export const HOLE = { x0: -IN, x1: -0.17, z0: 0.17, z1: IN, guard: 0.09 };
// Shaft below the hole, down to a sloped floor behind the prize door.
export const SHAFT = { bottomBack: [HOLE.z0, 0.36] as [number, number], bottomFront: [FRONT_Z - 0.01, 0.22] as [number, number] };
export const DOOR = { x0: HOLE.x0 + 0.01, x1: HOLE.x1 - 0.01, y0: 0.2, y1: 0.44, hingeY: 0.436, z: FRONT_Z + 0.004, thickness: 0.004 };

// Gantry and claw.
export const GANTRY_Y = 1.6;
export const TRAVEL = { x: 0.3, z: 0.28 };
export const HOME = { x: (HOLE.x0 + HOLE.x1) / 2 + 0.01, z: (HOLE.z0 + HOLE.z1) / 2 - 0.01 };
export const CABLE = { min: 0.13, max: 0.47 };
export const HUB = { r: 0.03, h: 0.05 };
export const FINGER = { root: 0.022, open: 0.62, idle: 0.32, closed: -0.16 };

// Control panel ledge in front of the glass, and its joystick: ball-top height above the base,
// how far (m, at the ball) a full deflection is, and the lever's tilt at full deflection.
export const PANEL = { y: 0.93, depth: 0.14, h: 0.07 };
export const STICK = { ball: 0.075, travel: 0.045, tilt: 0.38 };

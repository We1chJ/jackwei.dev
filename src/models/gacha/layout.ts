// Dimensions shared between the generated model, the physics scene and the UI.
// Source of truth: 3d/gacha-machine/object-sculpt-spec.json (1 unit = dome diameter D).
export const DOME_CENTER: [number, number, number] = [0, 0.78, 0];
export const DOME_RADIUS = 0.5;
export const FLOOR_Y = 0.38;              // top of the capsule floor cup (world)
export const FLOOR_RADIUS = 0.3;
export const CAPSULE_RADIUS = 0.095;
export const CRANK_AXLE: [number, number, number] = [0, -0.13, 0.37];
export const TRAY_MOUTH: [number, number, number] = [-0.346, -0.194, 0.375];
export const TRAY_SIZE = { w: 0.23, h: 0.154 };

export const CAPSULE_COLOURS: Record<string, string> = {
  pink: '#FF7A9E', mint: '#5FE3B1', sky: '#5BC8FF', grape: '#B48CFF', yellow: '#FFC800',
};

// Spawn positions (dome-local) from the spec; colours cycle as in the reference.
export const CAPSULES: { colour: keyof typeof CAPSULE_COLOURS; local: [number, number, number] }[] = [
  { colour: 'mint', local: [-0.26, -0.305, 0.0] }, { colour: 'yellow', local: [-0.087, -0.305, 0.05] },
  { colour: 'pink', local: [0.087, -0.305, 0.05] }, { colour: 'sky', local: [0.26, -0.305, 0.0] },
  { colour: 'pink', local: [-0.18, -0.14, -0.05] }, { colour: 'mint', local: [0.0, -0.14, -0.08] },
  { colour: 'sky', local: [0.18, -0.14, -0.05] }, { colour: 'grape', local: [0.36, -0.14, -0.05] },
  { colour: 'grape', local: [-0.09, 0.025, 0.02] }, { colour: 'yellow', local: [0.09, 0.025, 0.02] },
];

export function capsuleWorld(i: number): [number, number, number] {
  const [x, y, z] = CAPSULES[i].local;
  return [DOME_CENTER[0] + x, DOME_CENTER[1] + y, DOME_CENTER[2] + z];
}

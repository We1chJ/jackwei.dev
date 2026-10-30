// Line-art outline of the hero scene for the loading screen: each machine as its main blocks
// (only the faces the hero camera sees) plus the features that make it recognisable, and the name
// as the front faces of its 3D letters. Projected with the hero camera, so every outline lies
// exactly where its machine will land. Plain maths: this runs before three.js has loaded.
import { SPOT } from './layout';
import { LETTER, glyphContours, heroCam, nameLayout, nameToWorld, project, type FontData, type V3 } from './heroName';
import type { MachineId } from './store';

type Box = [number, number, number, number, number, number];            // x0 x1 y0 y1 z0 z1
type Rect = [number, number, number, number];                            // x0 x1 y0 y1 on the front face
type Spec = { boxes: Box[]; front: number; rects: Rect[]; circles: [number, number, number][] };

// Machine-local metres (x about the machine's spot), simplified from each cabinet's dims.
const S = 2.3;   // the gashapon's scale
const SPECS: Record<MachineId, Spec> = {
  claw: {
    boxes: [[-0.42, 0.42, 0, 0.98, -0.42, 0.42], [-0.42, 0.42, 0.98, 1.66, -0.42, 0.42], [-0.42, 0.42, 1.66, 1.92, -0.42, 0.42], [-0.42, 0.42, 0.88, 0.95, 0.42, 0.56]],
    front: 0.42,
    rects: [[-0.37, -0.18, 0.2, 0.44], [-0.4, 0.4, 1.0, 1.64], [-0.3, 0.3, 1.7, 1.88]],
    circles: [[0.08, 0.62, 0.05]],
  },
  gacha: {
    boxes: [[-0.18 * S, 0.18 * S, 0, 0.8 * S, -0.19 * S, 0.19 * S]],
    front: 0.19 * S,
    rects: [[-0.15 * S, 0.15 * S, 0.4 * S, 0.665 * S], [-0.15 * S, 0.15 * S, 0.69 * S, 0.778 * S], [-0.156 * S, 0.156 * S, 0.085 * S, 0.378 * S], [-0.066 * S, 0.066 * S, 0.103 * S, 0.188 * S]],
    circles: [[0, 0.272 * S, 0.066 * S]],
  },
  vending: {
    boxes: [[-0.46, 0.46, 0, 1.83, -0.4, 0.4]],
    front: 0.4,
    rects: [[-0.43, 0.19, 0.58, 1.66], [-0.43, 0.435, 1.69, 1.8], [-0.36, 0.1, 0.16, 0.36], [0.235, 0.415, 1.404, 1.456], [0.245, 0.405, 1.1, 1.3]],
    circles: [],
  },
};

export type Pt = [number, number];                                       // normalised screen coordinates
export type Part = { id: MachineId | 'name'; depth: number; faces: Pt[][]; lines: Pt[][] };

function machinePart(id: MachineId, aspect: number): Part {
  const c = heroCam(aspect), ox = SPOT[id].x, sp = SPECS[id];
  const P = (p: V3): Pt => { const q = project(c, p); return [q[0], q[1]]; };
  const faces: Pt[][] = [];
  for (const [x0, x1, y0, y1, z0, z1] of sp.boxes) {
    const X0 = ox + x0, X1 = ox + x1;
    const quads: [V3, V3[]][] = [
      [[0, 0, 1], [[X0, y0, z1], [X1, y0, z1], [X1, y1, z1], [X0, y1, z1]]],
      [[0, 0, -1], [[X1, y0, z0], [X0, y0, z0], [X0, y1, z0], [X1, y1, z0]]],
      [[1, 0, 0], [[X1, y0, z1], [X1, y0, z0], [X1, y1, z0], [X1, y1, z1]]],
      [[-1, 0, 0], [[X0, y0, z0], [X0, y0, z1], [X0, y1, z1], [X0, y1, z0]]],
      [[0, 1, 0], [[X0, y1, z1], [X1, y1, z1], [X1, y1, z0], [X0, y1, z0]]],
    ];
    for (const [n, q] of quads) {
      // Only the faces turned toward the camera.
      const mid = q.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4] as V3, [0, 0, 0] as V3);
      const toCam = [c.pos[0] - mid[0], c.pos[1] - mid[1], c.pos[2] - mid[2]];
      if (n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2] > 0) faces.push(q.map(P));
    }
  }
  const z = sp.front + 0.002;
  const lines = [
    ...sp.rects.map(([x0, x1, y0, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => P([ox + x, y, z]))),
    ...sp.circles.map(([cx, cy, r]) => Array.from({ length: 33 }, (_, i) => { const a = (i / 32) * Math.PI * 2; return P([ox + cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]); })),
  ];
  const d = project(c, [ox, 0.9, 0])[2];
  return { id, depth: d, faces, lines };
}

/** The name: the outline of each 3D letter's front face. */
function namePart(font: FontData, aspect: number): Part {
  const c = heroCam(aspect), L = nameLayout(font, aspect), unit = 1 / font.resolution;
  const zFront = LETTER.depth + LETTER.bevelThickness;
  const lines = L.letters.flatMap((l) => glyphContours(font, l.ch).map((contour) => {
    const pts = contour.map(([gx, gy]) => { const q = project(c, nameToWorld(L, l.x + gx * unit, l.y + gy * unit, zFront)); return [q[0], q[1]] as Pt; });
    return [...pts, pts[0]];
  }));
  return { id: 'name', depth: 0, faces: [], lines };
}

/** Every outline in the hero, far to near (so nearer blocks can cover farther ones). */
export function heroOutline(aspect: number, font: FontData | null): Part[] {
  const parts = (['claw', 'gacha', 'vending'] as MachineId[]).map((m) => machinePart(m, aspect)).sort((a, b) => b.depth - a.depth);
  return font ? [...parts, namePart(font, aspect)] : parts;
}

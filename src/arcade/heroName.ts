// Where everything stands in the hero frame, in plain maths (no three.js), so the loading screen
// can draw the scene's outline before the 3D engine has arrived and match it exactly: the hero
// camera's projection, and the placement of the 3D name (each letter's offset, the block's
// position, scale and turn). The 3D scene places its letters with the same numbers.
import { HERO_NAME, VIEW, heroEye } from './layout';

export type V3 = [number, number, number];
export type FontData = { resolution: number; glyphs: Record<string, { ha: number; o?: string }> };

export const NAME_LINES = ['JACK', 'WEI'];
// Letter extrusion, in units of the font size (TextGeometry with size 1).
export const LETTER = { depth: 0.34, bevelThickness: 0.06, bevelSize: 0.035, spacing: -0.02 };
const NARROW = 0.76;      // this font is wider than the name that replaces its outline
const FOV = 26;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => mul(a, 1 / Math.hypot(...a));

export type Cam = { pos: V3; f: V3; r: V3; u: V3; t: number; aspect: number };
/** The hero camera (position, view direction, right and up), for a screen of this aspect ratio. */
export function heroCam(aspect: number): Cam {
  const v = VIEW.hero.main;
  const pos = heroEye(aspect), f = norm(sub(v.target, pos)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  return { pos, f, r, u, t: Math.tan((FOV * Math.PI) / 360), aspect };
}
/** A world point to normalised screen coordinates (-1..1, y up) and its depth along the view. */
export function project(c: Cam, p: V3): [number, number, number] {
  const d = sub(p, c.pos), z = dot(d, c.f);
  return [dot(d, c.r) / (z * c.t * c.aspect), dot(d, c.u) / (z * c.t), z];
}

/** Outline contours of a glyph in font units, curves flattened. */
export function glyphContours(font: FontData, ch: string, steps = 6): [number, number][][] {
  const o = font.glyphs[ch]?.o;
  if (!o) return [];
  const a = o.split(' '), out: [number, number][][] = [];
  let cur: [number, number][] = [], x = 0, y = 0;
  for (let i = 0; i < a.length;) {
    const cmd = a[i++];
    if (cmd === 'm') { if (cur.length) out.push(cur); x = +a[i++]; y = +a[i++]; cur = [[x, y]]; }
    else if (cmd === 'l') { x = +a[i++]; y = +a[i++]; cur.push([x, y]); }
    else if (cmd === 'q') {
      // end point first, then the control point (three.js typeface order)
      const ex = +a[i++], ey = +a[i++], cx = +a[i++], cy = +a[i++];
      for (let s = 1; s <= steps; s++) { const t = s / steps, u = 1 - t; cur.push([u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cy + t * t * ey]); }
      x = ex; y = ey;
    } else if (cmd === 'b') {
      const ex = +a[i++], ey = +a[i++], c1x = +a[i++], c1y = +a[i++], c2x = +a[i++], c2y = +a[i++];
      for (let s = 1; s <= steps; s++) { const t = s / steps, u = 1 - t; cur.push([u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex, u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey]); }
      x = ex; y = ey;
    } else if (cmd === 'z') { /* closed implicitly */ }
  }
  if (cur.length) out.push(cur);
  return out;
}

export type NameLayout = {
  pos: V3; X: V3; Y: V3; Z: V3; k: number; cap: number;
  letters: { ch: string; x: number; y: number; i: number }[];
};
/** The 3D name block: letters' offsets (size-1 units) and the block's placement in the world. */
export function nameLayout(font: FontData, aspect: number): NameLayout {
  const unit = 1 / font.resolution;
  let n = 0, width = 0;
  // Cap height of the extruded letters: the J's top, plus the bevel that grows the outline.
  const cap = Math.max(...glyphContours(font, 'J').flat().map((p) => p[1])) * unit + LETTER.bevelSize;
  const letters = NAME_LINES.flatMap((word, li) => {
    let x = 0;
    return [...word].map((ch) => {
      const l = { ch, x, y: -li * 1.02 * 1.25 * cap - cap, i: n++ };
      x += font.glyphs[ch].ha * unit + LETTER.spacing;
      width = Math.max(width, l.x + 0.7);
      return l;
    });
  });
  const c = heroCam(aspect);
  const dir = norm(add(add(c.f, mul(c.r, HERO_NAME.x * c.t * aspect)), mul(c.u, HERO_NAME.y * c.t)));
  const pos = add(c.pos, mul(dir, HERO_NAME.distance / dot(dir, c.f)));
  const visH = 2 * HERO_NAME.distance * c.t, visW = visH * aspect;
  const k = Math.min((HERO_NAME.line * visH) / cap, (0.38 * visW) / width);
  // Facing the camera, turned about its up axis so the right side recedes.
  const s = Math.sin(HERO_NAME.turn), co = Math.cos(HERO_NAME.turn);
  const X = mul(add(mul(c.r, co), mul(c.f, s)), NARROW), Y = c.u, Z = sub(mul(c.r, s), mul(c.f, co));
  return { pos, X, Y, Z, k, cap, letters };
}
/** A point in the name block's own frame (size-1 units) to world space. */
export function nameToWorld(L: NameLayout, x: number, y: number, z: number): V3 {
  return add(L.pos, mul(add(add(mul(L.X, x), mul(L.Y, y)), mul(L.Z, z)), L.k));
}

import * as THREE from 'three';

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Rounded rectangle path (counter-clockwise), usable as a Shape or a hole. */
export function roundedRect<T extends THREE.Path>(path: T, r: Rect, radius: number): T {
  const { x0, y0, x1, y1 } = r;
  const k = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
  path.moveTo(x0 + k, y0);
  path.lineTo(x1 - k, y0); path.absarc(x1 - k, y0 + k, k, -Math.PI / 2, 0, false);
  path.lineTo(x1, y1 - k); path.absarc(x1 - k, y1 - k, k, 0, Math.PI / 2, false);
  path.lineTo(x0 + k, y1); path.absarc(x0 + k, y1 - k, k, Math.PI / 2, Math.PI, false);
  path.lineTo(x0, y0 + k); path.absarc(x0 + k, y0 + k, k, Math.PI, Math.PI * 1.5, false);
  return path;
}

export const expand = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m });

/** Flat panel in the XY plane extruded toward +Z, with rounded-rect cut-outs. */
export function panel(outer: Rect, outerRadius: number, holes: { rect: Rect; radius: number }[], depth: number, bevel = 0): THREE.ExtrudeGeometry {
  const shape = roundedRect(new THREE.Shape(), outer, outerRadius);
  for (const h of holes) shape.holes.push(roundedRect(new THREE.Path(), h.rect, h.radius));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3,
    curveSegments: 16,
  });
  if (bevel > 0) g.translate(0, 0, bevel);
  return g;
}

/** Bezel frame: a rounded ring around `inner`, `width` wide. */
export function frame(inner: Rect, innerRadius: number, width: number, depth: number, bevel = 0.0015): THREE.ExtrudeGeometry {
  return panel(expand(inner, width), innerRadius + width, [{ rect: inner, radius: innerRadius }], depth, bevel);
}

/**
 * Cabinet side+back shell: a U-shaped horizontal cross-section (rounded back and front
 * corners, open at the front) extruded vertically from y0 to y1.
 */
export function uShell(w: number, d: number, r: number, t: number, y0: number, y1: number): THREE.ExtrudeGeometry {
  // Shape coordinates are (x, -z) so that rotating -90 deg about X puts extrusion on +Y.
  const X = w / 2, Z = d / 2, ri = r - t;
  const s = new THREE.Shape();
  s.moveTo(-X + r, -Z);                                          // front-left, on the front face
  s.absarc(-X + r, -Z + r, r, -Math.PI / 2, -Math.PI, true);     // front-left corner
  s.lineTo(-X, Z - r); s.absarc(-X + r, Z - r, r, Math.PI, Math.PI / 2, true);
  s.lineTo(X - r, Z); s.absarc(X - r, Z - r, r, Math.PI / 2, 0, true);
  s.lineTo(X, -Z + r); s.absarc(X - r, -Z + r, r, 0, -Math.PI / 2, true);
  s.lineTo(X - r, -Z + t);                                       // step inside the wall
  s.absarc(X - r, -Z + r, ri, -Math.PI / 2, 0, false);
  s.lineTo(X - t, Z - r); s.absarc(X - r, Z - r, ri, 0, Math.PI / 2, false);
  s.lineTo(-X + r, Z - t); s.absarc(-X + r, Z - r, ri, Math.PI / 2, Math.PI, false);
  s.lineTo(-X + t, -Z + r); s.absarc(-X + r, -Z + r, ri, Math.PI, Math.PI * 1.5, false);
  s.lineTo(-X + r, -Z);
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 12 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

/** Solid rounded slab (top lid, plinth) from the cabinet footprint. */
export function slab(w: number, d: number, r: number, y0: number, h: number, bevel: number): THREE.ExtrudeGeometry {
  const s = roundedRect(new THREE.Shape(), { x0: -w / 2, y0: -d / 2, x1: w / 2, y1: d / 2 }, r);
  const g = new THREE.ExtrudeGeometry(s, { depth: h - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 4, curveSegments: 12 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  return g;
}

/** Arc of points (for lathe profiles) from angle a0 to a1 around (cx, cy). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n: number): THREE.Vector2[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * (i / n);
    return new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  });
}

/** Clear top half of a capsule: a dome with a slightly flared rim that overlaps the bottom. */
export function capsuleTop(R: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(R * 1.012, -R * 0.055),
    new THREE.Vector2(R * 1.018, -R * 0.02),
    new THREE.Vector2(R * 1.012, 0),
    ...arc(0, 0, R * 1.012, 0, Math.PI / 2, 24).slice(1),
  ];
  return new THREE.LatheGeometry(pts, 48);
}

/** Opaque bottom half: a dome whose collar slides up inside the top half. */
export function capsuleBottom(R: number): THREE.LatheGeometry {
  const pts = [
    ...arc(0, 0, R, -Math.PI / 2, 0, 24),
    new THREE.Vector2(R * 0.985, R * 0.02),
    new THREE.Vector2(R * 0.985, R * 0.12),
    new THREE.Vector2(R * 0.93, R * 0.13),
  ];
  return new THREE.LatheGeometry(pts, 48);
}

/**
 * Lathe around Y, then turned so the lathe axis faces +Z (out of the front panel).
 * Profiles are written from the axis outward (top first); LatheGeometry only faces outward
 * when the profile runs the other way, so the points are reversed here.
 */
export function frontLathe(points: [number, number][], segments = 64): THREE.LatheGeometry {
  const g = new THREE.LatheGeometry([...points].reverse().map(([x, y]) => new THREE.Vector2(x, y)), segments);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Smooth profile helper: rounded step from radius r0 to r1 at heights. */
export function knobProfile(r: number, h: number, edge: number): [number, number][] {
  const pts: [number, number][] = [[0, h]];
  for (const p of arc(r - edge, h - edge, edge, Math.PI / 2, 0, 10)) pts.push([p.x, p.y]);
  pts.push([r, edge * 0.4]);
  pts.push([r - edge * 0.3, 0]);
  return pts;
}

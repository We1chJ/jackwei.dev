// drei's RoundedBox, with each shape built once and shared. Its smooth shading (toCreasedNormals) is slow on
// small boxes, where every vertex falls in the same centimetre bucket, and the machines repeat the same few
// shapes (corner posts, keypad keys). Same geometry as drei's, so they look the same.
import { ExtrudeGeometry, Shape } from 'three';
import { toCreasedNormals } from 'three-stdlib';
import type { ThreeElements } from '@react-three/fiber';

const eps = 0.00001;
const shapes = new Map<string, ExtrudeGeometry>();

function build(width: number, height: number, depth: number, radius: number, smoothness: number) {
  const shape = new Shape();
  const r = radius - eps;
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, height - r * 2, eps, Math.PI, Math.PI / 2, true);
  shape.absarc(width - r * 2, height - r * 2, eps, Math.PI / 2, 0, true);
  shape.absarc(width - r * 2, eps, eps, 0, -Math.PI / 2, true);
  const geometry = new ExtrudeGeometry(shape, {
    depth: depth - radius * 2, bevelEnabled: true, bevelSegments: 8, steps: 1,
    bevelSize: radius - eps, bevelThickness: radius, curveSegments: smoothness,
  });
  geometry.center();
  toCreasedNormals(geometry, 0.4);
  return geometry;
}

type Props = Omit<ThreeElements['mesh'], 'args'> & { args: [number, number, number]; radius?: number; smoothness?: number };

export function RoundedBox({ args: [width, height, depth], radius = 0.05, smoothness = 4, ...rest }: Props) {
  const key = `${width} ${height} ${depth} ${radius} ${smoothness}`;
  let geometry = shapes.get(key);
  if (!geometry) shapes.set(key, (geometry = build(width, height, depth, radius, smoothness)));
  return <mesh geometry={geometry} {...rest} />;
}

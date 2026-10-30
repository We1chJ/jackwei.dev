// Shared choreography for handing a prize to the visitor (gashapon capsule, vending card, claw
// plushie): where it hovers, and the curves that make the trip feel physical.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t: number, s = 1.6) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** The prize hovers in front of the camera, a little right of centre, whatever the view. */
export function holdPoint(camera: THREE.Camera, out: THREE.Vector3, distance = 0.62, right = 0.07, down = 0.03) {
  const dir = new THREE.Vector3(), side = new THREE.Vector3();
  camera.getWorldDirection(dir);
  side.crossVectors(dir, camera.up).normalize();
  return out.copy(camera.position).addScaledVector(dir, distance).addScaledVector(side, right).addScaledVector(camera.up, -down);
}

/** Cubic Bezier through four points. */
export function bezier(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number) {
  const u = 1 - t;
  return out.set(0, 0, 0)
    .addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t)
    .addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
}

/** Squash-and-stretch after landing: a damped wobble around scale 1 (y squashes, x/z bulge). */
export function landWobble(out: THREE.Vector3, sinceLanding: number, amount = 0.12) {
  const w = amount * Math.exp(-7 * sinceLanding) * Math.cos(17 * sinceLanding);
  return out.set(1 + w * 0.5, 1 - w, 1 + w * 0.5);
}

/** Spin that unwinds to rest: whole turns, so it starts and ends at the same orientation. */
export function spinDown(q: THREE.Quaternion, axis: THREE.Vector3, turns: number, k: number) {
  return q.setFromAxisAngle(axis, -TAU * turns * (1 - k));
}

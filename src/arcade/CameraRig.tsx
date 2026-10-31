// Glides the camera to whichever machine has focus (and between that machine's close-ups), and
// lets a click on an unfocused machine focus it (that click does nothing else, so a stray click
// never presses a button).
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { INTERIOR_LIGHT, VIEW, heroEye } from './layout';
import { intro } from './intro';
import { arcade, type Focus, type Shot } from './store';

const GLIDE = 1.35, SHOT_GLIDE = 1.0;   // seconds: to another machine, to another close-up
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** While a glide is on, the hero camera leaves the camera alone (Hero.tsx). */
export const rig = { gliding: false };

export default function CameraRig() {
  const { camera, gl, scene } = useThree();
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const glide = useRef<null | { t: number; dur: number; arc: number; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; to: Focus; shot: Shot }>(null);
  const last = useRef({ focus: arcade.get().focus, shot: arcade.get().shot });
  const light = useRef<THREE.PointLight>(null);

  useEffect(() => arcade.subscribe(() => {
    const { focus, shot } = arcade.get();
    if (!controls || (focus === last.current.focus && shot === last.current.shot)) return;
    const newMachine = focus !== last.current.focus;
    if (newMachine && shot !== 'main') { arcade.set({ shot: 'main' }); return; }   // arrive on the main framing
    last.current = { focus, shot };
    glide.current = { t: 0, dur: newMachine ? GLIDE : SHOT_GLIDE, arc: newMachine ? 0.5 : 0.08, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), to: focus, shot };
    rig.gliding = true;
    controls.enabled = false;
  }), [camera, controls]);
  const size = useThree((s) => s.size);

  useFrame((_, dt) => {
    // Interior light: fades out, hops to the newly focused machine, fades back in.
    const L = light.current, want = INTERIOR_LIGHT[arcade.get().focus];
    if (L) {
      const there = L.position.distanceToSquared(new THREE.Vector3(...want.position)) < 1e-6;
      const target = there ? want.intensity : 0;
      L.intensity += (target - L.intensity) * (1 - Math.exp(-6 * dt));
      if (!there && L.intensity < 0.02) { L.position.set(...want.position); L.distance = want.distance; }
    }
    const g = glide.current;
    if (!g || !controls) return;
    const v = VIEW[g.to][g.shot];
    // Back to the hero: its eye depends on the screen shape (Hero.tsx takes over from there).
    const eye = g.to === 'hero' ? heroEye(size.width / size.height) : v.position;
    g.t = Math.min(1, g.t + dt / g.dur);
    const k = ease(g.t);
    controls.target.lerpVectors(g.fromTarget, new THREE.Vector3(...v.target), k);
    // Arc slightly backwards mid-glide, like a person stepping back to look at the next machine.
    camera.position.lerpVectors(g.fromPos, new THREE.Vector3(...eye), k);
    camera.position.z += Math.sin(Math.PI * k) * g.arc;
    camera.lookAt(controls.target);
    if (g.t >= 1) {
      glide.current = null;
      rig.gliding = false;
      controls.minDistance = v.minDistance;
      controls.maxDistance = v.maxDistance;
      controls.enabled = true;
      controls.update();
    }
  });

  // Click on another machine (or one in the hero, once they have landed): focus it and swallow the
  // click (capture phase, registered first). In the hero the pointer shows which ones are clickable.
  useEffect(() => {
    const el = gl.domElement.parentElement ?? gl.domElement;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const roots = () => { const out: THREE.Object3D[] = []; scene.traverse((o) => { if (o.userData.machine) out.push(o); }); return out; };
    const under = (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      let o: THREE.Object3D | null = ray.intersectObjects(roots(), true)[0]?.object ?? null;
      while (o && !o.userData.machine) o = o.parent;
      return o?.userData.machine as Exclude<Focus, 'hero'> | undefined;
    };
    const onDown = (e: PointerEvent) => {
      if (arcade.get().focus === 'hero' && intro.get().phase !== 'done') return;
      const m = under(e);
      if (m && m !== arcade.get().focus) {
        arcade.set({ focus: m, shot: 'main' });
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (arcade.get().focus !== 'hero') return;
      el.style.cursor = intro.get().phase === 'done' && under(e) ? 'pointer' : '';
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove);
    return () => { el.removeEventListener('pointerdown', onDown, { capture: true }); el.removeEventListener('pointermove', onMove); };
  }, [gl, camera, scene]);

  const first = INTERIOR_LIGHT[arcade.get().focus];
  return <pointLight ref={light} color="#FFF3E0" intensity={first.intensity} distance={first.distance} decay={1} position={first.position} />;
}

// Glides the camera to whichever machine has focus (and between that machine's close-ups), and
// lets a click on an unfocused machine focus it (that click does nothing else, so a stray click
// never presses a button).
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { INTERIOR_LIGHT, VIEW } from './layout';
import { arcade, type Focus, type Shot } from './store';

const GLIDE = 1.35, SHOT_GLIDE = 1.0;   // seconds: to another machine, to another close-up
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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
    controls.enabled = false;
  }), [camera, controls]);

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
    g.t = Math.min(1, g.t + dt / g.dur);
    const k = ease(g.t);
    controls.target.lerpVectors(g.fromTarget, new THREE.Vector3(...v.target), k);
    // Arc slightly backwards mid-glide, like a person stepping back to look at the next machine.
    camera.position.lerpVectors(g.fromPos, new THREE.Vector3(...v.position), k);
    camera.position.z += Math.sin(Math.PI * k) * g.arc;
    camera.lookAt(controls.target);
    if (g.t >= 1) {
      glide.current = null;
      controls.minDistance = v.minDistance;
      controls.maxDistance = v.maxDistance;
      controls.enabled = true;
      controls.update();
    }
  });

  // Click on another machine: focus it and swallow the click (capture phase, registered first).
  useEffect(() => {
    const el = gl.domElement.parentElement ?? gl.domElement;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const roots = () => { const out: THREE.Object3D[] = []; scene.traverse((o) => { if (o.userData.machine) out.push(o); }); return out; };
    const onDown = (e: PointerEvent) => {
      if (arcade.get().focus === 'hero') return;   // the hero is a view, not a menu (for now)
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(roots(), true)[0];
      let o: THREE.Object3D | null = hit?.object ?? null;
      while (o && !o.userData.machine) o = o.parent;
      const m = o?.userData.machine as Exclude<Focus, 'hero'> | undefined;
      if (m && m !== arcade.get().focus) {
        arcade.set({ focus: m, shot: 'main' });
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    return () => el.removeEventListener('pointerdown', onDown, { capture: true });
  }, [gl, camera, scene]);

  const first = INTERIOR_LIGHT[arcade.get().focus];
  return <pointLight ref={light} color="#FFF3E0" intensity={first.intensity} distance={first.distance} decay={1} position={first.position} />;
}

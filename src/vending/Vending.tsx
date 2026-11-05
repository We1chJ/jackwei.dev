// The card vending machine's mechanism. Type a code (row letter, then column number) on the
// keypad; that coil turns once and walks its cards forward. Choreographed: the coil turn (the
// cards ride the wire as kinematic bodies) and the hand-off to the visitor. Physical (Rapier):
// the front card tipping off the shelf, falling, tumbling and landing in the bin behind a hinged
// push-flap (src/arcade/flap.ts): push it in (drag it any way, or click) and the card is drawn out
// under it on its own physics, lifting the flap as it passes.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, RigidBody, useRevoluteJoint, type CollisionEnterPayload, type RapierRigidBody } from '@react-three/rapier';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import { SOFTWARE } from '../data/software';
import { errorBeep, flapSound, jingle, keyBeep, motor, thud } from '../gacha/sound';
import { SPOT } from '../arcade/layout';
import { sparkle } from '../arcade/Sparkles';
import { arcade, wantShot } from '../arcade/store';
import { TAU, bezier, clamp01, easeInOut, easeOut, easeOutBack, holdPoint, landWobble, spinDown } from '../arcade/present';
import { draw, pushFlap } from '../arcade/flap';
import { onImpact } from '../arcade/intro';
import { ledDisplay } from './art';
import { CardBody, Cards } from './Card';
import { itemOf, itemPoint } from '../arcade/instances';
import { FlapVisual, Highlights, VG, VendingColliders, VendingVisual, vendMaterials } from './Cabinet';
import { BIN, BIN_FLAP, COIL, COLS, COL_X, INSIDE, PER_COIL, ROWS, SHELF, SHELF_Y, SLAB, WINDOW, slotZ } from './dims';
import { vendActions, vending } from './store';

const OX = SPOT.vending.x;
const COILS = ROWS.length * COLS;
const TURN_TIME = 1.6;
const FLAP_OPEN = 1.05;                    // how far a push takes it in; a card coming out lifts it the rest of the way
const FLAP_MAX = 1.3;
const DRAW_TIME = 3;                       // a card that will not come out in this long is left for another try
const ATTRACT = 'PRESS A LETTER, THEN A NUMBER   *   STAR = SURPRISE ME   *';
type Mode = 'shelf' | 'falling' | 'bin' | 'out' | 'land' | 'held' | 'return';

// A thick slab under the bin's sloped floor, its top face on the floor: a card landing at full speed
// punches a corner through the cabinet's thin one and is kicked out of the bin.
const SLOPE = (() => {
  const [z0, y0] = BIN.floorBack, [z1, y1] = BIN.floorFront;
  const dz = z1 - z0, dy = y1 - y0, length = Math.hypot(dz, dy), angle = -Math.atan2(dy, dz), T = 0.03;
  return { length, angle, T, center: [(BIN.x0 + BIN.x1) / 2, (y0 + y1) / 2 - Math.cos(angle) * T, (z0 + z1) / 2 - Math.sin(angle) * T] as [number, number, number] };
})();

const rowOf = (c: number) => Math.floor(c / COLS);
const slotPos = (c: number, k: number, advance = 0) => ({ x: OX + COL_X[c % COLS], y: SHELF_Y[rowOf(c)] + SLAB.h / 2 + 0.0005, z: slotZ(k) + advance });
const codeOf = (c: number) => `${ROWS[rowOf(c)]}${(c % COLS) + 1}`;

export default function Vending() {
  const { camera, gl } = useThree();
  // A coil per project, in order from A1; the coils past the last project stay empty.
  const filled = Math.min(COILS, SOFTWARE.length);
  const items = useMemo(() => Array.from({ length: filled * PER_COIL }, (_, i) => ({ coil: Math.floor(i / PER_COIL), project: Math.floor(i / PER_COIL) })), [filled]);
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const scales = useRef(items.map(() => new THREE.Vector3(1, 1, 1)));
  const cardMeshes = useRef<THREE.InstancedMesh[]>([]);
  const projects = useMemo(() => items.map((it) => it.project), [items]);
  const mode = useRef<Mode[]>(items.map(() => 'shelf'));
  const coils = useRef<number[][]>(Array.from({ length: COILS }, (_, c) => (c < filled ? Array.from({ length: PER_COIL }, (_, k) => c * PER_COIL + k) : [])));
  const coilGroups = useRef<(THREE.Group | null)[]>([]);
  const keys = useRef(new Map<string, THREE.Object3D>());
  const pressedAt = useRef(new Map<string, number>());
  const flap = useRef<RapierRigidBody>(null), flapAnchor = useRef<RapierRigidBody>(null);
  const flapGroup = useRef<THREE.Group>(null);
  const joint = useRevoluteJoint(flapAnchor, flap, [[0, 0, 0], [0, 0, 0], [1, 0, 0], [0, FLAP_MAX]]);
  const door = useMemo(() => pushFlap(FLAP_OPEN, () => flapSound(), FLAP_MAX), []);
  const bin = useRef<THREE.Mesh>(null);
  const flapDown = useRef<null | { x: number; y: number }>(null);
  // A card being drawn out of the bin: since when.
  const drawing = useRef(-1);
  const led = useMemo(() => ledDisplay(), []);
  const slotGlow = useRef<(THREE.Mesh | null)[]>([]), binGlow = useRef<THREE.Mesh>(null);
  const ui = useRef({ hover: '', used: false, scroll: true, scrollAt: 0, lastDraw: 0 });
  const s = useRef({ t: 0, row: null as number | null, ledResetAt: -1, heldAt: 0 });
  const turn = useRef<null | { coil: number; t: number; dropped: boolean }>(null);
  const anim = useRef(new Map<number, { kind: 'out' | 'land' | 'return' | 'refill'; t: number; from: THREE.Vector3; fromQ: THREE.Quaternion; prev?: number }>());
  const rest = useRef(new Map<number, number>());
  const stuck = useRef(new Map<number, number>());
  const [vTmp, hTmp, oTmp, c1, c2, axis] = useMemo(() => Array.from({ length: 6 }, () => new THREE.Vector3()), []);
  const [qTmp, sTmp, rTmp] = useMemo(() => [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()], []);
  const eTmp = useMemo(() => new THREE.Euler(), []);

  // ---------- LED ----------
  const idleText = () => (mode.current.includes('bin') ? 'TAKE CARD' : 'SELECT');
  const say = (text: string, hold = 0) => {
    ui.current.scroll = text === 'SELECT';                 // idle: scroll the how-to instead
    if (ui.current.scroll) ui.current.scrollAt = s.current.t; else led.show(text);
    s.current.ledResetAt = hold ? s.current.t + hold : -1;
  };

  // ---------- actions ----------
  const vend = (c: number) => {
    s.current.row = null;
    if (!coils.current[c].length) { errorBeep(); say(`${codeOf(c)} EMPTY`, 1.4); return; }
    say(`${codeOf(c)} >>`);
    turn.current = { coil: c, t: 0, dropped: false };
    vending.set({ phase: 'vending' });
    motor(TURN_TIME);
  };

  const press = (key: string) => {
    pressedAt.current.set(key, s.current.t);
    ui.current.used = true;
    keyBeep();
    if (turn.current) { errorBeep(); say('BUSY', 0.8); return; }
    if (key === 'CLR') { s.current.row = null; say(idleText()); return; }
    if (key === '★') {
      const options = coils.current.map((l, c) => (l.length ? c : -1)).filter((c) => c >= 0);
      if (!options.length) { errorBeep(); say('SOLD OUT', 1.4); return; }
      vend(options[Math.floor(Math.random() * options.length)]);
      return;
    }
    const r = ROWS.indexOf(key as (typeof ROWS)[number]);
    if (r >= 0) { s.current.row = r; say(`${key}_`); return; }
    if (s.current.row === null) { errorBeep(); say('ROW FIRST', 1.1); return; }
    vend(s.current.row * COLS + Number(key) - 1);
  };

  const drop = (i: number) => {
    const b = bodies.current[i]!;
    b.setBodyType(RigidBodyType.Dynamic, true);
    b.setLinvel({ x: 0, y: 0, z: 0.14 }, true);
    b.setAngvel({ x: 3.4, y: (Math.random() - 0.5) * 1.6, z: (Math.random() - 0.5) * 0.8 }, true);   // tips forward off the lip
    b.setLinearDamping(2.5);   // flutters down, as a card in a slab does, instead of dropping like a brick
    mode.current[i] = 'falling';
  };

  // The card in the bin nearest the flap (the one to take), or -1.
  const waiting = () => {
    let best = -1, bestZ = -Infinity;
    mode.current.forEach((m, i) => { const b = bodies.current[i]; if (m === 'bin' && b && b.translation().z > bestZ) { bestZ = b.translation().z; best = i; } });
    return best;
  };

  // Reaching in for the card in the bin: the flap is held open and the card drawn out under it.
  const take = () => {
    if (drawing.current >= 0 || waiting() < 0) return;
    drawing.current = s.current.t;
    door.holdOpen(true);
    vending.set({ phase: 'taking' });
  };

  // Out past the flap: up to the visitor it goes, and the flap is let go.
  const taken = (i: number) => {
    const b = bodies.current[i]!;
    const p = b.translation(), q = b.rotation();
    drawing.current = -1;
    door.holdOpen(false);
    b.resetForces(true);
    b.collider(0).setEnabled(false);
    b.setBodyType(RigidBodyType.KinematicPositionBased, true);
    sparkle.burst(p, 28, 0.36);
    mode.current[i] = 'out';
    anim.current.set(i, { kind: 'out', t: 0, from: new THREE.Vector3(p.x, p.y, p.z), fromQ: new THREE.Quaternion(q.x, q.y, q.z, q.w) });
    vending.set({ phase: 'taking' });
  };

  const putBack = () => {
    const i = mode.current.indexOf('held');
    const b = bodies.current[i];
    if (!b) return;
    const p = b.translation(), q = b.rotation();
    mode.current[i] = 'return';
    anim.current.set(i, { kind: 'return', t: 0, from: new THREE.Vector3(p.x, p.y, p.z), fromQ: new THREE.Quaternion(q.x, q.y, q.z, q.w) });
    vending.set({ phase: mode.current.includes('bin') ? 'ready' : 'idle', held: null });
    say(idleText());
  };

  useEffect(() => { vendActions.putBack = putBack; });
  if (import.meta.env.DEV) {
    (window as unknown as { __vending: unknown }).__vending = {
      cards: () => mode.current.map((m, i) => { const b = bodies.current[i]; const p = b?.translation(), v = b?.linvel(); return m !== 'shelf' && p && v ? { i, m, x: +(p.x - OX).toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), v: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)] } : null; }).filter(Boolean),
      flap: () => { const f = flap.current; if (!f) return null; const i = f.principalInertia(), w = f.angvel(); return { mass: f.mass(), inertia: [i.x, i.y, i.z], angvel: [+w.x.toFixed(2), +w.y.toFixed(2), +w.z.toFixed(2)] }; },
    };
  }
  // Leaving the machine: the prize in hand goes back, it can't follow the visitor down the page.
  useEffect(() => arcade.subscribe(() => {
    if (arcade.get().focus === 'vending') return;
    drawing.current = -1; door.holdOpen(false);
    if (mode.current.includes('held')) putBack();
  }), []);

  const onHit = (i: number, p: CollisionEnterPayload) => {
    if (mode.current[i] !== 'falling') return;
    const v = bodies.current[i]?.linvel();
    const speed = v ? Math.hypot(v.x, v.y, v.z) : 0;
    if (speed > 0.25) thud(speed / 2.5);
    const y = bodies.current[i]?.translation().y ?? 1;
    if (speed > 0.3 && y < BIN.y1 + 0.08) flap.current?.applyTorqueImpulse({ x: 0.00015 * Math.min(1, speed), y: 0, z: 0 }, true);   // the flap rattles when a card lands
    void p;
  };

  // Landing on the floor in the hero opening: the bin flap rattles in its frame.
  useEffect(() => onImpact(({ machine }) => {
    if (machine === 'vending') flap.current?.applyTorqueImpulse({ x: 0.0012, y: 0, z: 0 }, true);
  }), []);

  // ---------- input ----------
  useEffect(() => {
    const el = gl.domElement.parentElement ?? gl.domElement;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const hit = (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const targets: THREE.Object3D[] = [...cardMeshes.current, ...keys.current.values()];
      if (flapGroup.current) targets.push(flapGroup.current);
      if (bin.current) targets.push(bin.current);
      // Nearest first; a card only counts where it can be reached for (in the bin) or put back (held).
      for (const h of ray.intersectObjects(targets, true)) {
        const i = itemOf(h);
        if (i >= 0) {
          if (mode.current[i] === 'held') return { kind: 'held' as const };
          if (mode.current[i] === 'bin') return { kind: 'flap' as const };
          continue;
        }
        let o: THREE.Object3D | null = h.object;
        while (o) {
          if (o.userData.vkey) return { kind: 'key' as const, key: o.userData.vkey as string };
          if (o.userData.vflap) return { kind: 'flap' as const };
          o = o.parent;
        }
      }
      return null;
    };
    const down = (e: PointerEvent) => {
      if (arcade.get().focus !== 'vending') return;
      const h = hit(e);
      if (!h) return;
      e.stopPropagation(); e.preventDefault();
      if (h.kind === 'key') press(h.key);
      else if (h.kind === 'flap') {
        // Push it with the pointer; a plain click is a quick push (or a reach for a waiting card).
        door.grab(e.clientX, e.clientY);
        flapDown.current = { x: e.clientX, y: e.clientY };
        try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      } else putBack();
    };
    const up = (e: PointerEvent) => {
      const fd = flapDown.current;
      if (!fd) return;
      flapDown.current = null;
      door.release();
      try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (Math.hypot(e.clientX - fd.x, e.clientY - fd.y) < 6) { if (waiting() >= 0) take(); else door.push(0.35); }
    };
    const move = (e: PointerEvent) => {
      if (door.dragging) { door.drag(e.clientX, e.clientY); return; }
      if (arcade.get().focus !== 'vending' || e.buttons) { ui.current.hover = ''; return; }
      const h = hit(e);
      ui.current.hover = h?.kind === 'key' ? h.key : '';
      el.style.cursor = h ? 'pointer' : 'grab';
    };
    const key = (e: KeyboardEvent) => {
      if (arcade.get().focus !== 'vending' || e.metaKey || e.ctrlKey) return;
      const k = e.key.toUpperCase();
      if ('ABCD1234'.includes(k) && k.length === 1) press(k);
      else if (e.key === 'Backspace' || e.key === 'Delete') press('CLR');
      else if (e.key === 'Escape') putBack();
    };
    el.addEventListener('pointerdown', down, { capture: true });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
    };
  }, [camera, gl]);

  // ---------- simulation step ----------
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30), st = s.current;
    st.t += dt;
    if (st.ledResetAt > 0 && st.t > st.ledResetAt) { st.ledResetAt = -1; say(idleText()); }
    if (import.meta.env.DEV) {
      const counts: Record<string, number> = {};
      mode.current.forEach((m) => { counts[m] = (counts[m] ?? 0) + 1; });
      const i = mode.current.findIndex((m) => m !== 'shelf'), p = i >= 0 ? bodies.current[i]?.translation() : null;
      document.body.dataset.vending = JSON.stringify({
        phase: vending.get().phase, counts, tracked: p ? [+(p.x - OX).toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)] : null, turning: !!turn.current, flap: +door.angle.toFixed(3),
drawing: drawing.current >= 0,
      });
    }

    // Keys: quick press, springy return; backlight waves until first used, brightens on hover/press.
    const focused = arcade.get().focus === 'vending';
    let idx = 0;
    for (const [k, o] of keys.current) {
      const t0 = pressedAt.current.get(k), d = t0 == null ? 9 : st.t - t0;
      const depth = d < 0.035 ? d / 0.035 : Math.exp(-(d - 0.035) * 13) * Math.cos((d - 0.035) * 24);
      o.position.z = o.userData.baseZ - 0.004 * depth;
      const wave = !ui.current.used && focused ? Math.pow(Math.max(0, Math.sin(st.t * 3 - idx * 0.55)), 6) * 0.9 : 0;
      (o.userData.cap as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + wave + (ui.current.hover === k ? 0.6 : 0) + 1.6 * Math.exp(-d * 7);
      idx++;
    }
    if (ui.current.scroll && st.t - ui.current.lastDraw > 0.05) { ui.current.lastDraw = st.t; led.show(ATTRACT, st.t - ui.current.scrollAt); }

    // Guidance: the chosen row's strip lights up and its front cards get a glow; the vending
    // card glows hot; the bin glows while a card waits there.
    const vm = vendMaterials(), pulse = 0.5 + 0.5 * Math.sin(st.t * 5);
    vm.strips.forEach((mat, r) => { mat.emissiveIntensity = st.row === r ? 0.35 + 0.35 * pulse : 0; });
    slotGlow.current.forEach((g, c) => {
      if (!g) return;
      const hot = turn.current?.coil === c && !turn.current.dropped, row = st.row === rowOf(c) && coils.current[c].length > 0;
      g.visible = hot || row;
      g.material = hot ? vm.selectHot : vm.select;
    });
    vm.select.opacity = 0.35 + 0.35 * pulse;
    vm.selectHot.opacity = 0.7 + 0.3 * Math.sin(st.t * 14);
    const cardWaits = mode.current.includes('bin') && vending.get().phase === 'ready';
    if (binGlow.current) binGlow.current.visible = cardWaits;
    vm.binGlow.opacity = 0.45 + 0.45 * pulse;
    if (focused) {
      const ph = vending.get().phase;
      wantShot('vending', mode.current.includes('falling') || ph === 'ready' || ph === 'taking' || ph === 'held' ? 'pickup' : 'main');
    }

    door.step(dt, flap.current, joint.current);
    if (door.dragging && door.angle > 0.6 && drawing.current < 0 && waiting() >= 0) take();   // pushed open: reach in
    // Drawing the card out: once the flap is pushed in far enough, it is pulled along the bin floor and
    // out under the flap (lifting it as it passes); taken once it is through.
    const w = waiting(), wb = w >= 0 ? bodies.current[w] : null;
    if (drawing.current >= 0) {
      if (!wb || st.t - drawing.current > DRAW_TIME) { drawing.current = -1; wb?.resetForces(true); door.holdOpen(false); vending.set({ phase: wb ? 'ready' : 'idle' }); }
      else {
        const p = wb.translation();
        // Only once the flap is up out of its way: pulling sooner pins the card under its edge.
        if (door.angle > 1.15) draw(wb, p.x, p.y + 0.01, BIN_FLAP.z + 0.12, 25, 0.45)
        else wb.resetForces(true);   // an added force stays on until it is reset
      }
    }
    if (wb && wb.translation().z > BIN_FLAP.z + 0.06) taken(w);   // out past the flap

    // Coil turn: the wire walks every card in the coil one pitch forward.
    const tr = turn.current;
    if (tr) {
      tr.t = Math.min(1, tr.t + dt / TURN_TIME);
      const k = easeInOut(tr.t), phi = -TAU * k + 0.14 * Math.sin(Math.PI * clamp01(tr.t / 0.12));
      const g = coilGroups.current[tr.coil];
      if (g) {
        g.rotation.z = phi;
        const buzz = 1 + 0.007 * Math.sin(st.t * 95) * Math.sin(Math.PI * tr.t);
        g.scale.set(buzz, buzz, 1);
      }
      coils.current[tr.coil].forEach((i, slot) => {
        const b = bodies.current[i];
        if (!b || mode.current[i] !== 'shelf') return;
        b.wakeUp();
        const p = slotPos(tr.coil, slot, COIL.pitch * k);
        if (slot === 0 && !tr.dropped && p.z > SHELF.front - 0.003) { tr.dropped = true; drop(i); return; }
        b.setNextKinematicTranslation(p);
        const lean = slot === 0 ? clamp01((p.z - (SHELF.front - 0.026)) / 0.024) * 0.16 : 0;   // tips forward over the lip
        b.setNextKinematicRotation(qTmp.setFromEuler(eTmp.set(lean, 0, Math.sin(phi) * 0.045)));   // the wire nudges it side to side
      });
      if (tr.t >= 1) {
        if (g) { g.rotation.z = 0; g.scale.set(1, 1, 1); }
        if (tr.dropped) coils.current[tr.coil].shift();
        coils.current[tr.coil].forEach((i, slot) => { bodies.current[i]?.setNextKinematicTranslation(slotPos(tr.coil, slot)); bodies.current[i]?.setNextKinematicRotation(qTmp.identity()); });
        turn.current = null;
      }
    }

    // Choreographed segments.
    for (const [i, a] of anim.current) {
      const b = bodies.current[i], sc = scales.current[i];
      if (!b) { anim.current.delete(i); continue; }
      // Rapier won't move a sleeping kinematic body, so keep it awake while it is choreographed.
      b.wakeUp();
      if (a.kind === 'out') {
        a.t += dt;
        const hold = holdPoint(camera, hTmp, 0.58, -0.07, 0.02);
        const t = clamp01(a.t / 0.85), k = easeOut(t);
        c1.copy(a.from).add(oTmp.set(0, 0.05, 0.12));
        c2.copy(hold).add(oTmp.set(0, 0.1, -0.15));
        b.setNextKinematicTranslation(bezier(vTmp, a.from, c1, c2, hold, k));
        const spin = spinDown(sTmp, axis.set(0, 1, 0), 1, k);
        b.setNextKinematicRotation(rTmp.copy(a.fromQ).slerp(camera.quaternion, easeInOut(t)).multiply(spin));
        if (t < 0.85) sparkle.trail(vTmp, 2);
        if (t >= 1) { a.kind = 'land'; a.t = 0; }
      } else if (a.kind === 'land') {
        a.t += dt;
        sc.copy(landWobble(oTmp, a.t, 0.08));
        b.setNextKinematicTranslation(holdPoint(camera, hTmp, 0.58, -0.07, 0.02));
        b.setNextKinematicRotation(camera.quaternion);
        if (a.t > 0.6) {
          sc.setScalar(0.001);   // the page takes over from here: HeldCard.tsx
          anim.current.delete(i); mode.current[i] = 'held'; st.heldAt = st.t;
          vending.set({ phase: 'held', held: items[i].project });
          jingle(); say('ENJOY!', 1.6);
        }
      } else if (a.kind === 'return') {
        // Tossed back: arcs up toward the top of the window and vanishes in a puff, then is
        // restocked at the back of a coil.
        a.t = Math.min(1, a.t + dt / 0.6);
        const k = easeInOut(a.t);
        const top = c2.set(OX + (WINDOW.x0 + WINDOW.x1) / 2, WINDOW.y1 - 0.08, 0.3);
        b.setNextKinematicTranslation(bezier(vTmp, a.from, c1.copy(a.from).add(oTmp.set(0, 0.2, 0)), hTmp.copy(top).add(oTmp.set(0, 0.15, 0.25)), top, k));
        b.setNextKinematicRotation(rTmp.copy(a.fromQ).multiply(spinDown(sTmp, axis.set(0, 1, 0), 1, k)));
        sc.setScalar(Math.max(0.001, 1 - Math.pow(Math.max(0, (a.t - 0.5) / 0.5), 2)));
        if (a.t >= 1) {
          sparkle.burst(top, 20, 0.24);
          const home = coils.current[items[i].coil].length < PER_COIL ? items[i].coil : coils.current.findIndex((l) => l.length < PER_COIL);
          const k2 = coils.current[home].length;
          coils.current[home].push(i);
          items[i].coil = home;
          b.setNextKinematicTranslation(slotPos(home, k2));
          b.setNextKinematicRotation(qTmp.identity());
          b.collider(0).setEnabled(true);
          mode.current[i] = 'shelf';
          a.kind = 'refill'; a.t = 0;
        }
      } else if (a.kind === 'refill') {
        a.t = Math.min(1, a.t + dt / 0.35);
        sc.setScalar(Math.max(0.001, easeOutBack(a.t)));
        if (a.t >= 1) { sc.setScalar(1); anim.current.delete(i); }
      }
    }

    // Falling cards: land in the bin, or get a nudge if one wedges on the way down.
    mode.current.forEach((m, i) => {
      const b = bodies.current[i];
      if (!b) return;
      if (m === 'falling') {
        const p = b.translation(), v = b.linvel(), speed = Math.hypot(v.x, v.y, v.z);
        if (p.y < BIN.y1 + 0.06 && speed < 0.05) {
          const t0 = rest.current.get(i) ?? st.t; rest.current.set(i, t0);
          if (st.t - t0 > 0.3) {
            rest.current.delete(i); mode.current[i] = 'bin'; b.setLinearDamping(0.1);
            if (vending.get().phase !== 'held' && vending.get().phase !== 'taking') vending.set({ phase: 'ready' });
            say('TAKE CARD');
          }
        } else rest.current.delete(i);
        if (p.y > BIN.y1 + 0.06 && speed < 0.02) {
          const t0 = stuck.current.get(i) ?? st.t; stuck.current.set(i, t0);
          if (st.t - t0 > 1) { stuck.current.delete(i); b.applyImpulse({ x: (Math.random() - 0.5) * 0.004, y: 0.003, z: 0.004 }, true); }
        } else stuck.current.delete(i);
      } else if (m === 'held' && !anim.current.has(i)) {
        b.wakeUp();
        // Slow presenting sway: enough turn to make the holo foil shift colour.
        const since = st.t - st.heldAt, blend = clamp01(since / 0.8);
        b.setNextKinematicTranslation(vTmp.copy(holdPoint(camera, hTmp, 0.58, -0.07, 0.02)).add(oTmp.set(0, Math.sin(since * 1.6) * 0.004 * blend, 0)));
        b.setNextKinematicRotation(rTmp.copy(camera.quaternion).multiply(qTmp.setFromEuler(eTmp.set(Math.sin(since * 0.7) * 0.08 * blend, Math.sin(since * 0.9) * 0.55 * blend, 0))));
        if (Math.random() < dt * 1.2) sparkle.twinkle(itemPoint(hTmp, b, oTmp.set((Math.random() - 0.5) * SLAB.w, (Math.random() - 0.5) * SLAB.h, SLAB.t), 1, sTmp));
      }
    });
  });

  const binX = OX + (BIN.x0 + BIN.x1) / 2;
  return (
    <group>
      <group position={[OX, 0, 0]}>
        <VendingVisual
          coilRefs={coilGroups}
          ledTexture={led.texture}
          onKey={(label, o) => { if (o) keys.current.set(label, o); else keys.current.delete(label); }}
        />
      </group>
      <group position={[OX, 0, 0]}><Highlights slotRefs={slotGlow} binRef={binGlow} /></group>
      <VendingColliders x={OX} />
      <RigidBody type="fixed" colliders={false} position={[OX, 0, 0]} collisionGroups={VG.static}>
        <CuboidCollider args={[(INSIDE.x1 - INSIDE.x0) / 2, SLOPE.T, SLOPE.length / 2]} position={SLOPE.center} rotation={[SLOPE.angle, 0, 0]} />
      </RigidBody>
      {/* Bin flap: hinged at its top edge, swings inward only, hangs shut under its own weight. */}
      <RigidBody ref={flapAnchor} type="fixed" colliders={false} position={[binX, BIN_FLAP.hingeY, BIN_FLAP.z]} />
      <RigidBody ref={flap} canSleep={false} colliders={false} position={[binX, BIN_FLAP.hingeY, BIN_FLAP.z]} angularDamping={0.4} collisionGroups={VG.static} ccd>
        {/* The mass goes on the collider: on the body it is ignored, leaving a flap of a third of a gram that whips open at a touch. */}
        <CuboidCollider args={[BIN_FLAP.width / 2, BIN_FLAP.height / 2, BIN_FLAP.thickness / 2]} position={[0, -BIN_FLAP.height / 2, 0]} mass={0.05} />
        <group ref={flapGroup}><FlapVisual /></group>
      </RigidBody>
      {/* The bin opening behind the flap, for the pointer (the flap itself is the usual target). */}
      <mesh ref={bin} position={[binX, (BIN.y0 + BIN.y1) / 2, BIN_FLAP.z - 0.03]} userData={{ vflap: true }}><planeGeometry args={[BIN.x1 - BIN.x0, BIN.y1 - BIN.y0]} /><meshBasicMaterial visible={false} /></mesh>
      {items.map((it, i) => {
        const p = slotPos(it.coil, i % PER_COIL);
        return <CardBody key={i} index={i} position={[p.x, p.y, p.z]} ref={(b) => { bodies.current[i] = b; }} onHit={onHit} />;
      })}
      <Cards projects={projects} bodies={bodies} scales={scales} meshesRef={cardMeshes} />
    </group>
  );
}

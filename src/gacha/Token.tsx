// What is inside a capsule: a small object for each project, built from primitives, sized to fit
// the capsule (about 40 mm). Drawn in the capsule's frame, metres at real size.
import { useMemo } from 'react';
import * as THREE from 'three';
import { materials } from './materials';
import type { Project } from '../data/projects';

let cache: ReturnType<typeof build> | null = null;
const mats = () => (cache ??= build());
function build() {
  const base = materials();
  const plastic = (color: string) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  return {
    chrome: base.chrome,
    gold: new THREE.MeshPhysicalMaterial({ color: '#F2C14A', metalness: 0.9, roughness: 0.25, clearcoat: 0.5 }),
    silver: new THREE.MeshPhysicalMaterial({ color: '#D9DCE1', metalness: 0.9, roughness: 0.3 }),
    yellow: plastic('#FFD23F'), orange: plastic('#FF7A2E'), green: plastic('#3CC46B'), blue: plastic('#2FA4F0'),
    pink: plastic('#FF5C8A'), purple: plastic('#8E5CF5'), navy: plastic('#1F2A5A'), white: plastic('#FAF8F2'),
    black: new THREE.MeshStandardMaterial({ color: '#111113', roughness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#cfe9ff', transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1, depthWrite: false }),
    paper: base.paper,
    led: new THREE.MeshStandardMaterial({ color: '#8affc1', emissive: '#4cff9a', emissiveIntensity: 1.6 }),
  };
}

const crescent = (() => {
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.016, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0.007, 0.004, 0.0135, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0008, bevelSegments: 2 });
})();

/** The token for a project, standing on y = 0 in its own frame. */
export function Token({ project }: { project: Project }) {
  const m = mats();
  const body = useMemo(() => {
    switch (project.id) {
      case 'truly': return (   // a little trophy: demo day's top three
        <group>
          <mesh material={m.black} position={[0, 0.003, 0]}><cylinderGeometry args={[0.011, 0.013, 0.006, 24]} /></mesh>
          <mesh material={m.gold} position={[0, 0.011, 0]}><cylinderGeometry args={[0.003, 0.004, 0.01, 12]} /></mesh>
          <mesh material={m.gold} position={[0, 0.026, 0]}><cylinderGeometry args={[0.013, 0.006, 0.022, 24]} /></mesh>
          {[-1, 1].map((sx) => <mesh key={sx} material={m.gold} position={[sx * 0.014, 0.027, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.006, 0.0016, 8, 20]} /></mesh>)}
        </group>
      );
      case 'afora': return (   // two pieces that fit: team matching
        <group position={[0, 0.011, 0]}>
          <mesh material={m.blue} position={[-0.008, 0, 0]}><boxGeometry args={[0.015, 0.022, 0.014]} /></mesh>
          <mesh material={m.blue} position={[0.001, 0.004, 0]}><cylinderGeometry args={[0.004, 0.004, 0.014, 16]} /></mesh>
          <mesh material={m.orange} position={[0.009, 0, 0]}><boxGeometry args={[0.015, 0.022, 0.014]} /></mesh>
          <mesh material={m.orange} position={[0.0085, 0.0045, 0.0072]}><cylinderGeometry args={[0.0045, 0.0045, 0.0005, 16]} /></mesh>
        </group>
      );
      case 'factuality': return (   // a magnifying glass with a tick in it
        <group position={[0, 0.012, 0]} rotation={[0, 0, 0.6]}>
          <mesh material={m.chrome}><torusGeometry args={[0.012, 0.0022, 10, 32]} /></mesh>
          <mesh material={m.glass}><circleGeometry args={[0.011, 32]} /></mesh>
          <mesh material={m.green} position={[-0.003, -0.003, 0.001]} rotation={[0, 0, -0.8]}><boxGeometry args={[0.0025, 0.007, 0.002]} /></mesh>
          <mesh material={m.green} position={[0.002, -0.0005, 0.001]} rotation={[0, 0, 0.7]}><boxGeometry args={[0.0025, 0.013, 0.002]} /></mesh>
          <mesh material={m.black} position={[0.014, -0.014, 0]} rotation={[0, 0, Math.PI / 4]}><cylinderGeometry args={[0.0028, 0.0028, 0.016, 12]} /></mesh>
        </group>
      );
      case 'rehab-ar': return (   // a dumbbell: physical therapy
        <group position={[0, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
          <mesh material={m.chrome}><cylinderGeometry args={[0.0025, 0.0025, 0.036, 12]} /></mesh>
          {[-1, 1].map((s) => <mesh key={s} material={m.navy} position={[0, s * 0.013, 0]}><cylinderGeometry args={[0.009, 0.009, 0.008, 24]} /></mesh>)}
        </group>
      );
      case 'radar': return (   // a radar dish on a stand
        <group>
          <mesh material={m.black} position={[0, 0.002, 0]}><cylinderGeometry args={[0.008, 0.01, 0.004, 20]} /></mesh>
          <mesh material={m.chrome} position={[0, 0.01, 0]}><cylinderGeometry args={[0.0018, 0.0018, 0.014, 10]} /></mesh>
          <group position={[0, 0.02, 0]} rotation={[-0.9, 0, 0]}>
            <mesh material={m.white} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.016, 0.009, 32, 1, true]} /></mesh>
            <mesh material={m.chrome} position={[0, 0.006, 0]}><cylinderGeometry args={[0.001, 0.001, 0.012, 8]} /></mesh>
            <mesh material={m.pink} position={[0, 0.012, 0]}><sphereGeometry args={[0.0025, 12, 10]} /></mesh>
          </group>
        </group>
      );
      case 'net-ui': return (   // a router with its lights on
        <group>
          <mesh material={m.white} position={[0, 0.006, 0]}><boxGeometry args={[0.03, 0.012, 0.02]} /></mesh>
          {[-0.008, 0, 0.008].map((x) => <mesh key={x} material={m.led} position={[x, 0.012, 0.0065]}><boxGeometry args={[0.003, 0.001, 0.003]} /></mesh>)}
          {[-1, 1].map((s) => <mesh key={s} material={m.black} position={[s * 0.01, 0.02, -0.006]} rotation={[0, 0, -s * 0.25]}><cylinderGeometry args={[0.0012, 0.0014, 0.018, 8]} /></mesh>)}
        </group>
      );
      case 'magnifier': return (   // a lens: the old site's glass over the résumé
        <group position={[0, 0.014, 0]}>
          <mesh material={m.chrome} rotation={[0.3, 0, 0]}><torusGeometry args={[0.013, 0.002, 10, 36]} /></mesh>
          <mesh material={m.glass} rotation={[0.3, 0, 0]}><sphereGeometry args={[0.0128, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
          <mesh material={m.paper} position={[0, -0.008, 0.002]} rotation={[-1.2, 0, 0]}><planeGeometry args={[0.02, 0.014]} /></mesh>
        </group>
      );
      case 'sleep': return (   // a moon: the schedule that is not there
        <group position={[0, 0.016, 0]} rotation={[0, 0, -0.4]}>
          <mesh geometry={crescent} material={m.gold} position={[0, 0, -0.002]} />
        </group>
      );
      case 'duck': return (   // it is a rubber duck
        <group>
          <mesh material={m.yellow} position={[0, 0.009, 0]} scale={[1, 0.8, 1.2]}><sphereGeometry args={[0.012, 24, 16]} /></mesh>
          <mesh material={m.yellow} position={[0, 0.021, 0.008]}><sphereGeometry args={[0.0075, 20, 14]} /></mesh>
          <mesh material={m.orange} position={[0, 0.019, 0.016]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.0035, 0.006, 12]} /></mesh>
          {[-1, 1].map((s) => <mesh key={s} material={m.black} position={[s * 0.004, 0.023, 0.013]}><sphereGeometry args={[0.001, 8, 6]} /></mesh>)}
          <mesh material={m.yellow} position={[0, 0.012, -0.012]} rotation={[0.8, 0, 0]}><coneGeometry args={[0.004, 0.008, 12]} /></mesh>
        </group>
      );
      case 'this-site': return (   // a gacha machine, in a gacha machine
        <group>
          <mesh material={m.yellow} position={[0, 0.001, 0]}><boxGeometry args={[0.02, 0.002, 0.02]} /></mesh>
          <mesh material={m.white} position={[0, 0.011, 0]}><boxGeometry args={[0.018, 0.018, 0.018]} /></mesh>
          <mesh material={m.black} position={[0, 0.008, 0.0092]}><circleGeometry args={[0.003, 16]} /></mesh>
          <mesh material={m.glass} position={[0, 0.02, 0]}><sphereGeometry args={[0.0105, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
          {[[-0.004, 0.024, 0.002, '#FF5C8A'], [0.004, 0.023, -0.001, '#2FA4F0'], [0, 0.021, 0.005, '#22C08A'], [0.001, 0.027, -0.004, '#FFC000']].map(([x, y, z, c], i) => (
            <mesh key={i} position={[x as number, y as number, z as number]}><sphereGeometry args={[0.0028, 12, 8]} /><meshStandardMaterial color={c as string} roughness={0.3} /></mesh>
          ))}
          <mesh material={m.pink} position={[0, 0.03, 0]}><cylinderGeometry args={[0.011, 0.011, 0.002, 24]} /></mesh>
        </group>
      );
      case 'icpc': return (   // a medal on its ribbon
        <group>
          {[-1, 1].map((s) => <mesh key={s} material={m.navy} position={[s * 0.005, 0.026, -0.001]} rotation={[0, 0, s * 0.35]}><boxGeometry args={[0.007, 0.024, 0.0015]} /></mesh>)}
          <mesh material={m.gold} position={[0, 0.011, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.011, 0.011, 0.003, 32]} /></mesh>
          <mesh material={m.yellow} position={[0, 0.011, 0.0016]}><circleGeometry args={[0.0075, 24]} /></mesh>
          <mesh material={m.gold} position={[0, 0.011, 0.0019]}><torusGeometry args={[0.0045, 0.0008, 6, 5]} /></mesh>
        </group>
      );
      default: return (   // a star for anything else
        <mesh material={m.gold} position={[0, 0.014, 0]}><torusKnotGeometry args={[0.008, 0.003, 48, 8, 2, 3]} /></mesh>
      );
    }
  }, [project.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  return body;
}

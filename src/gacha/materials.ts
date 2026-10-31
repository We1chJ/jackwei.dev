// Photoreal PBR material library for the gashapon cabinet and capsules.
import * as THREE from 'three';
import { brushedRoughness, orangePeelNormal } from './textures';

let cache: ReturnType<typeof build> | null = null;
export const materials = () => (cache ??= build());

function build() {
  const peel = orangePeelNormal();
  peel.repeat.set(6, 6);
  const brushed = brushedRoughness();
  brushed.repeat.set(1, 3);

  // Sprayed enamel: diffuse base under a glossy clear coat with orange peel.
  const paint = new THREE.MeshPhysicalMaterial({
    color: '#F7F6F2', roughness: 0.42, metalness: 0,
    clearcoat: 0.9, clearcoatRoughness: 0.14,
    clearcoatNormalMap: peel, clearcoatNormalScale: new THREE.Vector2(0.18, 0.18),
  });
  const paintDark = paint.clone();
  paintDark.color.set('#1A1A1C');

  const glossBlack = new THREE.MeshPhysicalMaterial({ color: '#111113', roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.08 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#1C1C1C', roughness: 0.9 });

  const steel = new THREE.MeshPhysicalMaterial({
    color: '#D4D8DB', metalness: 1, roughness: 0.34, roughnessMap: brushed,
    anisotropy: 0.8, anisotropyRotation: 0,
  });
  const chrome = new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', metalness: 1, roughness: 0.07 });

  // Glass/acrylic reflection layer: black diffuse, additive, so only the Fresnel reflection
  // of the environment shows. Transparent panes over transmissive capsules stay correct.
  const glassReflect = new THREE.MeshPhysicalMaterial({
    color: '#000000', roughness: 0.03, metalness: 0, specularIntensity: 1,
    envMapIntensity: 1.6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const acrylicTint = new THREE.MeshBasicMaterial({ color: '#d8ecff', transparent: true, opacity: 0.045, depthWrite: false });

  const interior = new THREE.MeshStandardMaterial({ color: '#F1F0EC', roughness: 0.82 });
  const disc = new THREE.MeshStandardMaterial({ color: '#D7D6D2', roughness: 0.55 });
  const cavity = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.75 });
  const smoke = new THREE.MeshPhysicalMaterial({
    color: '#1d1d1f', roughness: 0.06, transparent: true, opacity: 0.5,
    clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false,
  });
  const paper = new THREE.MeshStandardMaterial({ color: '#FBFAF5', roughness: 0.92 });

  return { paint, paintDark, glossBlack, rubber, steel, chrome, glassReflect, acrylicTint, interior, disc, cavity, smoke, paper };
}

// Classic gashapon capsules: tinted clear top, opaque coloured bottom.
export const CAPSULE_PALETTE = [
  { name: 'pink', top: '#FF8FB0', bottom: '#FF5C8A' },
  { name: 'sky', top: '#8FD3FF', bottom: '#2FA4F0' },
  { name: 'mint', top: '#8FF0CC', bottom: '#22C08A' },
  { name: 'yellow', top: '#FFE27A', bottom: '#FFC000' },
  { name: 'grape', top: '#C9AEFF', bottom: '#8E5CF5' },
  { name: 'orange', top: '#FFC08F', bottom: '#FF7A2E' },
] as const;

export const capsuleColor = (i: number) => CAPSULE_PALETTE[i % CAPSULE_PALETTE.length];

// One set for every capsule (they are instanced, tinted per capsule): white here, the palette goes
// in as instance colours.
let capsuleCache: { top: THREE.MeshPhysicalMaterial; bottom: THREE.MeshPhysicalMaterial; band: THREE.MeshStandardMaterial } | null = null;
export function capsuleMaterials() {
  return (capsuleCache ??= {
    // Tinted clear plastic: a glossy translucent shell. Not transmission, which makes three.js draw
    // the whole opaque scene a second time every frame.
    top: new THREE.MeshPhysicalMaterial({
      color: '#ffffff', transparent: true, opacity: 0.5, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05,
      specularIntensity: 1, envMapIntensity: 1.2, depthWrite: false,
    }),
    bottom: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.26, clearcoat: 0.7, clearcoatRoughness: 0.1, side: THREE.DoubleSide }),
    band: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
  });
}

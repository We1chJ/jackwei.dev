import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Jack Gacha capsule machine
// Sculpt build pass: form-refinement
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createJackGachaCapsuleMachineModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Jack Gacha capsule machine";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 20.0, "aspect": 0.7058823529411765, "orientation": {"yaw": 0.0, "pitch": 8.0, "roll": 0.0}, "positionHint": [0.0, 0.95, 6.2], "note": "Orthographic-like front elevation; review with a long lens (20 deg) from slightly above so the collar floor and disc caps read. Not solved: no projection route."}, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["housing-cream"] = createSculptMaterial(
    "housing-cream",
    {"id": "housing-cream", "name": "Housing shell, off-white matte plastic", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#FFFDF5", "color": "#FFFDF5", "albedo": {"dominant": "#FFFDF5", "secondary": ["#F3F0E6"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#FFFDF5", "#F3F0E6"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.6, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Body housing. px: fill inside the rounded rectangle 240..960 x 755..1215.", "materialClass": "plastic"},
    options
  );
  materialMap["floor-blue"] = createSculptMaterial(
    "floor-blue",
    {"id": "floor-blue", "name": "Capsule floor, light blue-grey", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#C9DCE8", "color": "#C9DCE8", "albedo": {"dominant": "#C9DCE8", "secondary": ["#B7CBD9"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#C9DCE8", "#B7CBD9"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.5, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "The disc the capsules rest on, visible through the dome bottom (px y 755..800).", "materialClass": "plastic"},
    options
  );
  materialMap["dome-glass"] = createSculptMaterial(
    "dome-glass",
    {"id": "dome-glass", "name": "Dome glass", "type": "physical", "shaderModel": "MeshPhysicalMaterial", "baseColor": "#EAF6FF", "color": "#EAF6FF", "albedo": {"dominant": "#EAF6FF", "secondary": ["#BFE0FF"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#EAF6FF", "#BFE0FF"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.05, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "glass-highlight", "kind": "gloss", "region": "upper-front-left of the sphere, ellipse 0.23 D x 0.11 D rotated -30 deg (px 365..520 x 240..330)", "roughness": 0.02, "notes": "Realised by a key light up-front-left; if the specular does not land there at lighting-pass, add a white decal ellipse.", "evidenceRefs": ["zone-r0c0"]}, {"id": "glass-rim-tint", "kind": "stain", "region": "lower 30% of the sphere", "patinaColor": "#BFE0FF", "dirtAmount": 0.0, "cavityBias": false, "notes": "Reference radial gradient stops: white 0%, white@45% alpha 35%, light blue@55% 70%, mid blue@70% 100%.", "evidenceRefs": ["zone-r1c0", "zone-r1c2"]}], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Transmissive sphere. The reference paints a white ellipse highlight upper-front-left and a blue tint toward the lower rim.", "materialClass": "glass", "transmission": {"base": 0.9}, "ior": {"value": 1.5}, "thickness": {"amount": 0.02}, "attenuationColor": "#DDEFFF", "attenuationDistance": {"value": 2.0}, "envMapIntensity": 1.0},
    options
  );
  materialMap["sticker-white"] = createSculptMaterial(
    "sticker-white",
    {"id": "sticker-white", "name": "Sticker white", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#FFFFFF", "color": "#FFFFFF", "albedo": {"dominant": "#FFFFFF", "secondary": ["#FFFFFF"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#FFFFFF", "#FFFFFF"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.45, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Medallion frame ring, crank disc, capsule bottoms (hand-refined two-tone).", "materialClass": "plastic"},
    options
  );
  materialMap["outline-ink"] = createSculptMaterial(
    "outline-ink",
    {"id": "outline-ink", "name": "Outline ink", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#000000", "color": "#000000", "albedo": {"dominant": "#000000", "secondary": ["#111111"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#000000", "#111111"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.6, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Black outlines, crank knob, capsule seams. Used by the inverted-hull outline shells.", "materialClass": "plastic"},
    options
  );
  materialMap["sign-yellow"] = createSculptMaterial(
    "sign-yellow",
    {"id": "sign-yellow", "name": "Sign plate yellow", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#FFC800", "color": "#FFC800", "albedo": {"dominant": "#FFC800", "secondary": ["#F2A900"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#FFC800", "#F2A900"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.6, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "jack-gacha-text", "kind": "decal", "region": "front face of sign-plate, centred, 80% of plate width", "text": "JACK GACHA", "font": "Lilita One, Arial Black", "textColor": "#000000", "rotationDeg": -2, "notes": "Canvas-rendered text texture on the +Z face only.", "evidenceRefs": ["zone-r2c1"]}], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Yellow rounded plate under the dome with black text.", "materialClass": "plastic"},
    options
  );
  materialMap["medallion-face"] = createSculptMaterial(
    "medallion-face",
    {"id": "medallion-face", "name": "Medallion face with mascot decal", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#FFC800", "color": "#FFC800", "albedo": {"dominant": "#FFC800", "secondary": ["#F2A900"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#FFC800", "#F2A900"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.5, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "mascot-decal", "kind": "decal", "region": "+Z cap of medallion, full disc", "imageSource": "docs/assets/mascot.jpg", "notes": "Hand-refined: TextureLoader on the cap only; the cylinder side stays yellow.", "evidenceRefs": ["zone-r0c1"]}], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Yellow disc face; the mascot image is applied as a decal on the +Z cap.", "materialClass": "plastic"},
    options
  );
  materialMap["crank-pink"] = createSculptMaterial(
    "crank-pink",
    {"id": "crank-pink", "name": "Crank bar pink", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#FF7A9E", "color": "#FF7A9E", "albedo": {"dominant": "#FF7A9E", "secondary": ["#F06A8E"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#FF7A9E", "#F06A8E"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.4, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "The pink rounded bar on the crank disc.", "materialClass": "plastic"},
    options
  );
  materialMap["tray-dark"] = createSculptMaterial(
    "tray-dark",
    {"id": "tray-dark", "name": "Tray opening near-black", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#1A1A1A", "color": "#1A1A1A", "albedo": {"dominant": "#1A1A1A", "secondary": ["#3A3A3A"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#1A1A1A", "#3A3A3A"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.8, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "tray-lip", "kind": "ridge", "region": "top 12% of the tray front face", "color": "#3A3A3A", "notes": "Lighter inner lip; realised as a thin box in hand refinement if the override alone does not read.", "evidenceRefs": ["zone-r2c0"]}], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Dark chute opening at front-lower-left; a lighter lip (#3A3A3A) along the top edge.", "materialClass": "plastic"},
    options
  );
  materialMap["capsule-pink"] = createSculptMaterial(
    "capsule-pink",
    {"id": "capsule-pink", "name": "Capsule top, pink", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#FF7A9E", "color": "#FF7A9E", "albedo": {"dominant": "#FF7A9E", "secondary": ["#FF7A9E"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#FF7A9E", "#FF7A9E"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.3, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "capsule-pink-highlight", "kind": "gloss", "region": "upper-left of each capsule, 0.05 D", "roughness": 0.1, "notes": "Specular from the key light.", "evidenceRefs": ["zone-r1c1"]}], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Glossy toy plastic; coloured top hemisphere. The white bottom hemisphere and black equatorial seam are hand-refined (split SphereGeometry by thetaLength).", "materialClass": "plastic"},
    options
  );
  materialMap["capsule-mint"] = createSculptMaterial(
    "capsule-mint",
    {"id": "capsule-mint", "name": "Capsule top, mint", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#5FE3B1", "color": "#5FE3B1", "albedo": {"dominant": "#5FE3B1", "secondary": ["#5FE3B1"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#5FE3B1", "#5FE3B1"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.3, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "capsule-mint-highlight", "kind": "gloss", "region": "upper-left of each capsule, 0.05 D", "roughness": 0.1, "notes": "Specular from the key light.", "evidenceRefs": ["zone-r1c1"]}], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Glossy toy plastic; coloured top hemisphere. The white bottom hemisphere and black equatorial seam are hand-refined (split SphereGeometry by thetaLength).", "materialClass": "plastic"},
    options
  );
  materialMap["capsule-sky"] = createSculptMaterial(
    "capsule-sky",
    {"id": "capsule-sky", "name": "Capsule top, sky", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#5BC8FF", "color": "#5BC8FF", "albedo": {"dominant": "#5BC8FF", "secondary": ["#5BC8FF"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#5BC8FF", "#5BC8FF"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.3, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "capsule-sky-highlight", "kind": "gloss", "region": "upper-left of each capsule, 0.05 D", "roughness": 0.1, "notes": "Specular from the key light.", "evidenceRefs": ["zone-r1c1"]}], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Glossy toy plastic; coloured top hemisphere. The white bottom hemisphere and black equatorial seam are hand-refined (split SphereGeometry by thetaLength).", "materialClass": "plastic"},
    options
  );
  materialMap["capsule-grape"] = createSculptMaterial(
    "capsule-grape",
    {"id": "capsule-grape", "name": "Capsule top, grape", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#B48CFF", "color": "#B48CFF", "albedo": {"dominant": "#B48CFF", "secondary": ["#B48CFF"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#B48CFF", "#B48CFF"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.3, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "capsule-grape-highlight", "kind": "gloss", "region": "upper-left of each capsule, 0.05 D", "roughness": 0.1, "notes": "Specular from the key light.", "evidenceRefs": ["zone-r1c1"]}], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Glossy toy plastic; coloured top hemisphere. The white bottom hemisphere and black equatorial seam are hand-refined (split SphereGeometry by thetaLength).", "materialClass": "plastic"},
    options
  );
  materialMap["capsule-yellow"] = createSculptMaterial(
    "capsule-yellow",
    {"id": "capsule-yellow", "name": "Capsule top, yellow", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#FFC800", "color": "#FFC800", "albedo": {"dominant": "#FFC800", "secondary": ["#FFC800"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#FFC800", "#FFC800"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.3, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "capsule-yellow-highlight", "kind": "gloss", "region": "upper-left of each capsule, 0.05 D", "roughness": 0.1, "notes": "Specular from the key light.", "evidenceRefs": ["zone-r1c1"]}], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Glossy toy plastic; coloured top hemisphere. The white bottom hemisphere and black equatorial seam are hand-refined (split SphereGeometry by thetaLength).", "materialClass": "plastic"},
    options
  );
  materialMap["capsule-white"] = createSculptMaterial(
    "capsule-white",
    {"id": "capsule-white", "name": "Capsule bottom white", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#FFFFFF", "color": "#FFFFFF", "albedo": {"dominant": "#FFFFFF", "secondary": ["#FFFFFF"], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."}, "colorVariation": {"palette": ["#FFFFFF", "#FFFFFF"], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0}, "textureless": {"declared": true, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference.", "evidence": ["full-object", "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part"]}, "roughness": {"base": 0.3, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "flatShading": false, "shaderNotes": ["Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.", "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo."], "notes": "Bottom hemisphere of every capsule (hand-refined split).", "materialClass": "plastic"},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_root_0 = makeAttachmentEndpoint(null);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "Housing body__pivot";
  node_root_0.scale.set(1, 1, 1);
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "Housing body", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid rounded-cuboid housing with countable flat faces; a box with a 0.08 D fillet.", "geometryDescriptor": {"topologyIntent": "rounded cuboid, fillet 0.08 D on all 12 edges", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.08, "segments": 4}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": null, "attachment": null, "dimensions": {"width": 1.1, "height": 0.72, "depth": 0.75, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0]}, "material": "housing-cream", "materialLayers": ["housing-cream"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 253, 245, 1.0)", "secondaryAlbedo": "rgba(255, 253, 245, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Off-white fill of the housing (px 300,1000)."}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "domeSeat", "localPosition": [0, 0.36, 0], "axis": [0, 1, 0], "notes": "dome rests here"}, {"id": "crankAxle", "localPosition": [0, -0.13, 0.375], "axis": [0, 0, 1], "notes": "crank rotates about +Z"}, {"id": "trayMouth", "localPosition": [-0.346, -0.194, 0.375], "axis": [0, 0, 1], "notes": "capsule exit"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "outline-halo", "description": "Inverted-hull outline: black shell scaled +0.013 D and a white shell +0.026 D on every mesh (sticker language).", "confidence": 0.95, "level": "micro", "evidence": ["zone-r1c0"]}, {"id": "body-fillet", "description": "0.08 D fillet on all housing edges, 4 segments.", "confidence": 0.9, "level": "macro", "evidence": ["zone-r2c2"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout"};
  node_root_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "domeSeat", "localPosition": [0, 0.36, 0], "axis": [0, 1, 0], "notes": "dome rests here"}, {"id": "crankAxle", "localPosition": [0, -0.13, 0.375], "axis": [0, 0, 1], "notes": "crank rotates about +Z"}, {"id": "trayMouth", "localPosition": [-0.346, -0.194, 0.375], "axis": [0, 0, 1], "notes": "capsule exit"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_root_0) {
    mesh_root_0Geometry.scale(1.1, 0.72, 0.75);
  }
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["housing-cream"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "Housing body";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "Housing body", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.9, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rigid rounded-cuboid housing with countable flat faces; a box with a 0.08 D fillet.", "geometryDescriptor": {"topologyIntent": "rounded cuboid, fillet 0.08 D on all 12 edges", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.08, "segments": 4}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": null, "attachment": null, "dimensions": {"width": 1.1, "height": 0.72, "depth": 0.75, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0]}, "material": "housing-cream", "materialLayers": ["housing-cream"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 253, 245, 1.0)", "secondaryAlbedo": "rgba(255, 253, 245, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Off-white fill of the housing (px 300,1000)."}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "domeSeat", "localPosition": [0, 0.36, 0], "axis": [0, 1, 0], "notes": "dome rests here"}, {"id": "crankAxle", "localPosition": [0, -0.13, 0.375], "axis": [0, 0, 1], "notes": "crank rotates about +Z"}, {"id": "trayMouth", "localPosition": [-0.346, -0.194, 0.375], "axis": [0, 0, 1], "notes": "capsule exit"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "outline-halo", "description": "Inverted-hull outline: black shell scaled +0.013 D and a white shell +0.026 D on every mesh (sticker language).", "confidence": 0.95, "level": "micro", "evidence": ["zone-r1c0"]}, {"id": "body-fillet", "description": "0.08 D fillet on all housing edges, 4 segments.", "confidence": 0.9, "level": "macro", "evidence": ["zone-r2c2"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout"};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};
  const socket_root_domeSeat_0 = new THREE.Object3D();
  socket_root_domeSeat_0.name = "domeSeat";
  socket_root_domeSeat_0.position.set(0.0, 0.36, 0.0);
  socket_root_domeSeat_0.rotation.set(0, 0, 0);
  socket_root_domeSeat_0.userData.socket = {"id": "domeSeat", "localPosition": [0, 0.36, 0], "axis": [0, 1, 0], "notes": "dome rests here"};
  node_root_0.add(socket_root_domeSeat_0);
  sockets["root:domeSeat"] = socket_root_domeSeat_0;
  const socket_root_crankAxle_1 = new THREE.Object3D();
  socket_root_crankAxle_1.name = "crankAxle";
  socket_root_crankAxle_1.position.set(0.0, -0.13, 0.375);
  socket_root_crankAxle_1.rotation.set(0, 0, 0);
  socket_root_crankAxle_1.userData.socket = {"id": "crankAxle", "localPosition": [0, -0.13, 0.375], "axis": [0, 0, 1], "notes": "crank rotates about +Z"};
  node_root_0.add(socket_root_crankAxle_1);
  sockets["root:crankAxle"] = socket_root_crankAxle_1;
  const socket_root_trayMouth_2 = new THREE.Object3D();
  socket_root_trayMouth_2.name = "trayMouth";
  socket_root_trayMouth_2.position.set(-0.346, -0.194, 0.375);
  socket_root_trayMouth_2.rotation.set(0, 0, 0);
  socket_root_trayMouth_2.userData.socket = {"id": "trayMouth", "localPosition": [-0.346, -0.194, 0.375], "axis": [0, 0, 1], "notes": "capsule exit"};
  node_root_0.add(socket_root_trayMouth_2);
  sockets["root:trayMouth"] = socket_root_trayMouth_2;

  const attachment_collar_1 = {"parentId": "root", "parentSocket": "domeSeat", "localStart": [0, 0.34, 0], "localEnd": [0, 0.38, 0], "baseRadius": 0.3, "endRadius": 0.3, "contactType": "butt-seat", "overlap": 0.02, "gapTolerance": 0.002, "evidenceRefs": ["full-object"]};
  const endpoint_collar_1 = makeAttachmentEndpoint(attachment_collar_1);
  const node_collar_1 = new THREE.Group();
  node_collar_1.name = "Capsule floor cup__pivot";
  node_collar_1.scale.set(1, 1, 1);
  if (endpoint_collar_1) {
    node_collar_1.position.copy(endpoint_collar_1.start);
    node_collar_1.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_collar_1.position.set(0.0, 0.36, 0.0);
    node_collar_1.rotation.set(0.0, 0.0, 0.0);
  }
  node_collar_1.userData.sculptComponent = {"id": "collar", "name": "Capsule floor cup", "level": "meso", "role": "seat-cup", "importance": 0.6, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Short flat cylinder (cup) the capsules rest on; a real lathed solid, not relief.", "geometryDescriptor": {"topologyIntent": "hard-surface toon prop", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "domeSeat", "localStart": [0, 0.34, 0], "localEnd": [0, 0.38, 0], "baseRadius": 0.3, "endRadius": 0.3, "contactType": "butt-seat", "overlap": 0.02, "gapTolerance": 0.002, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.6, "height": 0.04, "depth": 0.6, "units": "relative", "confidence": 0.75}, "transform": {"position": [0, 0.36, 0], "rotation": [0, 0, 0]}, "material": "floor-blue", "materialLayers": ["floor-blue"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 220, 232, 1.0)", "secondaryAlbedo": "rgba(201, 220, 232, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Blue-grey band at the dome bottom (px 600,780)."}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "collar-floor", "description": "Flat blue-grey top face at y=0.38 (root space) that the capsule row rests on; visible as a band through the glass.", "confidence": 0.8, "level": "meso", "evidence": ["zone-r1c1"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_collar_1.userData.actionProfile = {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["root"] ?? root).add(node_collar_1);
  nodes["collar"] = node_collar_1;
  const mesh_collar_1Geometry = endpoint_collar_1
    ? new THREE.CylinderGeometry(endpoint_collar_1.endRadius, endpoint_collar_1.baseRadius, endpoint_collar_1.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_collar_1) {
    mesh_collar_1Geometry.scale(0.6, 0.04, 0.6);
  }
  const mesh_collar_1 = new THREE.Mesh(
    mesh_collar_1Geometry,
    materialMap["floor-blue"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_collar_1.name = "Capsule floor cup";
  if (endpoint_collar_1) {
    mesh_collar_1.position.copy(endpoint_collar_1.midpoint);
    mesh_collar_1.quaternion.copy(endpoint_collar_1.quaternion);
  }
  mesh_collar_1.castShadow = options.castShadow ?? true;
  mesh_collar_1.receiveShadow = options.receiveShadow ?? true;
  mesh_collar_1.userData.sculptComponent = {"id": "collar", "name": "Capsule floor cup", "level": "meso", "role": "seat-cup", "importance": 0.6, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Short flat cylinder (cup) the capsules rest on; a real lathed solid, not relief.", "geometryDescriptor": {"topologyIntent": "hard-surface toon prop", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "domeSeat", "localStart": [0, 0.34, 0], "localEnd": [0, 0.38, 0], "baseRadius": 0.3, "endRadius": 0.3, "contactType": "butt-seat", "overlap": 0.02, "gapTolerance": 0.002, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.6, "height": 0.04, "depth": 0.6, "units": "relative", "confidence": 0.75}, "transform": {"position": [0, 0.36, 0], "rotation": [0, 0, 0]}, "material": "floor-blue", "materialLayers": ["floor-blue"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(201, 220, 232, 1.0)", "secondaryAlbedo": "rgba(201, 220, 232, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Blue-grey band at the dome bottom (px 600,780)."}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "collar-floor", "description": "Flat blue-grey top face at y=0.38 (root space) that the capsule row rests on; visible as a band through the glass.", "confidence": 0.8, "level": "meso", "evidence": ["zone-r1c1"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_collar_1.add(mesh_collar_1);
  meshes["collar"] = mesh_collar_1;
  colliders["collar"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_dome_2 = makeAttachmentEndpoint(null);
  const node_dome_2 = new THREE.Group();
  node_dome_2.name = "Glass dome__pivot";
  node_dome_2.scale.set(1, 1, 1);
  if (endpoint_dome_2) {
    node_dome_2.position.copy(endpoint_dome_2.start);
    node_dome_2.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_dome_2.position.set(0.0, 0.78, 0.0);
    node_dome_2.rotation.set(0.0, 0.0, 0.0);
  }
  node_dome_2.userData.sculptComponent = {"id": "dome", "name": "Glass dome", "level": "macro", "role": "glass-dome", "importance": 1.0, "confidence": 0.9, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A true sphere primitive (px circle 280..930 x 155..805); not a sculpted organic form.", "geometryDescriptor": {"topologyIntent": "UV sphere, 48x32 segments, transmissive", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": null, "dimensions": {"width": 1.0, "height": 1.0, "depth": 1.0, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0.78, 0], "rotation": [0, 0, 0]}, "material": "dome-glass", "materialLayers": ["dome-glass"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(234, 246, 255, 1.0)", "secondaryAlbedo": "rgba(234, 246, 255, 1.0)", "materialClass": "glass", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Glass tint read from the upper-left of the dome away from the highlight (px 450,400)."}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "glass-highlight", "description": "Single white specular ellipse 0.23 D x 0.11 D, rotated -30 deg, upper-front-left (px 365..520 x 240..330).", "confidence": 0.9, "level": "meso", "evidence": ["zone-r0c0"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r0c0", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_dome_2.userData.actionProfile = {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["root"] ?? root).add(node_dome_2);
  nodes["dome"] = node_dome_2;
  const mesh_dome_2Geometry = endpoint_dome_2
    ? new THREE.CylinderGeometry(endpoint_dome_2.endRadius, endpoint_dome_2.baseRadius, endpoint_dome_2.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_dome_2) {
    mesh_dome_2Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_dome_2 = new THREE.Mesh(
    mesh_dome_2Geometry,
    materialMap["dome-glass"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_dome_2.name = "Glass dome";
  if (endpoint_dome_2) {
    mesh_dome_2.position.copy(endpoint_dome_2.midpoint);
    mesh_dome_2.quaternion.copy(endpoint_dome_2.quaternion);
  }
  mesh_dome_2.castShadow = options.castShadow ?? true;
  mesh_dome_2.receiveShadow = options.receiveShadow ?? true;
  mesh_dome_2.userData.sculptComponent = {"id": "dome", "name": "Glass dome", "level": "macro", "role": "glass-dome", "importance": 1.0, "confidence": 0.9, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A true sphere primitive (px circle 280..930 x 155..805); not a sculpted organic form.", "geometryDescriptor": {"topologyIntent": "UV sphere, 48x32 segments, transmissive", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": null, "dimensions": {"width": 1.0, "height": 1.0, "depth": 1.0, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0.78, 0], "rotation": [0, 0, 0]}, "material": "dome-glass", "materialLayers": ["dome-glass"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(234, 246, 255, 1.0)", "secondaryAlbedo": "rgba(234, 246, 255, 1.0)", "materialClass": "glass", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Glass tint read from the upper-left of the dome away from the highlight (px 450,400)."}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "glass-highlight", "description": "Single white specular ellipse 0.23 D x 0.11 D, rotated -30 deg, upper-front-left (px 365..520 x 240..330).", "confidence": 0.9, "level": "meso", "evidence": ["zone-r0c0"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r0c0", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_dome_2.add(mesh_dome_2);
  meshes["dome"] = mesh_dome_2;
  colliders["dome"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const attachment_medallion_3 = {"parentId": "dome", "parentSocket": "domeTop", "localStart": [0, 0.505, -0.03], "localEnd": [0, 0.505, 0.03], "baseRadius": 0.195, "endRadius": 0.195, "contactType": "overlap-embed", "embedDepth": 0.19, "gapTolerance": 0.002, "evidenceRefs": ["zone-r0c1"]};
  const endpoint_medallion_3 = makeAttachmentEndpoint(attachment_medallion_3);
  const node_medallion_3 = new THREE.Group();
  node_medallion_3.name = "Mascot medallion disc__pivot";
  node_medallion_3.scale.set(1, 1, 1);
  if (endpoint_medallion_3) {
    node_medallion_3.position.copy(endpoint_medallion_3.start);
    node_medallion_3.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_medallion_3.position.set(0.0, 0.505, 0.0);
    node_medallion_3.rotation.set(0.0, 0.0, 0.0);
  }
  node_medallion_3.userData.sculptComponent = {"id": "medallion", "name": "Mascot medallion disc", "level": "macro", "role": "badge-disc", "importance": 0.9, "confidence": 0.8, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Short cylinder (coin) with its axis along +Z so the sticker face looks at the camera.", "geometryDescriptor": {"topologyIntent": "coin disc, axis +Z, rises 0.2 D above the sphere top and overlaps it by 0.19 D", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": {"parentId": "dome", "parentSocket": "domeTop", "localStart": [0, 0.505, -0.03], "localEnd": [0, 0.505, 0.03], "baseRadius": 0.195, "endRadius": 0.195, "contactType": "overlap-embed", "embedDepth": 0.19, "gapTolerance": 0.002, "evidenceRefs": ["zone-r0c1"]}, "dimensions": {"width": 0.39, "height": 0.06, "depth": 0.39, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.505, 0], "rotation": [0, 0, 0]}, "material": "medallion-face", "materialLayers": ["medallion-face"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 200, 0, 1.0)", "secondaryAlbedo": "rgba(255, 200, 0, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Yellow of the medallion face around the mascot (px 520,130)."}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "mascot-decal-face", "description": "Mascot image fills the +Z cap; yellow background; see materials.medallion-face.localOverrides.mascot-decal.", "confidence": 0.95, "level": "meso", "evidence": ["zone-r0c1"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r0c1"], "details": [], "fidelityTier": "blockout"};
  node_medallion_3.userData.actionProfile = {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["dome"] ?? root).add(node_medallion_3);
  nodes["medallion"] = node_medallion_3;
  const mesh_medallion_3Geometry = endpoint_medallion_3
    ? new THREE.CylinderGeometry(endpoint_medallion_3.endRadius, endpoint_medallion_3.baseRadius, endpoint_medallion_3.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_medallion_3) {
    mesh_medallion_3Geometry.scale(0.39, 0.06, 0.39);
  }
  const mesh_medallion_3 = new THREE.Mesh(
    mesh_medallion_3Geometry,
    materialMap["medallion-face"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_medallion_3.name = "Mascot medallion disc";
  if (endpoint_medallion_3) {
    mesh_medallion_3.position.copy(endpoint_medallion_3.midpoint);
    mesh_medallion_3.quaternion.copy(endpoint_medallion_3.quaternion);
  }
  mesh_medallion_3.castShadow = options.castShadow ?? true;
  mesh_medallion_3.receiveShadow = options.receiveShadow ?? true;
  mesh_medallion_3.userData.sculptComponent = {"id": "medallion", "name": "Mascot medallion disc", "level": "macro", "role": "badge-disc", "importance": 0.9, "confidence": 0.8, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Short cylinder (coin) with its axis along +Z so the sticker face looks at the camera.", "geometryDescriptor": {"topologyIntent": "coin disc, axis +Z, rises 0.2 D above the sphere top and overlaps it by 0.19 D", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": {"parentId": "dome", "parentSocket": "domeTop", "localStart": [0, 0.505, -0.03], "localEnd": [0, 0.505, 0.03], "baseRadius": 0.195, "endRadius": 0.195, "contactType": "overlap-embed", "embedDepth": 0.19, "gapTolerance": 0.002, "evidenceRefs": ["zone-r0c1"]}, "dimensions": {"width": 0.39, "height": 0.06, "depth": 0.39, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0.505, 0], "rotation": [0, 0, 0]}, "material": "medallion-face", "materialLayers": ["medallion-face"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 200, 0, 1.0)", "secondaryAlbedo": "rgba(255, 200, 0, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Yellow of the medallion face around the mascot (px 520,130)."}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "mascot-decal-face", "description": "Mascot image fills the +Z cap; yellow background; see materials.medallion-face.localOverrides.mascot-decal.", "confidence": 0.95, "level": "meso", "evidence": ["zone-r0c1"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r0c1"], "details": [], "fidelityTier": "blockout"};
  node_medallion_3.add(mesh_medallion_3);
  meshes["medallion"] = mesh_medallion_3;
  colliders["medallion"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_medallion_frame_4 = makeAttachmentEndpoint(null);
  const node_medallion_frame_4 = new THREE.Group();
  node_medallion_frame_4.name = "Medallion sticker ring__pivot";
  node_medallion_frame_4.scale.set(1, 1, 1);
  if (endpoint_medallion_frame_4) {
    node_medallion_frame_4.position.copy(endpoint_medallion_frame_4.start);
    node_medallion_frame_4.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_medallion_frame_4.position.set(0.0, 0.0, 0.06);
    node_medallion_frame_4.rotation.set(0.0, 0.0, 0.0);
  }
  node_medallion_frame_4.userData.sculptComponent = {"id": "medallion-frame", "name": "Medallion sticker ring", "level": "meso", "role": "frame-ring", "importance": 0.5, "confidence": 0.8, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "A ring is a torus; sits proud of the disc edge as the white sticker halo.", "geometryDescriptor": {"topologyIntent": "torus, ring radius 0.195 D, tube 0.013 D (torusTubeRatio 0.03)", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "torusTubeRatio": 0.03}, "parent": "medallion", "attachment": null, "dimensions": {"width": 0.433, "height": 0.433, "depth": 0.433, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0, 0.06], "rotation": [0, 0, 0]}, "material": "sticker-white", "materialLayers": ["sticker-white"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 255, 255, 1.0)", "secondaryAlbedo": "rgba(255, 255, 255, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "White ring around the medallion (px 460,130)."}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r0c1"], "details": [], "fidelityTier": "blockout"};
  node_medallion_frame_4.userData.actionProfile = {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["medallion"] ?? root).add(node_medallion_frame_4);
  nodes["medallion-frame"] = node_medallion_frame_4;
  const mesh_medallion_frame_4Geometry = endpoint_medallion_frame_4
    ? new THREE.CylinderGeometry(endpoint_medallion_frame_4.endRadius, endpoint_medallion_frame_4.baseRadius, endpoint_medallion_frame_4.length, 16, 6)
    : new THREE.TorusGeometry(0.45, 0.0135, 12, 48);
  if (!endpoint_medallion_frame_4) {
    mesh_medallion_frame_4Geometry.scale(0.433, 0.433, 0.433);
  }
  const mesh_medallion_frame_4 = new THREE.Mesh(
    mesh_medallion_frame_4Geometry,
    materialMap["sticker-white"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_medallion_frame_4.name = "Medallion sticker ring";
  if (endpoint_medallion_frame_4) {
    mesh_medallion_frame_4.position.copy(endpoint_medallion_frame_4.midpoint);
    mesh_medallion_frame_4.quaternion.copy(endpoint_medallion_frame_4.quaternion);
  }
  mesh_medallion_frame_4.castShadow = options.castShadow ?? true;
  mesh_medallion_frame_4.receiveShadow = options.receiveShadow ?? true;
  mesh_medallion_frame_4.userData.sculptComponent = {"id": "medallion-frame", "name": "Medallion sticker ring", "level": "meso", "role": "frame-ring", "importance": 0.5, "confidence": 0.8, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "A ring is a torus; sits proud of the disc edge as the white sticker halo.", "geometryDescriptor": {"topologyIntent": "torus, ring radius 0.195 D, tube 0.013 D (torusTubeRatio 0.03)", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "torusTubeRatio": 0.03}, "parent": "medallion", "attachment": null, "dimensions": {"width": 0.433, "height": 0.433, "depth": 0.433, "units": "relative", "confidence": 0.8}, "transform": {"position": [0, 0, 0.06], "rotation": [0, 0, 0]}, "material": "sticker-white", "materialLayers": ["sticker-white"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 255, 255, 1.0)", "secondaryAlbedo": "rgba(255, 255, 255, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "White ring around the medallion (px 460,130)."}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r0c1"], "details": [], "fidelityTier": "blockout"};
  node_medallion_frame_4.add(mesh_medallion_frame_4);
  meshes["medallion-frame"] = mesh_medallion_frame_4;
  colliders["medallion-frame"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_sign_plate_5 = makeAttachmentEndpoint(null);
  const node_sign_plate_5 = new THREE.Group();
  node_sign_plate_5.name = "Sign plate__pivot";
  node_sign_plate_5.scale.set(1, 1, 1);
  if (endpoint_sign_plate_5) {
    node_sign_plate_5.position.copy(endpoint_sign_plate_5.start);
    node_sign_plate_5.rotation.set(0.0, 0.0, -0.0349);
  } else {
    node_sign_plate_5.position.set(0.0, 0.172, 0.38);
    node_sign_plate_5.rotation.set(0.0, 0.0, -0.0349);
  }
  node_sign_plate_5.userData.sculptComponent = {"id": "sign-plate", "name": "Sign plate", "level": "meso", "role": "name-plate", "importance": 0.8, "confidence": 0.9, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Thin rounded rectangular plate with real thickness (sticker edge), stuck on the front face.", "geometryDescriptor": {"topologyIntent": "hard-surface toon prop", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.02, "segments": 3}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": null, "dimensions": {"width": 0.54, "height": 0.146, "depth": 0.02, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0.172, 0.38], "rotation": [0, 0, -0.0349]}, "material": "sign-yellow", "materialLayers": ["sign-yellow"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 200, 0, 1.0)", "secondaryAlbedo": "rgba(255, 200, 0, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Yellow plate fill (px 470,870)."}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "sign-text", "description": "Black 'JACK GACHA' display-face text centred on the plate; see materials.sign-yellow.localOverrides.jack-gacha-text.", "confidence": 0.95, "level": "micro", "evidence": ["zone-r2c1"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r2c1"], "details": [], "fidelityTier": "blockout"};
  node_sign_plate_5.userData.actionProfile = {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["root"] ?? root).add(node_sign_plate_5);
  nodes["sign-plate"] = node_sign_plate_5;
  const mesh_sign_plate_5Geometry = endpoint_sign_plate_5
    ? new THREE.CylinderGeometry(endpoint_sign_plate_5.endRadius, endpoint_sign_plate_5.baseRadius, endpoint_sign_plate_5.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_sign_plate_5) {
    mesh_sign_plate_5Geometry.scale(0.54, 0.146, 0.02);
  }
  const mesh_sign_plate_5 = new THREE.Mesh(
    mesh_sign_plate_5Geometry,
    materialMap["sign-yellow"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_sign_plate_5.name = "Sign plate";
  if (endpoint_sign_plate_5) {
    mesh_sign_plate_5.position.copy(endpoint_sign_plate_5.midpoint);
    mesh_sign_plate_5.quaternion.copy(endpoint_sign_plate_5.quaternion);
  }
  mesh_sign_plate_5.castShadow = options.castShadow ?? true;
  mesh_sign_plate_5.receiveShadow = options.receiveShadow ?? true;
  mesh_sign_plate_5.userData.sculptComponent = {"id": "sign-plate", "name": "Sign plate", "level": "meso", "role": "name-plate", "importance": 0.8, "confidence": 0.9, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Thin rounded rectangular plate with real thickness (sticker edge), stuck on the front face.", "geometryDescriptor": {"topologyIntent": "hard-surface toon prop", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.02, "segments": 3}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": null, "dimensions": {"width": 0.54, "height": 0.146, "depth": 0.02, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, 0.172, 0.38], "rotation": [0, 0, -0.0349]}, "material": "sign-yellow", "materialLayers": ["sign-yellow"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 200, 0, 1.0)", "secondaryAlbedo": "rgba(255, 200, 0, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Yellow plate fill (px 470,870)."}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "sign-text", "description": "Black 'JACK GACHA' display-face text centred on the plate; see materials.sign-yellow.localOverrides.jack-gacha-text.", "confidence": 0.95, "level": "micro", "evidence": ["zone-r2c1"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r2c1"], "details": [], "fidelityTier": "blockout"};
  node_sign_plate_5.add(mesh_sign_plate_5);
  meshes["sign-plate"] = mesh_sign_plate_5;
  colliders["sign-plate"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const attachment_crank_disc_6 = {"parentId": "root", "parentSocket": "crankAxle", "localStart": [0, -0.13, 0.37], "localEnd": [0, -0.13, 0.405], "baseRadius": 0.14, "endRadius": 0.14, "contactType": "axle-socket", "embedDepth": 0.005, "gapTolerance": 0.002, "evidenceRefs": ["zone-r2c1"]};
  const endpoint_crank_disc_6 = makeAttachmentEndpoint(attachment_crank_disc_6);
  const node_crank_disc_6 = new THREE.Group();
  node_crank_disc_6.name = "Crank disc__pivot";
  node_crank_disc_6.scale.set(1, 1, 1);
  if (endpoint_crank_disc_6) {
    node_crank_disc_6.position.copy(endpoint_crank_disc_6.start);
    node_crank_disc_6.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_crank_disc_6.position.set(0.0, -0.13, 0.37);
    node_crank_disc_6.rotation.set(0.0, 0.0, 0.0);
  }
  node_crank_disc_6.userData.sculptComponent = {"id": "crank-disc", "name": "Crank disc", "level": "macro", "role": "crank-rotor", "importance": 0.9, "confidence": 0.9, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Short cylinder (puck) on an axle through the front face; a discrete rigid part.", "geometryDescriptor": {"topologyIntent": "puck, axis +Z; the crank-bar and knob are children so they rotate with it", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "crankAxle", "localStart": [0, -0.13, 0.37], "localEnd": [0, -0.13, 0.405], "baseRadius": 0.14, "endRadius": 0.14, "contactType": "axle-socket", "embedDepth": 0.005, "gapTolerance": 0.002, "evidenceRefs": ["zone-r2c1"]}, "dimensions": {"width": 0.28, "height": 0.03, "depth": 0.28, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, -0.13, 0.37], "rotation": [0, 0, 0]}, "material": "sticker-white", "materialLayers": ["sticker-white"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 255, 255, 1.0)", "secondaryAlbedo": "rgba(255, 255, 255, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "White disc fill (px 560,1050)."}, "actionProfile": {"animationRole": "rotor", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r2c1"], "details": [], "fidelityTier": "blockout"};
  node_crank_disc_6.userData.actionProfile = {"animationRole": "rotor", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["root"] ?? root).add(node_crank_disc_6);
  nodes["crank-disc"] = node_crank_disc_6;
  const mesh_crank_disc_6Geometry = endpoint_crank_disc_6
    ? new THREE.CylinderGeometry(endpoint_crank_disc_6.endRadius, endpoint_crank_disc_6.baseRadius, endpoint_crank_disc_6.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_crank_disc_6) {
    mesh_crank_disc_6Geometry.scale(0.28, 0.03, 0.28);
  }
  const mesh_crank_disc_6 = new THREE.Mesh(
    mesh_crank_disc_6Geometry,
    materialMap["sticker-white"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_crank_disc_6.name = "Crank disc";
  if (endpoint_crank_disc_6) {
    mesh_crank_disc_6.position.copy(endpoint_crank_disc_6.midpoint);
    mesh_crank_disc_6.quaternion.copy(endpoint_crank_disc_6.quaternion);
  }
  mesh_crank_disc_6.castShadow = options.castShadow ?? true;
  mesh_crank_disc_6.receiveShadow = options.receiveShadow ?? true;
  mesh_crank_disc_6.userData.sculptComponent = {"id": "crank-disc", "name": "Crank disc", "level": "macro", "role": "crank-rotor", "importance": 0.9, "confidence": 0.9, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Short cylinder (puck) on an axle through the front face; a discrete rigid part.", "geometryDescriptor": {"topologyIntent": "puck, axis +Z; the crank-bar and knob are children so they rotate with it", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "crankAxle", "localStart": [0, -0.13, 0.37], "localEnd": [0, -0.13, 0.405], "baseRadius": 0.14, "endRadius": 0.14, "contactType": "axle-socket", "embedDepth": 0.005, "gapTolerance": 0.002, "evidenceRefs": ["zone-r2c1"]}, "dimensions": {"width": 0.28, "height": 0.03, "depth": 0.28, "units": "relative", "confidence": 0.9}, "transform": {"position": [0, -0.13, 0.37], "rotation": [0, 0, 0]}, "material": "sticker-white", "materialLayers": ["sticker-white"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 255, 255, 1.0)", "secondaryAlbedo": "rgba(255, 255, 255, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "White disc fill (px 560,1050)."}, "actionProfile": {"animationRole": "rotor", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r2c1"], "details": [], "fidelityTier": "blockout"};
  node_crank_disc_6.add(mesh_crank_disc_6);
  meshes["crank-disc"] = mesh_crank_disc_6;
  colliders["crank-disc"] = {"type": "cylinder", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_crank_bar_7 = makeAttachmentEndpoint(null);
  const node_crank_bar_7 = new THREE.Group();
  node_crank_bar_7.name = "Crank bar__pivot";
  node_crank_bar_7.scale.set(1, 1, 1);
  if (endpoint_crank_bar_7) {
    node_crank_bar_7.position.copy(endpoint_crank_bar_7.start);
    node_crank_bar_7.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_crank_bar_7.position.set(0.045, 0.0, 0.035);
    node_crank_bar_7.rotation.set(0.0, 0.0, 0.0);
  }
  node_crank_bar_7.userData.sculptComponent = {"id": "crank-bar", "name": "Crank bar", "level": "meso", "role": "crank-arm", "importance": 0.8, "confidence": 0.9, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rounded rectangular bar; a rigid lever, box with 0.02 D fillet.", "geometryDescriptor": {"topologyIntent": "hard-surface toon prop", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.02, "segments": 3}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "crank-disc", "attachment": null, "dimensions": {"width": 0.21, "height": 0.05, "depth": 0.04, "units": "relative", "confidence": 0.9}, "transform": {"position": [0.045, 0.0, 0.035], "rotation": [0, 0, 0]}, "material": "crank-pink", "materialLayers": ["crank-pink"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 122, 158, 1.0)", "secondaryAlbedo": "rgba(255, 122, 158, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Pink bar fill (px 590,1075)."}, "actionProfile": {"animationRole": "rotor-child", "pivot": {"mode": "explicit", "localPosition": [-0.045, 0, 0], "axis": [0, 0, 1], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "crank-bar-knob-offset", "description": "Bar runs from 0.06 D left of the disc centre to 0.15 D right; the knob sits at the lateral end, so the assembly is visibly off-centre and reads as a handle when rotated.", "confidence": 0.95, "level": "meso", "evidence": ["zone-r2c1"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r2c1"], "details": [], "fidelityTier": "blockout"};
  node_crank_bar_7.userData.actionProfile = {"animationRole": "rotor-child", "pivot": {"mode": "explicit", "localPosition": [-0.045, 0, 0], "axis": [0, 0, 1], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["crank-disc"] ?? root).add(node_crank_bar_7);
  nodes["crank-bar"] = node_crank_bar_7;
  const mesh_crank_bar_7Geometry = endpoint_crank_bar_7
    ? new THREE.CylinderGeometry(endpoint_crank_bar_7.endRadius, endpoint_crank_bar_7.baseRadius, endpoint_crank_bar_7.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_crank_bar_7) {
    mesh_crank_bar_7Geometry.scale(0.21, 0.05, 0.04);
  }
  const mesh_crank_bar_7 = new THREE.Mesh(
    mesh_crank_bar_7Geometry,
    materialMap["crank-pink"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_crank_bar_7.name = "Crank bar";
  if (endpoint_crank_bar_7) {
    mesh_crank_bar_7.position.copy(endpoint_crank_bar_7.midpoint);
    mesh_crank_bar_7.quaternion.copy(endpoint_crank_bar_7.quaternion);
  }
  mesh_crank_bar_7.castShadow = options.castShadow ?? true;
  mesh_crank_bar_7.receiveShadow = options.receiveShadow ?? true;
  mesh_crank_bar_7.userData.sculptComponent = {"id": "crank-bar", "name": "Crank bar", "level": "meso", "role": "crank-arm", "importance": 0.8, "confidence": 0.9, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Rounded rectangular bar; a rigid lever, box with 0.02 D fillet.", "geometryDescriptor": {"topologyIntent": "hard-surface toon prop", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.02, "segments": 3}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "crank-disc", "attachment": null, "dimensions": {"width": 0.21, "height": 0.05, "depth": 0.04, "units": "relative", "confidence": 0.9}, "transform": {"position": [0.045, 0.0, 0.035], "rotation": [0, 0, 0]}, "material": "crank-pink", "materialLayers": ["crank-pink"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 122, 158, 1.0)", "secondaryAlbedo": "rgba(255, 122, 158, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Pink bar fill (px 590,1075)."}, "actionProfile": {"animationRole": "rotor-child", "pivot": {"mode": "explicit", "localPosition": [-0.045, 0, 0], "axis": [0, 0, 1], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "crank-bar-knob-offset", "description": "Bar runs from 0.06 D left of the disc centre to 0.15 D right; the knob sits at the lateral end, so the assembly is visibly off-centre and reads as a handle when rotated.", "confidence": 0.95, "level": "meso", "evidence": ["zone-r2c1"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r2c1"], "details": [], "fidelityTier": "blockout"};
  node_crank_bar_7.add(mesh_crank_bar_7);
  meshes["crank-bar"] = mesh_crank_bar_7;
  colliders["crank-bar"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_crank_knob_8 = makeAttachmentEndpoint(null);
  const node_crank_knob_8 = new THREE.Group();
  node_crank_knob_8.name = "Crank knob__pivot";
  node_crank_knob_8.scale.set(1, 1, 1);
  if (endpoint_crank_knob_8) {
    node_crank_knob_8.position.copy(endpoint_crank_knob_8.start);
    node_crank_knob_8.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_crank_knob_8.position.set(0.1, 0.0, 0.0);
    node_crank_knob_8.rotation.set(0.0, 0.0, 0.0);
  }
  node_crank_knob_8.userData.sculptComponent = {"id": "crank-knob", "name": "Crank knob", "level": "micro", "role": "knob", "importance": 0.6, "confidence": 0.9, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Small sphere cap at the bar's lateral end.", "geometryDescriptor": {"topologyIntent": "hard-surface toon prop", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "crank-bar", "attachment": null, "dimensions": {"width": 0.07, "height": 0.07, "depth": 0.07, "units": "relative", "confidence": 0.9}, "transform": {"position": [0.1, 0.0, 0.0], "rotation": [0, 0, 0]}, "material": "outline-ink", "materialLayers": ["outline-ink"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 0, 0, 1.0)", "secondaryAlbedo": "rgba(0, 0, 0, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Black knob (px 645,1075)."}, "actionProfile": {"animationRole": "rotor-child", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r2c1"], "details": [], "fidelityTier": "blockout"};
  node_crank_knob_8.userData.actionProfile = {"animationRole": "rotor-child", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["crank-bar"] ?? root).add(node_crank_knob_8);
  nodes["crank-knob"] = node_crank_knob_8;
  const mesh_crank_knob_8Geometry = endpoint_crank_knob_8
    ? new THREE.CylinderGeometry(endpoint_crank_knob_8.endRadius, endpoint_crank_knob_8.baseRadius, endpoint_crank_knob_8.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_crank_knob_8) {
    mesh_crank_knob_8Geometry.scale(0.07, 0.07, 0.07);
  }
  const mesh_crank_knob_8 = new THREE.Mesh(
    mesh_crank_knob_8Geometry,
    materialMap["outline-ink"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_crank_knob_8.name = "Crank knob";
  if (endpoint_crank_knob_8) {
    mesh_crank_knob_8.position.copy(endpoint_crank_knob_8.midpoint);
    mesh_crank_knob_8.quaternion.copy(endpoint_crank_knob_8.quaternion);
  }
  mesh_crank_knob_8.castShadow = options.castShadow ?? true;
  mesh_crank_knob_8.receiveShadow = options.receiveShadow ?? true;
  mesh_crank_knob_8.userData.sculptComponent = {"id": "crank-knob", "name": "Crank knob", "level": "micro", "role": "knob", "importance": 0.6, "confidence": 0.9, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Small sphere cap at the bar's lateral end.", "geometryDescriptor": {"topologyIntent": "hard-surface toon prop", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "crank-bar", "attachment": null, "dimensions": {"width": 0.07, "height": 0.07, "depth": 0.07, "units": "relative", "confidence": 0.9}, "transform": {"position": [0.1, 0.0, 0.0], "rotation": [0, 0, 0]}, "material": "outline-ink", "materialLayers": ["outline-ink"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 0, 0, 1.0)", "secondaryAlbedo": "rgba(0, 0, 0, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Black knob (px 645,1075)."}, "actionProfile": {"animationRole": "rotor-child", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r2c1"], "details": [], "fidelityTier": "blockout"};
  node_crank_knob_8.add(mesh_crank_knob_8);
  meshes["crank-knob"] = mesh_crank_knob_8;
  colliders["crank-knob"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_tray_opening_9 = makeAttachmentEndpoint(null);
  const node_tray_opening_9 = new THREE.Group();
  node_tray_opening_9.name = "Tray opening plate__pivot";
  node_tray_opening_9.scale.set(1, 1, 1);
  if (endpoint_tray_opening_9) {
    node_tray_opening_9.position.copy(endpoint_tray_opening_9.start);
    node_tray_opening_9.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_tray_opening_9.position.set(-0.346, -0.194, 0.349);
    node_tray_opening_9.rotation.set(0.0, 0.0, 0.0);
  }
  node_tray_opening_9.userData.sculptComponent = {"id": "tray-opening", "name": "Tray opening plate", "level": "macro", "role": "chute-plate", "importance": 0.7, "confidence": 0.85, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Dark rectangular plate standing in for the chute mouth; a real recess (boolean cut into the housing) is deferred to form-refinement hand work and recorded as a risk.", "geometryDescriptor": {"topologyIntent": "hard-surface toon prop", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.03, "segments": 3}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": null, "dimensions": {"width": 0.23, "height": 0.154, "depth": 0.06, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.346, -0.194, 0.349], "rotation": [0, 0, 0]}, "material": "tray-dark", "materialLayers": ["tray-dark"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(26, 26, 26, 1.0)", "secondaryAlbedo": "rgba(26, 26, 26, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Near-black fill (px 375,1115)."}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tray-lip", "description": "Lighter (#3A3A3A) lip band along the top 12% of the opening.", "confidence": 0.8, "level": "micro", "evidence": ["zone-r2c0"]}, {"id": "tray-mouth", "description": "0.23 D x 0.154 D opening at front-lower-left, ~0.1 D deep; rounded corners 0.03 D. Approximated as a proud dark plate until form-refinement.", "confidence": 0.9, "level": "meso", "evidence": ["zone-r2c0"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r2c0"], "details": [], "fidelityTier": "blockout"};
  node_tray_opening_9.userData.actionProfile = {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["root"] ?? root).add(node_tray_opening_9);
  nodes["tray-opening"] = node_tray_opening_9;
  const mesh_tray_opening_9Geometry = endpoint_tray_opening_9
    ? new THREE.CylinderGeometry(endpoint_tray_opening_9.endRadius, endpoint_tray_opening_9.baseRadius, endpoint_tray_opening_9.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_tray_opening_9) {
    mesh_tray_opening_9Geometry.scale(0.23, 0.154, 0.06);
  }
  const mesh_tray_opening_9 = new THREE.Mesh(
    mesh_tray_opening_9Geometry,
    materialMap["tray-dark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_tray_opening_9.name = "Tray opening plate";
  if (endpoint_tray_opening_9) {
    mesh_tray_opening_9.position.copy(endpoint_tray_opening_9.midpoint);
    mesh_tray_opening_9.quaternion.copy(endpoint_tray_opening_9.quaternion);
  }
  mesh_tray_opening_9.castShadow = options.castShadow ?? true;
  mesh_tray_opening_9.receiveShadow = options.receiveShadow ?? true;
  mesh_tray_opening_9.userData.sculptComponent = {"id": "tray-opening", "name": "Tray opening plate", "level": "macro", "role": "chute-plate", "importance": 0.7, "confidence": 0.85, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Dark rectangular plate standing in for the chute mouth; a real recess (boolean cut into the housing) is deferred to form-refinement hand work and recorded as a risk.", "geometryDescriptor": {"topologyIntent": "hard-surface toon prop", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.03, "segments": 3}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": null, "dimensions": {"width": 0.23, "height": 0.154, "depth": 0.06, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.346, -0.194, 0.349], "rotation": [0, 0, 0]}, "material": "tray-dark", "materialLayers": ["tray-dark"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(26, 26, 26, 1.0)", "secondaryAlbedo": "rgba(26, 26, 26, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "Near-black fill (px 375,1115)."}, "actionProfile": {"animationRole": "static-part", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tray-lip", "description": "Lighter (#3A3A3A) lip band along the top 12% of the opening.", "confidence": 0.8, "level": "micro", "evidence": ["zone-r2c0"]}, {"id": "tray-mouth", "description": "0.23 D x 0.154 D opening at front-lower-left, ~0.1 D deep; rounded corners 0.03 D. Approximated as a proud dark plate until form-refinement.", "confidence": 0.9, "level": "meso", "evidence": ["zone-r2c0"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r2c0"], "details": [], "fidelityTier": "blockout"};
  node_tray_opening_9.add(mesh_tray_opening_9);
  meshes["tray-opening"] = mesh_tray_opening_9;
  colliders["tray-opening"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_capsule_01_10 = makeAttachmentEndpoint(null);
  const node_capsule_01_10 = new THREE.Group();
  node_capsule_01_10.name = "Capsule 1 (mint)__pivot";
  node_capsule_01_10.scale.set(1, 1, 1);
  if (endpoint_capsule_01_10) {
    node_capsule_01_10.position.copy(endpoint_capsule_01_10.start);
    node_capsule_01_10.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_capsule_01_10.position.set(-0.26, -0.305, 0.0);
    node_capsule_01_10.rotation.set(0.0, 0.0, 0.0);
  }
  node_capsule_01_10.userData.sculptComponent = {"id": "capsule-01", "name": "Capsule 1 (mint)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.26, -0.305, 0.0], "rotation": [0, 0, 0]}, "material": "capsule-mint", "materialLayers": ["capsule-mint"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(95, 227, 177, 1.0)", "secondaryAlbedo": "rgba(95, 227, 177, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "mint top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "capsule-01-seam", "description": "Black equatorial seam ring 0.01 D wide (thin torus or dark band).", "confidence": 0.9, "level": "micro", "evidence": ["zone-r1c1"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_01_10.userData.actionProfile = {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["dome"] ?? root).add(node_capsule_01_10);
  nodes["capsule-01"] = node_capsule_01_10;
  const mesh_capsule_01_10Geometry = endpoint_capsule_01_10
    ? new THREE.CylinderGeometry(endpoint_capsule_01_10.endRadius, endpoint_capsule_01_10.baseRadius, endpoint_capsule_01_10.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_capsule_01_10) {
    mesh_capsule_01_10Geometry.scale(0.19, 0.19, 0.19);
  }
  const mesh_capsule_01_10 = new THREE.Mesh(
    mesh_capsule_01_10Geometry,
    materialMap["capsule-mint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_capsule_01_10.name = "Capsule 1 (mint)";
  if (endpoint_capsule_01_10) {
    mesh_capsule_01_10.position.copy(endpoint_capsule_01_10.midpoint);
    mesh_capsule_01_10.quaternion.copy(endpoint_capsule_01_10.quaternion);
  }
  mesh_capsule_01_10.castShadow = options.castShadow ?? true;
  mesh_capsule_01_10.receiveShadow = options.receiveShadow ?? true;
  mesh_capsule_01_10.userData.sculptComponent = {"id": "capsule-01", "name": "Capsule 1 (mint)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.26, -0.305, 0.0], "rotation": [0, 0, 0]}, "material": "capsule-mint", "materialLayers": ["capsule-mint"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(95, 227, 177, 1.0)", "secondaryAlbedo": "rgba(95, 227, 177, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "mint top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "capsule-01-seam", "description": "Black equatorial seam ring 0.01 D wide (thin torus or dark band).", "confidence": 0.9, "level": "micro", "evidence": ["zone-r1c1"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_01_10.add(mesh_capsule_01_10);
  meshes["capsule-01"] = mesh_capsule_01_10;
  colliders["capsule-01"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_capsule_02_11 = makeAttachmentEndpoint(null);
  const node_capsule_02_11 = new THREE.Group();
  node_capsule_02_11.name = "Capsule 2 (yellow)__pivot";
  node_capsule_02_11.scale.set(1, 1, 1);
  if (endpoint_capsule_02_11) {
    node_capsule_02_11.position.copy(endpoint_capsule_02_11.start);
    node_capsule_02_11.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_capsule_02_11.position.set(-0.087, -0.305, 0.05);
    node_capsule_02_11.rotation.set(0.0, 0.0, 0.0);
  }
  node_capsule_02_11.userData.sculptComponent = {"id": "capsule-02", "name": "Capsule 2 (yellow)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.087, -0.305, 0.05], "rotation": [0, 0, 0]}, "material": "capsule-yellow", "materialLayers": ["capsule-yellow"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 200, 0, 1.0)", "secondaryAlbedo": "rgba(255, 200, 0, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "yellow top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_02_11.userData.actionProfile = {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["dome"] ?? root).add(node_capsule_02_11);
  nodes["capsule-02"] = node_capsule_02_11;
  const mesh_capsule_02_11Geometry = endpoint_capsule_02_11
    ? new THREE.CylinderGeometry(endpoint_capsule_02_11.endRadius, endpoint_capsule_02_11.baseRadius, endpoint_capsule_02_11.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_capsule_02_11) {
    mesh_capsule_02_11Geometry.scale(0.19, 0.19, 0.19);
  }
  const mesh_capsule_02_11 = new THREE.Mesh(
    mesh_capsule_02_11Geometry,
    materialMap["capsule-yellow"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_capsule_02_11.name = "Capsule 2 (yellow)";
  if (endpoint_capsule_02_11) {
    mesh_capsule_02_11.position.copy(endpoint_capsule_02_11.midpoint);
    mesh_capsule_02_11.quaternion.copy(endpoint_capsule_02_11.quaternion);
  }
  mesh_capsule_02_11.castShadow = options.castShadow ?? true;
  mesh_capsule_02_11.receiveShadow = options.receiveShadow ?? true;
  mesh_capsule_02_11.userData.sculptComponent = {"id": "capsule-02", "name": "Capsule 2 (yellow)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.087, -0.305, 0.05], "rotation": [0, 0, 0]}, "material": "capsule-yellow", "materialLayers": ["capsule-yellow"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 200, 0, 1.0)", "secondaryAlbedo": "rgba(255, 200, 0, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "yellow top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_02_11.add(mesh_capsule_02_11);
  meshes["capsule-02"] = mesh_capsule_02_11;
  colliders["capsule-02"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_capsule_03_12 = makeAttachmentEndpoint(null);
  const node_capsule_03_12 = new THREE.Group();
  node_capsule_03_12.name = "Capsule 3 (pink)__pivot";
  node_capsule_03_12.scale.set(1, 1, 1);
  if (endpoint_capsule_03_12) {
    node_capsule_03_12.position.copy(endpoint_capsule_03_12.start);
    node_capsule_03_12.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_capsule_03_12.position.set(0.087, -0.305, 0.05);
    node_capsule_03_12.rotation.set(0.0, 0.0, 0.0);
  }
  node_capsule_03_12.userData.sculptComponent = {"id": "capsule-03", "name": "Capsule 3 (pink)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.087, -0.305, 0.05], "rotation": [0, 0, 0]}, "material": "capsule-pink", "materialLayers": ["capsule-pink"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 122, 158, 1.0)", "secondaryAlbedo": "rgba(255, 122, 158, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "pink top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_03_12.userData.actionProfile = {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["dome"] ?? root).add(node_capsule_03_12);
  nodes["capsule-03"] = node_capsule_03_12;
  const mesh_capsule_03_12Geometry = endpoint_capsule_03_12
    ? new THREE.CylinderGeometry(endpoint_capsule_03_12.endRadius, endpoint_capsule_03_12.baseRadius, endpoint_capsule_03_12.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_capsule_03_12) {
    mesh_capsule_03_12Geometry.scale(0.19, 0.19, 0.19);
  }
  const mesh_capsule_03_12 = new THREE.Mesh(
    mesh_capsule_03_12Geometry,
    materialMap["capsule-pink"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_capsule_03_12.name = "Capsule 3 (pink)";
  if (endpoint_capsule_03_12) {
    mesh_capsule_03_12.position.copy(endpoint_capsule_03_12.midpoint);
    mesh_capsule_03_12.quaternion.copy(endpoint_capsule_03_12.quaternion);
  }
  mesh_capsule_03_12.castShadow = options.castShadow ?? true;
  mesh_capsule_03_12.receiveShadow = options.receiveShadow ?? true;
  mesh_capsule_03_12.userData.sculptComponent = {"id": "capsule-03", "name": "Capsule 3 (pink)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.087, -0.305, 0.05], "rotation": [0, 0, 0]}, "material": "capsule-pink", "materialLayers": ["capsule-pink"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 122, 158, 1.0)", "secondaryAlbedo": "rgba(255, 122, 158, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "pink top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_03_12.add(mesh_capsule_03_12);
  meshes["capsule-03"] = mesh_capsule_03_12;
  colliders["capsule-03"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_capsule_04_13 = makeAttachmentEndpoint(null);
  const node_capsule_04_13 = new THREE.Group();
  node_capsule_04_13.name = "Capsule 4 (sky)__pivot";
  node_capsule_04_13.scale.set(1, 1, 1);
  if (endpoint_capsule_04_13) {
    node_capsule_04_13.position.copy(endpoint_capsule_04_13.start);
    node_capsule_04_13.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_capsule_04_13.position.set(0.26, -0.305, 0.0);
    node_capsule_04_13.rotation.set(0.0, 0.0, 0.0);
  }
  node_capsule_04_13.userData.sculptComponent = {"id": "capsule-04", "name": "Capsule 4 (sky)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.26, -0.305, 0.0], "rotation": [0, 0, 0]}, "material": "capsule-sky", "materialLayers": ["capsule-sky"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(91, 200, 255, 1.0)", "secondaryAlbedo": "rgba(91, 200, 255, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "sky top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_04_13.userData.actionProfile = {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["dome"] ?? root).add(node_capsule_04_13);
  nodes["capsule-04"] = node_capsule_04_13;
  const mesh_capsule_04_13Geometry = endpoint_capsule_04_13
    ? new THREE.CylinderGeometry(endpoint_capsule_04_13.endRadius, endpoint_capsule_04_13.baseRadius, endpoint_capsule_04_13.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_capsule_04_13) {
    mesh_capsule_04_13Geometry.scale(0.19, 0.19, 0.19);
  }
  const mesh_capsule_04_13 = new THREE.Mesh(
    mesh_capsule_04_13Geometry,
    materialMap["capsule-sky"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_capsule_04_13.name = "Capsule 4 (sky)";
  if (endpoint_capsule_04_13) {
    mesh_capsule_04_13.position.copy(endpoint_capsule_04_13.midpoint);
    mesh_capsule_04_13.quaternion.copy(endpoint_capsule_04_13.quaternion);
  }
  mesh_capsule_04_13.castShadow = options.castShadow ?? true;
  mesh_capsule_04_13.receiveShadow = options.receiveShadow ?? true;
  mesh_capsule_04_13.userData.sculptComponent = {"id": "capsule-04", "name": "Capsule 4 (sky)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.26, -0.305, 0.0], "rotation": [0, 0, 0]}, "material": "capsule-sky", "materialLayers": ["capsule-sky"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(91, 200, 255, 1.0)", "secondaryAlbedo": "rgba(91, 200, 255, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "sky top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_04_13.add(mesh_capsule_04_13);
  meshes["capsule-04"] = mesh_capsule_04_13;
  colliders["capsule-04"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_capsule_05_14 = makeAttachmentEndpoint(null);
  const node_capsule_05_14 = new THREE.Group();
  node_capsule_05_14.name = "Capsule 5 (pink)__pivot";
  node_capsule_05_14.scale.set(1, 1, 1);
  if (endpoint_capsule_05_14) {
    node_capsule_05_14.position.copy(endpoint_capsule_05_14.start);
    node_capsule_05_14.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_capsule_05_14.position.set(-0.18, -0.14, -0.05);
    node_capsule_05_14.rotation.set(0.0, 0.0, 0.0);
  }
  node_capsule_05_14.userData.sculptComponent = {"id": "capsule-05", "name": "Capsule 5 (pink)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.18, -0.14, -0.05], "rotation": [0, 0, 0]}, "material": "capsule-pink", "materialLayers": ["capsule-pink"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 122, 158, 1.0)", "secondaryAlbedo": "rgba(255, 122, 158, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "pink top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_05_14.userData.actionProfile = {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["dome"] ?? root).add(node_capsule_05_14);
  nodes["capsule-05"] = node_capsule_05_14;
  const mesh_capsule_05_14Geometry = endpoint_capsule_05_14
    ? new THREE.CylinderGeometry(endpoint_capsule_05_14.endRadius, endpoint_capsule_05_14.baseRadius, endpoint_capsule_05_14.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_capsule_05_14) {
    mesh_capsule_05_14Geometry.scale(0.19, 0.19, 0.19);
  }
  const mesh_capsule_05_14 = new THREE.Mesh(
    mesh_capsule_05_14Geometry,
    materialMap["capsule-pink"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_capsule_05_14.name = "Capsule 5 (pink)";
  if (endpoint_capsule_05_14) {
    mesh_capsule_05_14.position.copy(endpoint_capsule_05_14.midpoint);
    mesh_capsule_05_14.quaternion.copy(endpoint_capsule_05_14.quaternion);
  }
  mesh_capsule_05_14.castShadow = options.castShadow ?? true;
  mesh_capsule_05_14.receiveShadow = options.receiveShadow ?? true;
  mesh_capsule_05_14.userData.sculptComponent = {"id": "capsule-05", "name": "Capsule 5 (pink)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.18, -0.14, -0.05], "rotation": [0, 0, 0]}, "material": "capsule-pink", "materialLayers": ["capsule-pink"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 122, 158, 1.0)", "secondaryAlbedo": "rgba(255, 122, 158, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "pink top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_05_14.add(mesh_capsule_05_14);
  meshes["capsule-05"] = mesh_capsule_05_14;
  colliders["capsule-05"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_capsule_06_15 = makeAttachmentEndpoint(null);
  const node_capsule_06_15 = new THREE.Group();
  node_capsule_06_15.name = "Capsule 6 (mint)__pivot";
  node_capsule_06_15.scale.set(1, 1, 1);
  if (endpoint_capsule_06_15) {
    node_capsule_06_15.position.copy(endpoint_capsule_06_15.start);
    node_capsule_06_15.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_capsule_06_15.position.set(0.0, -0.14, -0.08);
    node_capsule_06_15.rotation.set(0.0, 0.0, 0.0);
  }
  node_capsule_06_15.userData.sculptComponent = {"id": "capsule-06", "name": "Capsule 6 (mint)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.0, -0.14, -0.08], "rotation": [0, 0, 0]}, "material": "capsule-mint", "materialLayers": ["capsule-mint"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(95, 227, 177, 1.0)", "secondaryAlbedo": "rgba(95, 227, 177, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "mint top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_06_15.userData.actionProfile = {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["dome"] ?? root).add(node_capsule_06_15);
  nodes["capsule-06"] = node_capsule_06_15;
  const mesh_capsule_06_15Geometry = endpoint_capsule_06_15
    ? new THREE.CylinderGeometry(endpoint_capsule_06_15.endRadius, endpoint_capsule_06_15.baseRadius, endpoint_capsule_06_15.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_capsule_06_15) {
    mesh_capsule_06_15Geometry.scale(0.19, 0.19, 0.19);
  }
  const mesh_capsule_06_15 = new THREE.Mesh(
    mesh_capsule_06_15Geometry,
    materialMap["capsule-mint"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_capsule_06_15.name = "Capsule 6 (mint)";
  if (endpoint_capsule_06_15) {
    mesh_capsule_06_15.position.copy(endpoint_capsule_06_15.midpoint);
    mesh_capsule_06_15.quaternion.copy(endpoint_capsule_06_15.quaternion);
  }
  mesh_capsule_06_15.castShadow = options.castShadow ?? true;
  mesh_capsule_06_15.receiveShadow = options.receiveShadow ?? true;
  mesh_capsule_06_15.userData.sculptComponent = {"id": "capsule-06", "name": "Capsule 6 (mint)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.0, -0.14, -0.08], "rotation": [0, 0, 0]}, "material": "capsule-mint", "materialLayers": ["capsule-mint"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(95, 227, 177, 1.0)", "secondaryAlbedo": "rgba(95, 227, 177, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "mint top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_06_15.add(mesh_capsule_06_15);
  meshes["capsule-06"] = mesh_capsule_06_15;
  colliders["capsule-06"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_capsule_07_16 = makeAttachmentEndpoint(null);
  const node_capsule_07_16 = new THREE.Group();
  node_capsule_07_16.name = "Capsule 7 (sky)__pivot";
  node_capsule_07_16.scale.set(1, 1, 1);
  if (endpoint_capsule_07_16) {
    node_capsule_07_16.position.copy(endpoint_capsule_07_16.start);
    node_capsule_07_16.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_capsule_07_16.position.set(0.18, -0.14, -0.05);
    node_capsule_07_16.rotation.set(0.0, 0.0, 0.0);
  }
  node_capsule_07_16.userData.sculptComponent = {"id": "capsule-07", "name": "Capsule 7 (sky)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.18, -0.14, -0.05], "rotation": [0, 0, 0]}, "material": "capsule-sky", "materialLayers": ["capsule-sky"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(91, 200, 255, 1.0)", "secondaryAlbedo": "rgba(91, 200, 255, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "sky top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_07_16.userData.actionProfile = {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["dome"] ?? root).add(node_capsule_07_16);
  nodes["capsule-07"] = node_capsule_07_16;
  const mesh_capsule_07_16Geometry = endpoint_capsule_07_16
    ? new THREE.CylinderGeometry(endpoint_capsule_07_16.endRadius, endpoint_capsule_07_16.baseRadius, endpoint_capsule_07_16.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_capsule_07_16) {
    mesh_capsule_07_16Geometry.scale(0.19, 0.19, 0.19);
  }
  const mesh_capsule_07_16 = new THREE.Mesh(
    mesh_capsule_07_16Geometry,
    materialMap["capsule-sky"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_capsule_07_16.name = "Capsule 7 (sky)";
  if (endpoint_capsule_07_16) {
    mesh_capsule_07_16.position.copy(endpoint_capsule_07_16.midpoint);
    mesh_capsule_07_16.quaternion.copy(endpoint_capsule_07_16.quaternion);
  }
  mesh_capsule_07_16.castShadow = options.castShadow ?? true;
  mesh_capsule_07_16.receiveShadow = options.receiveShadow ?? true;
  mesh_capsule_07_16.userData.sculptComponent = {"id": "capsule-07", "name": "Capsule 7 (sky)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.18, -0.14, -0.05], "rotation": [0, 0, 0]}, "material": "capsule-sky", "materialLayers": ["capsule-sky"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(91, 200, 255, 1.0)", "secondaryAlbedo": "rgba(91, 200, 255, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "sky top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_07_16.add(mesh_capsule_07_16);
  meshes["capsule-07"] = mesh_capsule_07_16;
  colliders["capsule-07"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_capsule_08_17 = makeAttachmentEndpoint(null);
  const node_capsule_08_17 = new THREE.Group();
  node_capsule_08_17.name = "Capsule 8 (grape)__pivot";
  node_capsule_08_17.scale.set(1, 1, 1);
  if (endpoint_capsule_08_17) {
    node_capsule_08_17.position.copy(endpoint_capsule_08_17.start);
    node_capsule_08_17.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_capsule_08_17.position.set(0.36, -0.14, -0.05);
    node_capsule_08_17.rotation.set(0.0, 0.0, 0.0);
  }
  node_capsule_08_17.userData.sculptComponent = {"id": "capsule-08", "name": "Capsule 8 (grape)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.36, -0.14, -0.05], "rotation": [0, 0, 0]}, "material": "capsule-grape", "materialLayers": ["capsule-grape"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(180, 140, 255, 1.0)", "secondaryAlbedo": "rgba(180, 140, 255, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "grape top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_08_17.userData.actionProfile = {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["dome"] ?? root).add(node_capsule_08_17);
  nodes["capsule-08"] = node_capsule_08_17;
  const mesh_capsule_08_17Geometry = endpoint_capsule_08_17
    ? new THREE.CylinderGeometry(endpoint_capsule_08_17.endRadius, endpoint_capsule_08_17.baseRadius, endpoint_capsule_08_17.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_capsule_08_17) {
    mesh_capsule_08_17Geometry.scale(0.19, 0.19, 0.19);
  }
  const mesh_capsule_08_17 = new THREE.Mesh(
    mesh_capsule_08_17Geometry,
    materialMap["capsule-grape"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_capsule_08_17.name = "Capsule 8 (grape)";
  if (endpoint_capsule_08_17) {
    mesh_capsule_08_17.position.copy(endpoint_capsule_08_17.midpoint);
    mesh_capsule_08_17.quaternion.copy(endpoint_capsule_08_17.quaternion);
  }
  mesh_capsule_08_17.castShadow = options.castShadow ?? true;
  mesh_capsule_08_17.receiveShadow = options.receiveShadow ?? true;
  mesh_capsule_08_17.userData.sculptComponent = {"id": "capsule-08", "name": "Capsule 8 (grape)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.36, -0.14, -0.05], "rotation": [0, 0, 0]}, "material": "capsule-grape", "materialLayers": ["capsule-grape"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(180, 140, 255, 1.0)", "secondaryAlbedo": "rgba(180, 140, 255, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "grape top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_08_17.add(mesh_capsule_08_17);
  meshes["capsule-08"] = mesh_capsule_08_17;
  colliders["capsule-08"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_capsule_09_18 = makeAttachmentEndpoint(null);
  const node_capsule_09_18 = new THREE.Group();
  node_capsule_09_18.name = "Capsule 9 (grape)__pivot";
  node_capsule_09_18.scale.set(1, 1, 1);
  if (endpoint_capsule_09_18) {
    node_capsule_09_18.position.copy(endpoint_capsule_09_18.start);
    node_capsule_09_18.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_capsule_09_18.position.set(-0.09, 0.025, 0.02);
    node_capsule_09_18.rotation.set(0.0, 0.0, 0.0);
  }
  node_capsule_09_18.userData.sculptComponent = {"id": "capsule-09", "name": "Capsule 9 (grape)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.09, 0.025, 0.02], "rotation": [0, 0, 0]}, "material": "capsule-grape", "materialLayers": ["capsule-grape"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(180, 140, 255, 1.0)", "secondaryAlbedo": "rgba(180, 140, 255, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "grape top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_09_18.userData.actionProfile = {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["dome"] ?? root).add(node_capsule_09_18);
  nodes["capsule-09"] = node_capsule_09_18;
  const mesh_capsule_09_18Geometry = endpoint_capsule_09_18
    ? new THREE.CylinderGeometry(endpoint_capsule_09_18.endRadius, endpoint_capsule_09_18.baseRadius, endpoint_capsule_09_18.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_capsule_09_18) {
    mesh_capsule_09_18Geometry.scale(0.19, 0.19, 0.19);
  }
  const mesh_capsule_09_18 = new THREE.Mesh(
    mesh_capsule_09_18Geometry,
    materialMap["capsule-grape"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_capsule_09_18.name = "Capsule 9 (grape)";
  if (endpoint_capsule_09_18) {
    mesh_capsule_09_18.position.copy(endpoint_capsule_09_18.midpoint);
    mesh_capsule_09_18.quaternion.copy(endpoint_capsule_09_18.quaternion);
  }
  mesh_capsule_09_18.castShadow = options.castShadow ?? true;
  mesh_capsule_09_18.receiveShadow = options.receiveShadow ?? true;
  mesh_capsule_09_18.userData.sculptComponent = {"id": "capsule-09", "name": "Capsule 9 (grape)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.09, 0.025, 0.02], "rotation": [0, 0, 0]}, "material": "capsule-grape", "materialLayers": ["capsule-grape"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(180, 140, 255, 1.0)", "secondaryAlbedo": "rgba(180, 140, 255, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "grape top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_09_18.add(mesh_capsule_09_18);
  meshes["capsule-09"] = mesh_capsule_09_18;
  colliders["capsule-09"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};

  const endpoint_capsule_10_19 = makeAttachmentEndpoint(null);
  const node_capsule_10_19 = new THREE.Group();
  node_capsule_10_19.name = "Capsule 10 (yellow)__pivot";
  node_capsule_10_19.scale.set(1, 1, 1);
  if (endpoint_capsule_10_19) {
    node_capsule_10_19.position.copy(endpoint_capsule_10_19.start);
    node_capsule_10_19.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_capsule_10_19.position.set(0.09, 0.025, 0.02);
    node_capsule_10_19.rotation.set(0.0, 0.0, 0.0);
  }
  node_capsule_10_19.userData.sculptComponent = {"id": "capsule-10", "name": "Capsule 10 (yellow)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.09, 0.025, 0.02], "rotation": [0, 0, 0]}, "material": "capsule-yellow", "materialLayers": ["capsule-yellow"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 200, 0, 1.0)", "secondaryAlbedo": "rgba(255, 200, 0, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "yellow top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_10_19.userData.actionProfile = {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}};
  (nodes["dome"] ?? root).add(node_capsule_10_19);
  nodes["capsule-10"] = node_capsule_10_19;
  const mesh_capsule_10_19Geometry = endpoint_capsule_10_19
    ? new THREE.CylinderGeometry(endpoint_capsule_10_19.endRadius, endpoint_capsule_10_19.baseRadius, endpoint_capsule_10_19.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_capsule_10_19) {
    mesh_capsule_10_19Geometry.scale(0.19, 0.19, 0.19);
  }
  const mesh_capsule_10_19 = new THREE.Mesh(
    mesh_capsule_10_19Geometry,
    materialMap["capsule-yellow"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_capsule_10_19.name = "Capsule 10 (yellow)";
  if (endpoint_capsule_10_19) {
    mesh_capsule_10_19.position.copy(endpoint_capsule_10_19.midpoint);
    mesh_capsule_10_19.quaternion.copy(endpoint_capsule_10_19.quaternion);
  }
  mesh_capsule_10_19.castShadow = options.castShadow ?? true;
  mesh_capsule_10_19.receiveShadow = options.receiveShadow ?? true;
  mesh_capsule_10_19.userData.sculptComponent = {"id": "capsule-10", "name": "Capsule 10 (yellow)", "level": "meso", "role": "toy-capsule", "importance": 0.7, "confidence": 0.85, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.", "geometryDescriptor": {"topologyIntent": "sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "dome", "attachment": null, "dimensions": {"width": 0.19, "height": 0.19, "depth": 0.19, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.09, 0.025, 0.02], "rotation": [0, 0, 0]}, "material": "capsule-yellow", "materialLayers": ["capsule-yellow"], "colorMaterialRecipe": {"dominantAlbedo": "rgba(255, 200, 0, 1.0)", "secondaryAlbedo": "rgba(255, 200, 0, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidence": ["full-object"], "samplingNotes": "yellow top-hemisphere fill, white bottom."}, "actionProfile": {"animationRole": "loose-capsule", "pivot": {"mode": "explicit", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.8}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."}, "constraints": [], "destruction": {"breakable": false, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []}}, "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"}, "evidenceRefs": ["full-object", "zone-r1c1"], "details": [], "fidelityTier": "blockout"};
  node_capsule_10_19.add(mesh_capsule_10_19);
  meshes["capsule-10"] = mesh_capsule_10_19;
  colliders["capsule-10"] = {"type": "sphere", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simple proxy matching the primitive."};
  // repetition system "capsule-set" describes 10 parts that are already built individually; not instanced.

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": false, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry", "skipReason": "The reference is a flat-colour toon illustration: every material is a solid fill (rule: solid albedo for flat paint). Scalar PBR values are set per material from sampled hex fills; see spec.risks and materials[].textureless."}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createJackGachaCapsuleMachineLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Jack Gacha capsule machine look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"id": "key", "type": "directional", "direction": "upper-front-left (from the viewer's left, ~35 deg elevation, ~30 deg left of the view axis)", "color": "#FFFFFF", "intensity": 1.0, "evidence": "glass highlight ellipse upper-left; capsule highlights upper-left; drop shadow offset lower-right"}, {"id": "fill", "type": "ambient", "direction": "omni", "color": "#FFF3C4", "intensity": 0.6, "evidence": "no dark side on any part; toon flat fills"}, {"id": "contact-shadow", "type": "shadow", "direction": "offset lower-right", "color": "#000000", "intensity": 0.18, "evidence": "hard offset contact shadow / ground shadow under the housing and dome rim; small ambient occlusion only at the dome seam, tray mouth and under the crank disc"}, {"id": "environment", "type": "environment", "direction": "omni", "color": "#FFF7D6", "intensity": 0.8, "evidence": "needed for the transmissive dome to read as glass (a warm studio room environment, no visible HDRI detail)"}, {"id": "exposure-tonemapping", "type": "exposure", "exposure": 1.0, "toneMapping": "ACESFilmic", "background": "#FFC800 page yellow (transparent in the reference)", "evidence": "flat toon value range: exposure 1.0 with ACES filmic tone mapping keeps the saturated fills from clipping; shadow softness 0 (hard offset) to match the sticker drop shadow"}];
  lights.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": false, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry", "skipReason": "The reference is a flat-colour toon illustration: every material is a solid fill (rule: solid albedo for flat paint). Scalar PBR values are set per material from sampled hex fills; see spec.risks and materials[].textureless."}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createJackGachaCapsuleMachineEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameJackGachaCapsuleMachineCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createJackGachaCapsuleMachinePresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureJackGachaCapsuleMachineRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createJackGachaCapsuleMachineInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}

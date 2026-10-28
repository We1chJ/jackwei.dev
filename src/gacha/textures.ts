// Procedural textures (no image files): orange-peel paint normal, brushed-steel roughness,
// and the printed artwork (header card, price label, arrow sticker, flap print).
import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

// Deterministic value noise so every load looks the same.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Height field -> tangent-space normal map. */
function heightToNormal(height: Float32Array, size: number, strength: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = (xx: number, yy: number) => height[((yy + size) % size) * size + ((xx + size) % size)];
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = (-dx / len * 0.5 + 0.5) * 255;
      data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
      data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Fine orange-peel texture of sprayed paint: blurred random bumps. */
export function orangePeelNormal(): THREE.DataTexture {
  const size = 256, r = rng(7);
  let h = new Float32Array(size * size).map(() => r());
  for (let pass = 0; pass < 3; pass++) {                       // box blur -> soft bumps
    const out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) s += h[y * size + ((x + k + size) % size)] + h[((y + k + size) % size) * size + x];
      out[y * size + x] = s / 10;
    }
    h = out;
  }
  return heightToNormal(h, size, 6);
}

/** Horizontal brushed-metal streaks as a roughness map (greyscale). */
export function brushedRoughness(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512), r = rng(21);
  ctx.fillStyle = '#6a6a6a'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const y = r() * 512, v = 70 + r() * 90;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.35})`;
    ctx.fillRect(r() * 512 - 200, y, 120 + r() * 520, 0.6 + r() * 1.2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

async function fontsReady(spec: string) {
  try { await document.fonts.load(spec); } catch { /* fall back to the stack */ }
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Printed header card: brand yellow, mascot medallion, name and the one rule. */
export function headerCard(): THREE.CanvasTexture {
  const [c, ctx] = canvas(1600, 500);
  const tex = finish(c);
  const draw = (mascot?: HTMLImageElement) => {
    const g = ctx.createLinearGradient(0, 0, 0, 500);
    g.addColorStop(0, '#FFD21F'); g.addColorStop(1, '#FFBE00');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1600, 500);
    // halftone dots, the printed-card feel
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 10; y < 500; y += 22) for (let x = (y / 22) % 2 ? 11 : 0; x < 1600; x += 22) { ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill(); }
    // medallion
    ctx.save();
    ctx.beginPath(); ctx.arc(250, 250, 190, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
    ctx.beginPath(); ctx.arc(250, 250, 176, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(250, 250, 164, 0, Math.PI * 2); ctx.clip();
    if (mascot) ctx.drawImage(mascot, 86, 86, 328, 328); else { ctx.fillStyle = '#FFC800'; ctx.fillRect(86, 86, 328, 328); }
    ctx.restore();
    ctx.fillStyle = '#111';
    // Fit the wordmark and the strapline into the space right of the medallion.
    const fit = (text: string, font: (px: number) => string, start: number, maxW: number) => {
      let px = start; ctx.font = font(px);
      while (ctx.measureText(text).width > maxW && px > 10) { px -= 4; ctx.font = font(px); }
      return px;
    };
    ctx.textBaseline = 'alphabetic';
    fit('JACK GACHA', (px) => `${px}px "Lilita One", "Arial Black", sans-serif`, 230, 1040);
    ctx.fillText('JACK GACHA', 490, 290);
    fit('1 TURN = 1 PROJECT  •  NO REFUNDS', (px) => `800 ${px}px Nunito, "Segoe UI", sans-serif`, 64, 1040);
    ctx.fillText('1 TURN = 1 PROJECT  •  NO REFUNDS', 494, 392);
    tex.needsUpdate = true;
  };
  draw();
  Promise.all([fontsReady('220px "Lilita One"'), fontsReady('700 62px Nunito'), loadImage('/mascot.jpg').catch(() => undefined)])
    .then(([, , img]) => draw(img as HTMLImageElement | undefined));
  return tex;
}

/** Small printed price label beside the handle. */
export function priceLabel(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 256);
  const tex = finish(c);
  const draw = () => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 512, 70);
    ctx.fillStyle = '#FFC800';
    ctx.font = '800 50px Nunito, "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('PRICE', 256, 54);
    ctx.fillStyle = '#111';
    ctx.font = '150px "Lilita One", "Arial Black", sans-serif';
    ctx.fillText('FREE', 256, 222);
    tex.needsUpdate = true;
  };
  draw();
  fontsReady('150px "Lilita One"').then(draw);
  return tex;
}

/** Curved "TURN" arrow printed around the handle ring. */
export function turnArrow(): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 1024);
  const tex = finish(c);
  const draw = () => {
    ctx.clearRect(0, 0, 1024, 1024);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 34; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(512, 512, 455, -Math.PI * 0.95, -Math.PI * 0.12); ctx.stroke();
    const a = -Math.PI * 0.12, tip = [512 + Math.cos(a) * 455, 512 + Math.sin(a) * 455];
    ctx.fillStyle = '#111'; ctx.beginPath();
    ctx.moveTo(tip[0] + 34, tip[1] - 10); ctx.lineTo(tip[0] - 52, tip[1] - 40); ctx.lineTo(tip[0] - 20, tip[1] + 62); ctx.closePath(); ctx.fill();
    ctx.font = '800 66px Nunito, "Segoe UI", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('TURN', 512, 120);
    tex.needsUpdate = true;
  };
  draw();
  fontsReady('800 66px Nunito').then(draw);
  return tex;
}

/** "PUSH" print on the exit flap. */
export function flapPrint(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 256);
  const tex = finish(c);
  const draw = () => {
    ctx.clearRect(0, 0, 512, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 64px Nunito, "Segoe UI", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('LIFT', 256, 226);
    tex.needsUpdate = true;
  };
  draw();
  fontsReady('800 64px Nunito').then(draw);
  return tex;
}

// Printed artwork for the claw machine: marquee sign, the backdrop behind the pit and the
// cabinet's front decal.
import * as THREE from 'three';
import { canvas, finish, fontsReady, loadImage } from '../gacha/textures';

const TITLE = (px: number) => `${px}px "Lilita One", "Arial Black", sans-serif`;
const BODY = (px: number, w = 900) => `${w} ${px}px Nunito, "Segoe UI", sans-serif`;

let mascot: HTMLImageElement | undefined;
const ready = Promise.all([fontsReady(TITLE(60)), fontsReady(BODY(26)), loadImage('/mascot.jpg').then((i) => { mascot = i; }).catch(() => undefined)]);

function live(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const [c, ctx] = canvas(w, h);
  const tex = finish(c);
  // save/restore: each redraw starts from default canvas state (no leaked textAlign etc.)
  const paint = () => { ctx.save(); ctx.clearRect(0, 0, w, h); draw(ctx); ctx.restore(); tex.needsUpdate = true; };
  paint();
  void ready.then(paint);
  return tex;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

/** Marquee: drawn unlit so it reads as a backlit sign. */
export function marquee(): THREE.CanvasTexture {
  const W = 1200, H = 300;
  return live(W, H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#FF4F9A'); g.addColorStop(1, '#C2187A');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 40; i++) star(ctx, (i * 211) % W, (i * 97) % H, 8 + (i % 4) * 4);
    ctx.save(); ctx.beginPath(); ctx.arc(150, H / 2, 98, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(150, H / 2, 88, 0, Math.PI * 2); ctx.clip();
    if (mascot) ctx.drawImage(mascot, 62, H / 2 - 88, 176, 176);
    ctx.restore();
    ctx.font = TITLE(150); ctx.textBaseline = 'middle';
    ctx.lineWidth = 16; ctx.strokeStyle = '#3B0A2A'; ctx.strokeText("JACK'S CLAW", 290, H / 2 + 8);
    ctx.fillStyle = '#FFF4B8'; ctx.fillText("JACK'S CLAW", 290, H / 2 + 8);
  });
}

/** Backdrop on the inside back wall of the pit. */
export function backdrop(): THREE.CanvasTexture {
  const W = 1024, H = 900;
  return live(W, H, (ctx) => {
    const g = ctx.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.4, W * 0.8);
    g.addColorStop(0, '#7B4DFF'); g.addColorStop(1, '#2A1466');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) { ctx.fillStyle = i % 3 ? 'rgba(255,255,255,0.14)' : 'rgba(255,214,74,0.5)'; star(ctx, (i * 173) % W, (i * 131) % H, 10 + (i % 5) * 5); }
    ctx.textAlign = 'center'; ctx.font = TITLE(130); ctx.fillStyle = '#FFD84A';
    ctx.lineWidth = 12; ctx.strokeStyle = '#1A0B40'; ctx.strokeText('WIN A JACK!', W / 2, 200); ctx.fillText('WIN A JACK!', W / 2, 200);
    ctx.font = BODY(44); ctx.fillStyle = '#fff'; ctx.fillText('100% plush  •  0% refunds', W / 2, 280);
  });
}

/** Front decal on the lower cabinet's upper band. */
export function frontDecal(): THREE.CanvasTexture {
  const W = 1024, H = 360;
  return live(W, H, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    for (let i = 0; i < 18; i++) star(ctx, 40 + (i * 157) % (W - 80), 30 + (i * 89) % (H - 60), 10 + (i % 4) * 5);
    ctx.textAlign = 'center'; ctx.fillStyle = '#FFF4B8'; ctx.font = TITLE(130);
    ctx.lineWidth = 14; ctx.strokeStyle = '#3B0A2A'; ctx.strokeText('FREE PLAY', W / 2, 170); ctx.fillText('FREE PLAY', W / 2, 170);
    ctx.font = BODY(40); ctx.fillStyle = '#fff'; ctx.fillText('SKILL GAME*', W / 2, 250);
    ctx.font = BODY(26, 800); ctx.fillText('*it is mostly luck', W / 2, 300);
  });
}

/** "PUSH" / "PRIZE" print on the door. */
export function prizePrint(): THREE.CanvasTexture {
  return live(512, 256, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = BODY(58); ctx.fillText('PRIZE', 256, 100);
    ctx.font = BODY(36, 800); ctx.fillText('push', 256, 170);
  });
}

/** Printed top of the control panel: arrows round the joystick, DROP by the button. */
export function panelPrint(): THREE.CanvasTexture {
  const W = 1024, H = 136;   // maps onto the panel top, x from -0.38 to 0.38 m
  return live(W, H, (ctx) => {
    ctx.fillStyle = '#121318'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; ctx.strokeRect(6, 6, W - 12, H - 12);
    const jx = ((-0.12 + 0.38) / 0.76) * W, bx = ((0.12 + 0.38) / 0.76) * W, cy = H / 2;
    ctx.fillStyle = '#FFD23F'; ctx.strokeStyle = '#FFD23F'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(jx, cy, 54, 0, Math.PI * 2); ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
    const arrow = (a: number) => {
      ctx.save(); ctx.translate(jx + Math.cos(a) * 64, cy + Math.sin(a) * 64); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -10); ctx.lineTo(-6, 10); ctx.closePath(); ctx.fill(); ctx.restore();
    };
    [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(arrow);
    ctx.font = BODY(30); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('MOVE', jx - 92, cy);
    ctx.textAlign = 'left'; ctx.fillStyle = '#FF4F6A'; ctx.font = TITLE(44);
    ctx.fillText('DROP!', bx + 72, cy + 2);
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = BODY(22, 800);
    ctx.fillText('FREE PLAY', W / 2, cy);
  });
}

/** Perforated speaker grille. */
export function speakerGrille(): THREE.CanvasTexture {
  return live(256, 256, (ctx) => {
    ctx.fillStyle = '#1A1B20'; ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#050506';
    for (let y = 14; y < 256; y += 16) for (let x = 14 + ((y / 16) % 2) * 8; x < 256; x += 16) {
      if (Math.hypot(x - 128, y - 128) < 112) { ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill(); }
    }
  });
}

/** Little lit coin-mech display. */
export function coinDisplay(): THREE.CanvasTexture {
  return live(128, 64, (ctx) => {
    ctx.fillStyle = '#1A0303'; ctx.fillRect(0, 0, 128, 64);
    ctx.font = '700 38px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#FF3B2F'; ctx.shadowBlur = 10; ctx.fillStyle = '#FF5A4A'; ctx.fillText('FREE', 64, 34);
  });
}

/** Sticker on the chute guard so the goal is obvious. */
export function prizeSticker(): THREE.CanvasTexture {
  return live(256, 72, (ctx) => {
    ctx.fillStyle = '#FFD23F'; ctx.beginPath(); ctx.roundRect(0, 0, 256, 72, 14); ctx.fill();
    ctx.fillStyle = '#3B0A2A'; ctx.font = TITLE(46); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('▼ PRIZE ▼', 128, 38);
  });
}

/** Side wrap for the cabinet's flank. */
export function clawSide(): THREE.CanvasTexture {
  return live(512, 1000, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 1000);
    g.addColorStop(0, '#FF6FB0'); g.addColorStop(1, '#E2348A');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 1000);
    for (let i = 0; i < 30; i++) { ctx.fillStyle = i % 3 ? 'rgba(255,255,255,0.18)' : 'rgba(255,214,74,0.55)'; star(ctx, (i * 151) % 512, (i * 97) % 1000, 10 + (i % 4) * 6); }
    ctx.save(); ctx.beginPath(); ctx.arc(256, 380, 150, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(256, 380, 136, 0, Math.PI * 2); ctx.clip();
    if (mascot) ctx.drawImage(mascot, 120, 244, 272, 272);
    ctx.restore();
    ctx.textAlign = 'center'; ctx.font = TITLE(92); ctx.lineWidth = 12; ctx.strokeStyle = '#3B0A2A'; ctx.fillStyle = '#FFF4B8';
    ctx.strokeText('GRAB', 256, 680); ctx.fillText('GRAB', 256, 680);
    ctx.strokeText('A JACK', 256, 780); ctx.fillText('A JACK', 256, 780);
  });
}

/** Label strip on the front face of the control ledge, facing the player. */
export function panelFront(): THREE.CanvasTexture {
  const W = 1024, H = 92;    // maps onto the ledge front, x from -0.38 to 0.38 m
  return live(W, H, (ctx) => {
    const jx = ((-0.12 + 0.38) / 0.76) * W, bx = ((0.12 + 0.38) / 0.76) * W;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#3B0A2A';
    ctx.font = TITLE(58); ctx.fillText('◀ MOVE ▶', jx, H / 2 + 3);
    ctx.fillStyle = '#C8102E'; ctx.fillText('▼ DROP', bx, H / 2 + 3);
  });
}

/** A bulb's glow on the marquee. */
export function bulbGlow(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.3, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return finish(c);
}

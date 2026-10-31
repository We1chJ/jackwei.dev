// Printed artwork for the card vending machine, drawn on canvases (no image files except the
// mascot): holographic project cards, card backs, grading labels, keypad keys, the LED
// display and the lit header sign.
import * as THREE from 'three';
import { canvas, finish, fontsReady, loadImage } from '../gacha/textures';
import type { Project, Rarity } from '../data/projects';

const TITLE = (px: number) => `${px}px "Lilita One", "Arial Black", sans-serif`;
const BODY = (px: number, w = 800) => `${w} ${px}px Nunito, "Segoe UI", sans-serif`;

let mascot: HTMLImageElement | undefined;
const ready = Promise.all([fontsReady(TITLE(60)), fontsReady(BODY(26)), loadImage('/mascot.jpg').then((i) => { mascot = i; }).catch(() => undefined)]);

/** Draw now with fallbacks, and again once fonts and the mascot have loaded. */
function live(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, res = 1): THREE.CanvasTexture {
  const [c, ctx] = canvas(w * res, h * res);
  const tex = finish(c);
  // save/restore: each redraw starts from default canvas state (no leaked textAlign etc.)
  const paint = () => { ctx.save(); ctx.scale(res, res); ctx.clearRect(0, 0, w, h); draw(ctx); ctx.restore(); tex.needsUpdate = true; };
  paint();
  void ready.then(paint);
  return tex;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
  const words = text.split(' ');
  let line = '', n = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + n * lineH); line = w; n++;
      if (n >= maxLines) return;
    } else line = test;
  }
  ctx.fillText(line, x, y + n * lineH);
}

export const RARITY: Record<Rarity, { a: string; b: string; ink: string; stars: number }> = {
  COMMON: { a: '#DDE6EE', b: '#9FB3C6', ink: '#1B2B3A', stars: 1 },
  RARE: { a: '#8FE3FF', b: '#7A5CFF', ink: '#120B3A', stars: 2 },
  LEGENDARY: { a: '#FFE27A', b: '#FF8A1F', ink: '#3A1C00', stars: 3 },
  SHINY: { a: '#FF9EE0', b: '#7AF5FF', ink: '#2A0B33', stars: 4 },
};

/** Card front: rarity foil frame, title, mascot art on a sunburst, blurb and tags. */
export function cardFront(p: Project, index: number, total: number, res = 1): THREE.CanvasTexture {
  const W = 512, H = 716, r = RARITY[p.rarity];
  return live(W, H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, r.a); g.addColorStop(1, r.b);
    if (p.rarity === 'SHINY') { g.addColorStop(0.33, '#FFF27A'); g.addColorStop(0.66, '#8CFFB0'); }
    ctx.fillStyle = g; rounded(ctx, 0, 0, W, H, 34); ctx.fill();
    // inner panel
    ctx.fillStyle = 'rgba(255,255,255,0.88)'; rounded(ctx, 22, 22, W - 44, H - 44, 22); ctx.fill();
    ctx.strokeStyle = r.ink; ctx.lineWidth = 4; rounded(ctx, 22, 22, W - 44, H - 44, 22); ctx.stroke();

    // title bar
    ctx.fillStyle = r.ink; ctx.textBaseline = 'alphabetic';
    let px = 50; ctx.font = TITLE(px);
    while (ctx.measureText(p.title).width > W - 170 && px > 24) { px -= 2; ctx.font = TITLE(px); }
    ctx.fillText(p.title, 44, 84);
    ctx.font = TITLE(34); ctx.textAlign = 'right';
    ctx.fillText('★'.repeat(r.stars), W - 44, 80); ctx.textAlign = 'left';

    // art window: sunburst + mascot
    const ax = 44, ay = 104, aw = W - 88, ah = 300;
    ctx.save(); rounded(ctx, ax, ay, aw, ah, 16); ctx.clip();
    const cx = ax + aw / 2, cy = ay + ah / 2;
    ctx.fillStyle = r.b; ctx.fillRect(ax, ay, aw, ah);
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = i % 2 ? r.a : 'rgba(255,255,255,0.35)';
      const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 420, a0, a1); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let y = ay; y < ay + ah; y += 14) for (let x = ax + ((y / 14) % 2 ? 7 : 0); x < ax + aw; x += 14) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx, cy, 118, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 108, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 100, 0, Math.PI * 2); ctx.clip();
    if (mascot) ctx.drawImage(mascot, cx - 100, cy - 100, 200, 200); else { ctx.fillStyle = '#FFC800'; ctx.fillRect(cx - 100, cy - 100, 200, 200); }
    ctx.restore();
    ctx.strokeStyle = r.ink; ctx.lineWidth = 4; rounded(ctx, ax, ay, aw, ah, 16); ctx.stroke();

    // rarity ribbon
    ctx.fillStyle = r.ink; rounded(ctx, ax, ay + ah + 14, 190, 40, 20); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = BODY(22, 900); ctx.fillText(p.rarity, ax + 18, ay + ah + 42);

    // blurb
    ctx.fillStyle = r.ink; ctx.font = BODY(25, 700);
    wrap(ctx, p.blurb, 44, ay + ah + 92, W - 88, 33, 4);

    // tags + footer
    ctx.font = BODY(19, 900);
    let tx = 44;
    for (const t of p.tags.slice(0, 3)) {
      const tw = ctx.measureText(t).width + 22;
      if (tx + tw > W - 44) break;
      ctx.fillStyle = r.b; rounded(ctx, tx, H - 112, tw, 32, 16); ctx.fill();
      ctx.fillStyle = r.ink; ctx.fillText(t, tx + 11, H - 89); tx += tw + 8;
    }
    ctx.fillStyle = r.ink; ctx.font = BODY(17, 900);
    ctx.fillText(`JACK CARDS  •  #${String(index + 1).padStart(3, '0')}/${String(total).padStart(3, '0')}`, 44, H - 46);
  }, res);
}

/** Shared card back: navy with the brand mark. */
export function cardBack(res = 1): THREE.CanvasTexture {
  const W = 512, H = 716;
  return live(W, H, (ctx) => {
    ctx.fillStyle = '#14193A'; rounded(ctx, 0, 0, W, H, 34); ctx.fill();
    ctx.strokeStyle = '#FFC800'; ctx.lineWidth = 10; rounded(ctx, 26, 26, W - 52, H - 52, 22); ctx.stroke();
    ctx.fillStyle = 'rgba(255,200,0,0.12)';
    for (let y = 40; y < H; y += 26) for (let x = (y / 26) % 2 ? 53 : 40; x < W; x += 26) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2 - 40, 120, 0, Math.PI * 2); ctx.fillStyle = '#FFC800'; ctx.fill(); ctx.clip();
    if (mascot) ctx.drawImage(mascot, W / 2 - 112, H / 2 - 152, 224, 224);
    ctx.restore();
    ctx.fillStyle = '#FFC800'; ctx.font = TITLE(66); ctx.textAlign = 'center';
    ctx.fillText('JACK CARDS', W / 2, H / 2 + 160);
  }, res);
}

/** A card's two faces as pictures for the page (HeldCard.tsx), twice the texture's resolution. */
export async function cardPictures(p: Project, index: number, total: number) {
  await ready;
  const picture = (t: THREE.CanvasTexture) => { const url = (t.image as HTMLCanvasElement).toDataURL('image/png'); t.dispose(); return url; };
  return { front: picture(cardFront(p, index, total, 2)), back: picture(cardBack(2)) };
}

/** Red grading label clipped into the top of each slab. */
export function gradeLabel(p: Project, index: number): THREE.CanvasTexture {
  const W = 512, H = 104;
  return live(W, H, (ctx) => {
    ctx.fillStyle = '#F3F1EA'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#D7263D'; ctx.fillRect(0, 0, W, 10); ctx.fillRect(0, H - 10, W, 10);
    ctx.fillStyle = '#111'; ctx.font = BODY(22, 900);
    ctx.fillText(`JACK GRADING  •  ${p.title.toUpperCase()}`.slice(0, 34), 18, 46);
    ctx.font = BODY(18, 800); ctx.fillText(`#${String(10000 + index * 37).padStart(6, '0')}`, 18, 78);
    ctx.textAlign = 'right'; ctx.font = TITLE(46); ctx.fillStyle = '#D7263D';
    ctx.fillText(p.rarity === 'SHINY' ? '11' : '10', W - 18, 80);
    ctx.font = BODY(16, 900); ctx.fillStyle = '#111'; ctx.fillText('GEM MT', W - 76, 78);
  });
}

/** One keypad key cap: printed label on black. */
export function keyCap(label: string): THREE.CanvasTexture {
  return live(128, 100, (ctx) => {
    ctx.fillStyle = '#0E0F12'; ctx.fillRect(0, 0, 128, 100);
    ctx.fillStyle = '#F4F4F0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = label.length > 1 ? BODY(34, 900) : TITLE(58);
    ctx.fillText(label, 64, 54);
  });
}

/** Header sign artwork (drawn unlit, so it reads as backlit). */
export function headerSign(): THREE.CanvasTexture {
  const W = 1400, H = 170;
  return live(W, H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#FFD84A'); g.addColorStop(1, '#FFB800');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let y = 8; y < H; y += 18) for (let x = (y / 18) % 2 ? 9 : 0; x < W; x += 18) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.beginPath(); ctx.arc(95, H / 2, 64, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
    ctx.beginPath(); ctx.arc(95, H / 2, 56, 0, Math.PI * 2); ctx.clip();
    if (mascot) ctx.drawImage(mascot, 39, H / 2 - 56, 112, 112);
    ctx.restore();
    ctx.fillStyle = '#14193A'; ctx.font = TITLE(112); ctx.textBaseline = 'middle';
    ctx.fillText('JACK CARDS', 190, H / 2 + 6);
    // Strapline fitted into whatever space the wordmark leaves.
    const room = W - 40 - (190 + ctx.measureText('JACK CARDS').width + 50), line = 'COLLECT THEM ALL  ★  HOLO GUARANTEED';
    let px = 34; ctx.font = BODY(px, 900);
    while (ctx.measureText(line).width > room && px > 14) { px -= 1; ctx.font = BODY(px, 900); }
    ctx.textAlign = 'right';
    ctx.fillText(line, W - 40, H / 2 + 4);
  });
}

/** LED dot-matrix-ish display; returns a setter that redraws it. */
export function ledDisplay(): { texture: THREE.CanvasTexture; show: (text: string, scroll?: number) => void } {
  const W = 512, H = 148;
  const [c, ctx] = canvas(W, H);
  const texture = finish(c);
  let current = '';
  // scroll: seconds since the message started; omitted = centred and still.
  const show = (text: string, scroll?: number) => {
    current = text;
    ctx.fillStyle = '#04140A'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(80,255,140,0.05)';
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 3);
    ctx.font = '700 76px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(90,255,150,0.9)'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#7CFFA8';
    if (scroll === undefined) { ctx.textAlign = 'center'; ctx.fillText(text, W / 2, H / 2 + 4); }
    else {
      const span = ctx.measureText(text).width + W * 0.6, x = W - ((scroll * 190) % span);
      ctx.textAlign = 'left'; ctx.fillText(text, x, H / 2 + 4); ctx.fillText(text, x + span, H / 2 + 4);
    }
    ctx.shadowBlur = 0;
    texture.needsUpdate = true;
  };
  show('SELECT');
  void fontsReady('700 76px Menlo').then(() => show(current));
  return { texture, show };
}

/** Price strip along the front lip of each shelf: slot codes. */
export function shelfStrip(row: string): THREE.CanvasTexture {
  return live(1024, 64, (ctx) => {
    ctx.fillStyle = '#F7F4EA'; ctx.fillRect(0, 0, 1024, 64);
    ctx.fillStyle = '#14193A'; ctx.font = BODY(36, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let c = 0; c < 4; c++) {
      const x = 128 + c * 256;
      ctx.fillText(`${row}${c + 1}`, x - 40, 34);
      ctx.fillStyle = '#D7263D'; ctx.fillText('FREE', x + 50, 34); ctx.fillStyle = '#14193A';
    }
  });
}

/** "PUSH" print for the bin flap. */
export function pushPrint(): THREE.CanvasTexture {
  return live(512, 128, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = BODY(64, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PUSH', 256, 68);
  });
}

/** Printed how-to card above the keypad. */
export function instructionCard(): THREE.CanvasTexture {
  const W = 512, H = 200;
  return live(W, H, (ctx) => {
    ctx.fillStyle = '#F7F4EA'; rounded(ctx, 0, 0, W, H, 18); ctx.fill();
    ctx.fillStyle = '#14193A'; ctx.font = BODY(30, 900); ctx.textBaseline = 'middle';
    const step = (n: string, label: string, sub: string, y: number) => {
      ctx.fillStyle = '#FFC21A'; ctx.beginPath(); ctx.arc(46, y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#14193A'; ctx.textAlign = 'center'; ctx.font = TITLE(36); ctx.fillText(n, 46, y + 2);
      ctx.textAlign = 'left'; ctx.font = BODY(30, 900); ctx.fillText(label, 88, y - 2);
      const w = ctx.measureText(label).width;   // measured in the label's font, before switching
      ctx.font = BODY(20, 800); ctx.fillStyle = '#5A6078'; ctx.fillText(sub, 88 + w + 16, y);
      ctx.fillStyle = '#14193A';
    };
    step('1', 'LETTER', 'row A–D', 52);
    step('2', 'NUMBER', 'slot 1–4', 120);
    ctx.font = BODY(20, 800); ctx.fillStyle = '#5A6078'; ctx.fillText('★ = surprise me      CLR = start over', 24, 178);
  });
}

/** Side wrap graphic for the cabinet's right flank. */
export function sideWrap(): THREE.CanvasTexture {
  const W = 512, H = 1200;
  return live(W, H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#232C63'); g.addColorStop(1, '#141A40');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,194,26,0.12)';
    for (let y = 20; y < H; y += 30) for (let x = (y / 30) % 2 ? 35 : 20; x < W; x += 30) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
    // a fan of three cards
    const card = (x: number, y: number, a: number, c: string) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = '#fff'; rounded(ctx, -90, -126, 180, 252, 16); ctx.fill();
      ctx.fillStyle = c; rounded(ctx, -78, -114, 156, 228, 10); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = TITLE(64); ctx.textAlign = 'center'; ctx.fillText('★', 0, 22);
      ctx.restore();
    };
    card(170, 560, -0.32, '#7A5CFF'); card(340, 560, 0.32, '#FF8A1F'); card(256, 520, 0, '#2FB8FF');
    ctx.save(); ctx.translate(256, 900); ctx.rotate(-0.08);
    ctx.fillStyle = '#FFC21A'; ctx.font = TITLE(120); ctx.textAlign = 'center'; ctx.fillText('JACK', 0, 0); ctx.fillText('CARDS', 0, 120);
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = BODY(30, 900); ctx.textAlign = 'center'; ctx.fillText('HOLO  •  GRADED  •  FREE', 256, 1130);
  });
}

/** The machine's dark inner walls, lit from the top: seams and a falloff, so they read as a lit cabinet. */
export function interiorWall(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#5A6170'); g.addColorStop(0.3, '#343945'); g.addColorStop(1, '#14161C');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  for (let x = 96; x < 512; x += 128) ctx.fillRect(x, 0, 2, 512);
  return finish(c);
}

/** Tap-to-pay reader's little screen. */
export function cardReader(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 160);
  ctx.fillStyle = '#0E2A22'; ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = '#6FF2B4'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  for (const r of [26, 46, 66]) { ctx.beginPath(); ctx.arc(62, 80, r, -0.75, 0.75); ctx.stroke(); }
  ctx.fillStyle = '#6FF2B4'; ctx.font = '800 38px Nunito, "Segoe UI", sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('TAP', 140, 74); ctx.fillText('HERE', 140, 116);
  return finish(c);
}

/** A strip of generic accepted-payment marks. */
export function payMarks(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 64);
  ctx.fillStyle = '#23262C'; ctx.fillRect(0, 0, 512, 64);
  ['#E9EDF2', '#FFC21A', '#39B7A5', '#F2557A'].forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(36 + i * 114, 10, 92, 44, 8); ctx.fill(); });
  return finish(c);
}


// Squishy text for everything that isn't a title. A WebGL mesh per paragraph is out (a browser only
// allows about sixteen live contexts), so words here are plain spans that flatten and spread near the
// pointer, harder while it is pressed, and spring back with a wobble. One listener and one loop for
// the whole page, running only while something is moving.
import { useEffect, type RefObject } from 'react';

const REACH = 80;           // px from a word at which it starts to give
const HOVER = 0.4;          // how far it gives under a hovering pointer; pressed is 1
const STIFF = 260, DAMP = 15;

/** Text split into words the page can squash. Line wrapping and copying are unchanged. */
export function S({ children }: { children: string }) {
  return <>{children.split(/(\s+)/).map((w, i) => (!w || /^\s+$/.test(w) ? w : <span key={i} className="sq">{w}</span>))}</>;
}

type Word = { el: HTMLElement; l: number; t: number; r: number; b: number; a: number; v: number; live: boolean };

export function useSquish(root: RefObject<HTMLElement>) {
  useEffect(() => {
    const box = root.current;
    if (!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let words: Word[] = [], raf = 0, last = 0;
    const pointer = { x: -1e4, y: -1e4, down: false };

    // Where each word sits on the page, so moving the pointer never has to measure anything.
    const measure = () => {
      words = [...box.querySelectorAll<HTMLElement>('.sq')].map((el) => {
        const r = el.getBoundingClientRect();
        return { el, l: r.left + scrollX, t: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY, a: 0, v: 0, live: false };
      });
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60);
      last = now;
      const px = pointer.x + scrollX, py = pointer.y + scrollY, give = pointer.down ? 1 : HOVER;
      let moving = false;
      for (const w of words) {
        const d = Math.hypot(Math.max(w.l - px, 0, px - w.r), Math.max(w.t - py, 0, py - w.b));
        const target = d < REACH ? give * (1 - d / REACH) ** 2 : 0;
        if (!w.live && !target) continue;
        w.v += ((target - w.a) * STIFF - w.v * DAMP) * dt;
        w.a += w.v * dt;
        if (!target && Math.abs(w.a) < 0.002 && Math.abs(w.v) < 0.02) {
          w.a = w.v = 0; w.live = false; w.el.style.transform = '';
          continue;
        }
        w.live = true; moving = true;
        w.el.style.transform = `scale(${(1 + 0.07 * w.a).toFixed(3)}, ${(1 - 0.3 * w.a).toFixed(3)})`;
      }
      if (moving) raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

    const move = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; wake(); };
    const down = (e: PointerEvent) => { pointer.down = true; move(e); };
    const up = (e: PointerEvent) => { pointer.down = false; if (e.pointerType !== 'mouse') pointer.x = pointer.y = -1e4; wake(); };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerdown', down, { passive: true });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      removeEventListener('pointermove', move);
      removeEventListener('pointerdown', down);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
    };
  }, [root]);
}

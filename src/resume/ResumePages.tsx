// The résumé drawn straight from the PDF with pdf.js, so replacing public/assets/ResumeOfficial.pdf
// is still the only step to update it. Each page is sized to fit the window and rendered at exactly
// the screen's pixels, then re-rendered if the window or zoom changes, so the text stays sharp.
//
// Zoom: pinch (trackpad or touch), ctrl/⌘ + scroll, + and − keys, double-click, or the buttons in
// the reel's controls. While zoomed, scrolling or dragging moves around the page. Sizes change
// instantly during a gesture; the sharp re-render follows once it settles.
import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';

const MARGIN = 24;        // px kept clear around the page
const MAX_ZOOM = 4;
const MAX_PIXELS = navigator.maxTouchPoints > 1 ? 16e6 : 40e6; // per page; iPhones refuse bigger canvases
const SETTLE_MS = 180;

export interface ZoomApi { by(f: number): void; reset(): void }

interface Props {
  url: string;
  active: boolean;                         // the résumé is on screen
  scroller: RefObject<HTMLDivElement>;     // the scrolling panel around the pages
  api: MutableRefObject<ZoomApi | null>;
  onZoom: (z: number) => void;
}

export default function ResumePages({ url, active, scroller, api, onZoom }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const zoomRef = useRef(1);

  useEffect(() => {
    let run = 0, timer = 0;
    const doc = (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      return pdfjs.getDocument(url).promise;
    })();

    const render = async () => {
      const id = ++run;
      const d = await doc;
      const dpr = devicePixelRatio || 1, zoom = zoomRef.current;
      const pages: HTMLCanvasElement[] = [];
      for (let i = 1; i <= d.numPages; i++) {
        const page = await d.getPage(i);
        const base = page.getViewport({ scale: 1 });
        // at zoom 1 the whole page is in view, as large as the window allows
        const fit = Math.min((innerWidth - MARGIN * 2) / base.width, (innerHeight - MARGIN * 2) / base.height);
        // whole device pixels, with an even gap to the window edge so centring lands on a pixel
        const even = (n: number, room: number) => { const v = Math.round(n); return (room - v) % 2 ? v - 1 : v; };
        const w = even(base.width * fit * dpr, Math.round(innerWidth * dpr)) * zoom;
        const h = even(base.height * fit * dpr, Math.round(innerHeight * dpr)) * zoom;
        const shrink = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h))); // past the limit it scales up softly
        const cv = document.createElement('canvas');
        cv.width = Math.round(w * shrink);
        cv.height = Math.round(h * shrink);
        cv.dataset.w = String(w / dpr / zoom);
        cv.dataset.h = String(h / dpr / zoom);
        cv.style.width = `${w / dpr}px`;
        cv.style.height = `${h / dpr}px`;
        cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', `Résumé, page ${i} of ${d.numPages}`);
        const viewport = page.getViewport({ scale: cv.width / base.width });
        await page.render({ canvasContext: cv.getContext('2d')!, viewport }).promise;
        if (id !== run) return; // a newer size has taken over
        pages.push(cv);
      }
      box.current?.replaceChildren(...pages);
    };
    const failed = () => { /* the Download PDF link still works */ };
    const later = () => { clearTimeout(timer); timer = window.setTimeout(() => render().catch(failed), SETTLE_MS); };

    // set the zoom, keeping the page point under (x, y) where it is. The point is held for the
    // whole gesture: while the page still fits the window it stays centred and cannot follow, and
    // it catches up as soon as it overflows.
    let held = { x: 0, y: 0, fx: 0, fy: 0, at: 0 };
    const zoomTo = (z: number, x: number, y: number) => {
      const next = Math.min(MAX_ZOOM, Math.max(1, z)), el = box.current, sc = scroller.current;
      if (!el || !sc || next === zoomRef.current) return;
      const now = performance.now();
      if (now - held.at > 300 || Math.hypot(x - held.x, y - held.y) > 40) {
        const a = el.getBoundingClientRect();
        held = { x, y, fx: (x - a.left) / a.width, fy: (y - a.top) / a.height, at: now };
      }
      held.at = now;
      const { fx, fy } = held;
      zoomRef.current = next;
      el.querySelectorAll('canvas').forEach((c) => {
        c.style.width = `${Number(c.dataset.w) * next}px`;
        c.style.height = `${Number(c.dataset.h) * next}px`;
      });
      const b = el.getBoundingClientRect();
      sc.scrollLeft += b.left + fx * b.width - x;
      sc.scrollTop += b.top + fy * b.height - y;
      sc.classList.toggle('zoomed', next > 1);
      onZoom(next);
      later();
    };
    const mid = () => [innerWidth / 2, innerHeight / 2] as const;
    api.current = {
      by: (f) => zoomTo(zoomRef.current * f, ...mid()),
      reset: () => zoomTo(1, ...mid()),
    };

    const sc = scroller.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain scrolling moves around the page
      e.preventDefault();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };
    const onDouble = (e: MouseEvent) => zoomTo(zoomRef.current > 1 ? 1 : 2, e.clientX, e.clientY);
    const onKey = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (e.key === '+' || e.key === '=') zoomTo(zoomRef.current * 1.25, ...mid());
      else if (e.key === '-') zoomTo(zoomRef.current / 1.25, ...mid());
      else if (e.key === '0') zoomTo(1, ...mid());
      else return;
      e.preventDefault();
    };
    // two fingers pinch; one finger scrolls natively
    let pinch = 0;
    const gap = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const onTouchStart = (e: TouchEvent) => { pinch = e.touches.length === 2 ? gap(e) : 0; };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const d = gap(e);
      zoomTo(zoomRef.current * (d / pinch), (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      pinch = d;
    };
    // a mouse drags the page around while zoomed
    let drag: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || zoomRef.current <= 1) return;
      drag = { x: e.clientX, y: e.clientY };
      sc.setPointerCapture(e.pointerId);
      sc.classList.add('dragging');
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      sc.scrollLeft -= e.clientX - drag.x;
      sc.scrollTop -= e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => { drag = null; sc.classList.remove('dragging'); };

    render().catch(failed);
    addEventListener('resize', later);
    addEventListener('keydown', onKey);
    sc.addEventListener('wheel', onWheel, { passive: false });
    sc.addEventListener('dblclick', onDouble);
    sc.addEventListener('touchstart', onTouchStart, { passive: true });
    sc.addEventListener('touchmove', onTouchMove, { passive: false });
    sc.addEventListener('pointerdown', onDown);
    sc.addEventListener('pointermove', onMove);
    sc.addEventListener('pointerup', onUp);
    sc.addEventListener('pointercancel', onUp);
    return () => {
      run++;
      clearTimeout(timer);
      api.current = null;
      removeEventListener('resize', later);
      removeEventListener('keydown', onKey);
      sc.removeEventListener('wheel', onWheel);
      sc.removeEventListener('dblclick', onDouble);
      sc.removeEventListener('touchstart', onTouchStart);
      sc.removeEventListener('touchmove', onTouchMove);
      sc.removeEventListener('pointerdown', onDown);
      sc.removeEventListener('pointermove', onMove);
      sc.removeEventListener('pointerup', onUp);
      sc.removeEventListener('pointercancel', onUp);
    };
  }, [url]);

  // leaving the résumé puts it back to fit
  useEffect(() => { if (!active) api.current?.reset(); }, [active]);

  return <div ref={box} className="reel-pages" />;
}

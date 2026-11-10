// The sections, in whichever presentation is chosen (variant.ts), and the bar that flips between them
// while they are under review. Flipping keeps you at the section you were reading.
import { lazy, Suspense, useEffect, useRef } from 'react';
import Sections from '../Sections';
import { reviewing, setVariant, useUi, VARIANTS, type Variant } from './variant';
import './review.css';

const LAZY: Record<Exclude<Variant, 'cards'>, ReturnType<typeof lazy>> = {
  manga: lazy(() => import('./Manga')),
  dialogue: lazy(() => import('./Dialogue')),
  prizes: lazy(() => import('./Prizes')),
  screen: lazy(() => import('./Screen')),
};

/** The section across the middle of the window, and how far down it the middle is (0 to 1). */
function place() {
  const mid = innerHeight / 2;
  for (const el of document.querySelectorAll<HTMLElement>('[data-stop]')) {
    const r = el.getBoundingClientRect();
    if (r.top <= mid && r.bottom >= mid) return { id: el.id, top: r.top };
  }
  return null;
}

export default function SectionsSwitch() {
  const variant = useUi((s) => s.variant);
  const back = useRef<{ id: string; top: number } | null>(null);

  const pick = (v: Variant) => { back.current = place(); setVariant(v); };

  // Once the new presentation is on the page, put the same section where it was in the window.
  useEffect(() => {
    const to = back.current;
    back.current = null;
    if (!to) return undefined;
    let tries = 0, raf = 0;
    const settle = () => {
      const el = document.getElementById(to.id);
      if (el) scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + scrollY - Math.min(to.top, innerHeight * 0.2)), behavior: 'instant' });
      else if (tries++ < 120) raf = requestAnimationFrame(settle);
    };
    raf = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(raf);
  }, [variant]);

  useEffect(() => {
    if (!reviewing) return undefined;
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest?.('input, textarea, [contenteditable]')) return;
      const v = VARIANTS[Number(e.key) - 1];
      if (v) pick(v.id);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  const Chosen = variant === 'cards' ? null : LAZY[variant];
  return (
    <>
      {Chosen ? <Suspense fallback={<div className="sections" />}><Chosen /></Suspense> : <Sections />}
      {reviewing && (
        <nav className="review-bar" aria-label="Section designs under review">
          <span>Sections</span>
          {VARIANTS.map((v, i) => (
            <button key={v.id} type="button" aria-pressed={variant === v.id} onClick={() => pick(v.id)}><kbd>{i + 1}</kbd>{v.label}</button>
          ))}
        </nav>
      )}
    </>
  );
}

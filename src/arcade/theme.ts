// Light and dark. The page's colours follow html[data-theme] (styles.css); the room follows this store
// (Room.tsx). Switching wipes the whole window over from the button: the browser holds a picture of the
// old look while the new one, already live underneath, is revealed through a growing circle.
import { createStore } from './store';

export type Mode = 'light' | 'dark';
const KEY = 'jackwei-theme';
const WIPE_MS = 900, WIPE_EASE = 'cubic-bezier(.55, 0, .2, 1)';

function saved(): Mode | null {
  try { const m = localStorage.getItem(KEY); return m === 'light' || m === 'dark' ? m : null; } catch { return null; }
}

const first: Mode = saved() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.dataset.theme = first;
export const [theme, useTheme] = createStore({ mode: first });

function apply(mode: Mode) {
  document.documentElement.dataset.theme = mode;
  theme.set({ mode });
  try { localStorage.setItem(KEY, mode); } catch { /* private window: it just won't be remembered */ }
}

/** Swap the look, wiping out from the middle of `from`. */
export function toggleTheme(from: HTMLElement) {
  const mode: Mode = theme.get().mode === 'light' ? 'dark' : 'light';
  const root = document.documentElement, ring = document.querySelector<HTMLElement>('.theme-ring i');
  if (!document.startViewTransition || !ring || matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(mode); return; }
  const box = from.getBoundingClientRect();
  const x = box.left + box.width / 2, y = box.top + box.height / 2;
  const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  Object.assign(ring.style, { left: `${x}px`, top: `${y}px`, width: `${reach * 2}px`, height: `${reach * 2}px` });
  root.classList.add('theme-wipe');
  const wipe = document.startViewTransition(() => apply(mode));
  const timing = { duration: WIPE_MS, easing: WIPE_EASE };
  void wipe.ready.then(() => {
    root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] }, { ...timing, pseudoElement: '::view-transition-new(root)' });
    ring.animate([{ transform: 'translate(-50%, -50%) scale(0)' }, { opacity: 1, offset: 0.8 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 }], timing);
  }).catch(() => {});
  void wipe.finished.finally(() => root.classList.remove('theme-wipe'));
}

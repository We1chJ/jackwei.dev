// The light that travels round every Résumé button (arcade/StarBorder.tsx), in the page's two looks.
import type { CSSProperties } from 'react';
import { useTheme } from '../arcade/theme';

// StarBorder draws the outline itself, so the button's own 2px border goes and the padding takes its place.
const STYLE: CSSProperties = { border: 0, padding: '12px 18px' };

// On the dark page the light is added to what is under it, so it glows on the purple; on the light page it is
// painted over the ink line instead, where added light would vanish into the cream.
export function useStar() {
  const dark = useTheme((s) => s.mode === 'dark');
  return {
    radius: 999, thickness: 2, borderColor: 'var(--ink)', style: STYLE, sparkle: true,
    color: '#FF4F8B', trailColor: '#FFC800', theme: dark ? 'dark' : 'light', glow: dark ? 0.8 : 1, trailLength: dark ? 0.3 : 0.45,
  } as const;
}

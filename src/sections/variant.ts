// Which presentation the readable sections use. The shipped one is 'cards' (src/Sections.tsx); the
// others are designs under review, each in its own lazy chunk so the page that visitors get carries
// none of them. `?ui=manga` on the URL picks one and brings up the review bar (Switch.tsx).
import { createStore } from '../arcade/store';

export const VARIANTS = [
  { id: 'cards', label: 'Current' },
  { id: 'manga', label: 'Manga' },
  { id: 'dialogue', label: 'Dialogue' },
  { id: 'prizes', label: 'Prizes' },
  { id: 'screen', label: 'Screen' },
] as const;
export type Variant = (typeof VARIANTS)[number]['id'];

const asked = new URLSearchParams(location.search).get('ui');
const known = (v: string | null): v is Variant => VARIANTS.some((x) => x.id === v);

/** The review bar shows on the dev server, and anywhere the URL names a variant. */
export const reviewing = asked !== null || import.meta.env.DEV;
export const [ui, useUi] = createStore({ variant: (known(asked) ? asked : 'cards') as Variant });

export function setVariant(variant: Variant) {
  ui.set({ variant });
  const url = new URL(location.href);
  url.searchParams.set('ui', variant);
  history.replaceState(null, '', url);
}

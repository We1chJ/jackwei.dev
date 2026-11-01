// The light and dark switch: a machined pill with a moon cut into it, lit from behind in the light. Going
// dark, a spark runs round the moon's edge and the moon fills with light; going light, the glow behind the
// pill bursts back out. Everything here is CSS (styles.css); the moon's states are stacked paths.
import { lightSwitch } from '../gacha/sound';
import { toggleTheme, useTheme } from './theme';

const MOON = 'M20.5 14.7A8.8 8.8 0 1 1 9.3 3.5a7 7 0 0 0 11.2 11.2Z';

export default function ThemeToggle() {
  const dark = useTheme((s) => s.mode === 'dark');
  return (
    <button
      type="button" className="mode" role="switch" aria-checked={dark} aria-label="Dark mode"
      onClick={(e) => { lightSwitch(); toggleTheme(e.currentTarget); }}
    >
      <i className="mode-halo" />
      <i className="mode-plate" />
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path className="mode-cut" d={MOON} />
        <path className="mode-lit" d={MOON} />
        <path className="mode-spark" d={MOON} pathLength={1} />
      </svg>
    </button>
  );
}

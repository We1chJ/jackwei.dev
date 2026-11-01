// The two buttons in the top right corner: the room's light and the sound, an icon each.
import { lightSwitch } from '../gacha/sound';
import { gacha, useGacha } from '../gacha/store';
import { toggleTheme, useTheme } from './theme';

export function ThemeToggle() {
  const dark = useTheme((s) => s.mode === 'dark');
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={(e) => { lightSwitch(); toggleTheme(e.currentTarget); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {dark
          ? <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3 7 7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7" /></>
          : <path d="M20.5 14.7A8.8 8.8 0 1 1 9.3 3.5a7 7 0 0 0 11.2 11.2Z" />}
      </svg>
    </button>
  );
}

export function SoundToggle() {
  const sound = useGacha((s) => s.sound);
  const label = sound ? 'Turn sound off' : 'Turn sound on';
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={() => gacha.set({ sound: !sound })}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9.5v5h3.5L12.5 19V5L7.5 9.5H4Z" />
        {sound ? <path d="M15.8 9a4.2 4.2 0 0 1 0 6M18.4 6.4a8 8 0 0 1 0 11.2" /> : <path d="m16 9.5 5 5M21 9.5l-5 5" />}
      </svg>
    </button>
  );
}

// The app proper (React, three.js, Rapier): loaded lazily behind the loading screen.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// The journey starts at the top: the machines drop into the hero.
history.scrollRestoration = 'manual';
scrollTo(0, 0);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The performance panel, on any page with #debug on the URL (src/debug/PerfPanel.ts).
let stopPanel: (() => void) | null = null;
function debugPanel() {
  if (location.hash === '#debug') void import('./debug/PerfPanel').then((m) => { stopPanel ??= m.startPerfPanel(); });
  else { stopPanel?.(); stopPanel = null; }
}
addEventListener('hashchange', debugPanel);
debugPanel();

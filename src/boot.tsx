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

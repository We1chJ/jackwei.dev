// Entry: tiny on purpose. Paints the loading screen, downloads the 3D app with real byte
// progress, then boots it. The build lists the lazy chunks in window.__CHUNKS (vite.config.ts);
// fetching them first fills the HTTP cache, so the import() below reads them from there.
import './styles.css';
import { loading } from './loader';

declare global { interface Window { __CHUNKS?: [url: string, bytes: number][] } }

// Tab title: a coin rolling along a line, wrapping round (after bruno-simon.com, 2019).
// The static <title> in index.html stays for crawlers and bookmarks.
const TRACK = 14;
let coinAt = 0;
setInterval(() => {
  coinAt = (coinAt + 1) % TRACK;
  document.title = '_'.repeat(coinAt) + '🪙' + '_'.repeat(TRACK - 1 - coinAt);
}, 180);

// The ticket is React, so it follows the first paint in a small download of its own.
import('./ticket/LoaderTicket')
  .then((m) => m.mountTicket(document.querySelector<HTMLElement>('.ticket-mount')!, loading.ticket))
  .catch(() => loading.fail());

async function prefetch() {
  const chunks = window.__CHUNKS;
  if (!chunks?.length) return;
  const total = chunks.reduce((a, [, n]) => a + n, 0);
  let got = 0;
  await Promise.all(chunks.map(async ([url]) => {
    const reader = (await fetch(url)).body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      loading.report('download', got / total);
    }
  }));
}

prefetch()
  .catch(() => { /* fall through: import() fetches whatever is missing */ })
  .then(() => { loading.coast(); return import('./boot'); })
  .then(() => loading.report('download', 1))
  .catch(() => loading.fail());

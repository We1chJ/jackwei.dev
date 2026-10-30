// The résumé drawn straight from the PDF with pdf.js, so replacing public/assets/ResumeOfficial.pdf
// is still the only step to update it. Each page is sized to fit the window and rendered at exactly
// the screen's pixels, then re-rendered if the window changes, so the text stays sharp.
import { useEffect, useRef } from 'react';

const MARGIN = 24; // px kept clear around the page

export default function ResumePages({ url }: { url: string }) {
  const box = useRef<HTMLDivElement>(null);
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
      const dpr = devicePixelRatio || 1;
      const pages: HTMLCanvasElement[] = [];
      for (let i = 1; i <= d.numPages; i++) {
        const page = await d.getPage(i);
        const base = page.getViewport({ scale: 1 });
        // the whole page in view, as large as the window allows
        const fit = Math.min((innerWidth - MARGIN * 2) / base.width, (innerHeight - MARGIN * 2) / base.height);
        // whole device pixels, with an even gap to the window edge so centring lands on a pixel
        const even = (n: number, room: number) => { const v = Math.round(n); return (room - v) % 2 ? v - 1 : v; };
        const w = even(base.width * fit * dpr, Math.round(innerWidth * dpr));
        const h = even(base.height * fit * dpr, Math.round(innerHeight * dpr));
        const vp = page.getViewport({ scale: w / base.width });
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.style.width = `${w / dpr}px`;
        cv.style.height = `${h / dpr}px`;
        cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', `Résumé, page ${i} of ${d.numPages}`);
        await page.render({ canvasContext: cv.getContext('2d')!, viewport: vp }).promise;
        pages.push(cv);
      }
      if (id === run) box.current?.replaceChildren(...pages);
    };
    const failed = () => { /* the Download PDF link still works */ };
    const onResize = () => { clearTimeout(timer); timer = window.setTimeout(() => render().catch(failed), 150); };
    render().catch(failed);
    addEventListener('resize', onResize);
    return () => { run++; clearTimeout(timer); removeEventListener('resize', onResize); };
  }, [url]);
  return <div ref={box} className="reel-pages" />;
}

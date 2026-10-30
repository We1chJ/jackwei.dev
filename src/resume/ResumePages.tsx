// The résumé drawn straight from the PDF with pdf.js, so replacing public/assets/ResumeOfficial.pdf
// is still the only step to update it. Pages render at the panel width × device pixel ratio.
import { useEffect, useRef } from 'react';

export default function ResumePages({ url }: { url: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      const doc = await pdfjs.getDocument(url).promise;
      const width = Math.min(860, innerWidth - 32);
      const dpr = Math.min(devicePixelRatio || 1, 3);
      const pages: HTMLCanvasElement[] = [];
      for (let i = 1; i <= doc.numPages && !dead; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * dpr });
        const cv = document.createElement('canvas');
        cv.width = Math.round(vp.width);
        cv.height = Math.round(vp.height);
        cv.style.width = `${width}px`;
        cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', `Résumé, page ${i} of ${doc.numPages}`);
        await page.render({ canvasContext: cv.getContext('2d')!, viewport: vp }).promise;
        pages.push(cv);
      }
      if (!dead) box.current?.replaceChildren(...pages);
    })().catch(() => { /* the Download PDF link above still works */ });
    return () => { dead = true; };
  }, [url]);
  return <div ref={box} className="reel-pages" />;
}

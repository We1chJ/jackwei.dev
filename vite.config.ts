import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Lists every lazily-loaded JS chunk with its (decoded) byte size in the page, so the loading
// screen can show real download progress (see src/main.ts).
function chunkList(base: string): Plugin {
  return {
    name: 'chunk-list',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const chunks = Object.values(ctx.bundle ?? {})
          // pdf.js is only needed once the résumé reel opens (src/resume/), so it stays out of the first load
          .filter((c) => c.type === 'chunk' && !c.isEntry && !c.name.startsWith('pdf'))
          .map((c) => [base + c.fileName, new TextEncoder().encode(c.type === 'chunk' ? c.code : '').length]);
        return { html, tags: [{ tag: 'script', children: `window.__CHUNKS=${JSON.stringify(chunks)}`, injectTo: 'head' }] };
      },
    },
  };
}

// Custom domain (CNAME = www.jackwei.dev) serves from the root, so base is '/'.
export default defineConfig({
  base: '/',
  plugins: [react(), chunkList('/')],
  // pdf.js is imported lazily (the résumé reel); listing it here stops the dev server from
  // discovering it mid-session and force-reloading the page
  optimizeDeps: { include: ['pdfjs-dist'] },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // Big libraries in their own files: they download in parallel and stay cached across deploys.
        manualChunks(id) {
          if (id.includes('@dimforge')) return 'rapier';
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
        },
      },
    },
  },
});

import { defineConfig } from 'vite';

// Static build of the img2threejs review harness so headless Chrome can open it from file://.
export default defineConfig({
  root: 'preview/gacha',
  base: './',
  build: {
    outDir: '../../3d/gacha-machine/preview-dist',
    emptyOutDir: true,
    target: 'es2020',
  },
});

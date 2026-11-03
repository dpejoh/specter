import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/webroot',
  base: './',
  build: {
    outDir: '../../Module/webroot',
    emptyOutDir: true,
    target: 'es2019',
    cssTarget: ['chrome105'],
    manifest: true,
    modulePreload: { polyfill: false },
    // Inline fonts to avoid two root-shell reads.
    assetsInlineLimit: 100000,
    // KernelSU reads each file through a root shell; fewer, larger files win.
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
})

import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/webroot',
  base: './',
  build: {
    outDir: '../../Module/webroot',
    emptyOutDir: true,
    target: 'es2019',
    cssTarget: ['chrome105'],
  },
})

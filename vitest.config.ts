import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/webroot/js/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        inline: ['@material/material-color-utilities'],
      },
    },
  },
})

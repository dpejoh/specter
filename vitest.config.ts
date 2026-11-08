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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/webroot/js/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      // The component system is the part of the WebUI with a coverage floor:
      // every registered component ships tests (enforced by the registry
      // test), and these thresholds keep that from silently regressing.
      // The rest of the WebUI is reported but not gated yet.
      thresholds: {
        'src/webroot/js/ui/**': {
          lines: 80,
          statements: 75,
          functions: 75,
          branches: 65,
        },
      },
    },
  },
})

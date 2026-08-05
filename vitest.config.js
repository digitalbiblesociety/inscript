import { defineConfig } from 'vitest/config';
import { alias } from './alias.config.js';

export default defineConfig({
  resolve: {
    alias
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.{js,ts}', 'tests/integration/**/*.test.{js,ts}'],
    setupFiles: ['tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['browserbible/js/**', 'verse-detection/**/*.ts'],
      exclude: [
        'browserbible/js/**/index.js',
        'verse-detection/dist/**',
        'verse-detection/demo*.html',
        'verse-detection/vite.config*.ts'
      ]
    }
  }
});

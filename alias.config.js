import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Computed from import.meta.url (not __dirname) so any loader can import this
// file directly; see the note in vite.config.js.
const rootDir = dirname(fileURLToPath(import.meta.url));

/** Path aliases shared by vite.config.js and vitest.config.js. */
export const alias = {
  '@': resolve(rootDir, 'browserbible/js'),
  '@lib': resolve(rootDir, 'browserbible/js/lib'),
  '@core': resolve(rootDir, 'browserbible/js/core'),
  '@common': resolve(rootDir, 'browserbible/js/common'),
  '@bible': resolve(rootDir, 'browserbible/js/bible'),
  '@texts': resolve(rootDir, 'browserbible/js/texts'),
  '@windows': resolve(rootDir, 'browserbible/js/windows'),
  '@plugins': resolve(rootDir, 'browserbible/js/plugins'),
  '@menu': resolve(rootDir, 'browserbible/js/menu'),
  '@ui': resolve(rootDir, 'browserbible/js/ui'),
  '@verse-detection': resolve(rootDir, 'verse-detection')
};

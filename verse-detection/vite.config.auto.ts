import { defineConfig } from 'vite';
import { resolve } from 'path';

/** IIFE bundle loadable as a bare <script src>; see README.md. */
export default defineConfig({
	build: {
		outDir: 'dist',
		emptyOutDir: false, // Don't clear the main build output
		sourcemap: true,

		lib: {
			entry: resolve(__dirname, 'auto.ts'),
			name: 'VerseDetectionAuto',
			fileName: () => 'verse-detection.min.js',
			formats: ['iife']
		},

		rolldownOptions: {
			output: {
				inlineDynamicImports: true,
				extend: true
			}
		},

		target: 'es2015'
	}
});

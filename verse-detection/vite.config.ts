import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		sourcemap: true,

		lib: {
			entry: {
				'verse-detection': resolve(__dirname, 'index.ts'),
				'verse-detection-auto': resolve(__dirname, 'auto.ts'),
				'languages/index': resolve(__dirname, 'languages/index.ts'),
				'languages/types': resolve(__dirname, 'languages/types.ts')
			},

			name: 'VerseDetection',

			fileName: (format, entryName) => {
				if (format === 'es') return `${entryName}.js`;
				if (format === 'umd') return `${entryName}.umd.js`;
				return `${entryName}.${format}.js`;
			},

			// ES only, so consumers can tree-shake individual languages.
			formats: ['es']
		},

		rollupOptions: {
			external: [],

			output: {
				globals: {},
				compact: true,
				preserveModules: false
			}
		},

		minify: 'esbuild',
		target: 'es2015'
	},

	server: {
		port: 3001,
		open: '/demo.html'
	},

	resolve: {
		alias: {
			'@bb4': resolve(__dirname, '../browserbible/js')
		}
	},

	define: {
		__VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0')
	}
});

import { defineConfig } from 'vite';
import { resolve, sep, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, cpSync } from 'fs';
import { browserslistToTargets } from 'lightningcss';
import browserslist from 'browserslist';
import { compression } from 'vite-plugin-compression2';
import { alias } from './alias.config.js';

// Real ESM dirname. This config is ESM ("type":"module"), where the bare
// `__dirname` global does not exist; Vite injects one at build time, but tools
// that load this file directly (e.g. knip's config loader) do not, which broke
// `pnpm knip`. Computing it from import.meta.url works everywhere.
const rootDir = dirname(fileURLToPath(import.meta.url));

// Which Cloudflare Pages branch is production. Must match the "Production
// branch" set on the Pages project; every other branch builds as a preview.
const PAGES_PRODUCTION_BRANCH = 'main';

// Content-Security-Policy for built output only. Injected via transformIndexHtml
// at build time (not in `vite dev`, whose HMR client needs inline/eval scripts).
// script-src 'self' is the key mitigation: the app injects remote HTML (Bible
// text, commentary, search results) via innerHTML, and 'self' blocks both
// injected <script> and inline event handlers (e.g. <img onerror=...>) if a
// content host is ever compromised or MITM'd. The app uses no inline scripts,
// eval, or javascript: URLs. style-src keeps 'unsafe-inline' (inline style=""
// attributes are used throughout); img/media/connect/frame stay open to https:
// because injected content legitimately references many remote hosts.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self'",
  "connect-src 'self' https:",
  "frame-src 'self' https:",
  "manifest-src 'self'"
].join('; ');

function injectCsp() {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</title>',
        `</title>\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">`
      );
    }
  };
}

function copyPublicExcludingTexts() {
  const publicDir = resolve(rootDir, 'browserbible/public');
  const textsDir = resolve(publicDir, 'content/texts');
  return {
    name: 'copy-public-excluding-texts',
    apply: 'build',
    // writeBundle (not closeBundle) so the compression plugin still sees
    // the copied files and emits .gz/.br variants
    writeBundle() {
      cpSync(publicDir, resolve(rootDir, 'browserbible/dist'), {
        recursive: true,
        filter: (src) => {
          const full = resolve(src);
          return full !== textsDir && !full.startsWith(textsDir + sep);
        }
      });
    }
  };
}

export default defineConfig(({ command }) => {
  // Site profile resolution, highest precedence first:
  //
  //  1. An explicit SITE env var (e.g. SITE=dev vite build).
  //  2. On Cloudflare Pages (CF_PAGES=1), the deployment branch: the production
  //     branch gets the production profile, every branch preview gets 'dev', so
  //     previews carry the full window set and sourcemaps. Deriving this from
  //     CF_PAGES_BRANCH rather than a dashboard env var keeps it in version
  //     control and works even though adopting wrangler.toml makes the
  //     dashboard's variables read-only. See docs/Deployment-Cloudflare.md.
  //  3. The command, so an accidental `vite build` / `pnpm build` can never ship
  //     a dev bundle: builds default to production ('inscript'), `vite dev`
  //     (serve) defaults to 'dev'.
  const cfPagesProfile = process.env.CF_PAGES
    ? (process.env.CF_PAGES_BRANCH === PAGES_PRODUCTION_BRANCH ? 'inscript' : 'dev')
    : null;
  const siteProfile = process.env.SITE
    || cfPagesProfile
    || (command === 'build' ? 'inscript' : 'dev');
  const siteConfig = JSON.parse(readFileSync(`./sites/${siteProfile}.json`, 'utf-8'));

  // `vite dev` (serve) talks to a locally-run proxy; builds bake the deployed
  // proxy URL from the site profile, so dev.inscript.org / inscript.org both
  // reach https://api.inscript.org/abs/v1 rather than the visitor's localhost.
  const apiBibleProxyBase = command === 'serve'
    ? 'http://localhost:8787/v1'
    : (siteConfig.apiBibleProxyBase || 'https://api.inscript.org/abs/v1');

  const bibleBrainProxyBase = command === 'serve'
    ? 'http://localhost:8787/fcbh/v4'
    : (siteConfig.bibleBrainProxyBase || '');

  const esvProxyBase = command === 'serve'
    ? 'http://localhost:8787/esv/v3'
    : (siteConfig.esvProxyBase || 'https://api.inscript.org/esv/v3');

  return {
  root: 'browserbible',

  base: './',

  build: {
    outDir: 'dist',

    emptyOutDir: true,

    sourcemap: siteProfile === 'dev',

    cssMinify: 'lightningcss',

    // Public assets are copied by Vite in dev-profile builds; production
    // builds use copyPublicExcludingTexts() below
    copyPublicDir: siteProfile === 'dev',

    rollupOptions: {
      input: {
        main: resolve(rootDir, 'browserbible/index.html')
      },
      output: {
        entryFileNames: 'js/bundle.js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name.split('.').pop();
          if (/css/i.test(extType)) {
            return 'css/[name][extname]';
          }
          if (/png|jpe?g|gif|svg|ico|webp/i.test(extType)) {
            return 'images/[name][extname]';
          }
          if (/woff2?|ttf|eot/i.test(extType)) {
            return 'fonts/[name][extname]';
          }
          return 'assets/[name][extname]';
        }
      }
    },

    minify: 'esbuild',

    // JS target. The runtime floor is set by the native Popover API (used by
    // every menu/dropdown/popup): Chrome 114, Firefox 125, Safari 17. es2022 is
    // comfortably within that; the CSS `targets` below use the same floor.
    target: 'es2022'
  },

  server: {
    port: 3000,
    // The proxy worker's ALLOWED_ORIGINS only permits this exact origin; if
    // 3000 is taken, fail instead of drifting to 3001 and getting CORS 403s.
    strictPort: true,
    open: true,
    cors: true
  },

  preview: {
    port: 4173
  },

  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: browserslistToTargets(browserslist('chrome >= 114, firefox >= 125, safari >= 17'))
    },
    devSourcemap: true
  },

  resolve: {
    alias
  },

  optimizeDeps: {
    include: []
  },

  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '4.0.0'),
    __DISABLED_WINDOW_TYPES__: JSON.stringify(siteConfig.disabledWindowTypes),
    __DISABLED_FEATURES__: JSON.stringify(siteConfig.disabledFeatures),
    __API_BIBLE_PROXY_BASE__: JSON.stringify(apiBibleProxyBase),
    __BIBLE_BRAIN_PROXY_BASE__: JSON.stringify(bibleBrainProxyBase),
    __ESV_PROXY_BASE__: JSON.stringify(esvProxyBase)
  },

  plugins: [
    injectCsp(),
    siteProfile !== 'dev' && copyPublicExcludingTexts(),
    // Precompressed siblings are for hosts that serve them directly (nginx
    // gzip_static, Apache mod_deflate). Cloudflare Pages compresses responses
    // itself and never serves a .gz/.br sibling, so on Pages they would only
    // double the asset count and upload time.
    !process.env.CF_PAGES && compression({ algorithms: ['gzip', 'brotliCompress'] })
  ].filter(Boolean)
  };
});

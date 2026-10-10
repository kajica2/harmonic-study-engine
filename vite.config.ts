import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import {defineConfig} from 'vite';
import type { Plugin } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// -------------------------------------------------------------------------
// Build-time stamp: surface a short commit SHA in the bundle so the UI can
// render "build 5ff516a" at the bottom of the page. Vercel sets
// VERCEL_GIT_COMMIT_SHA automatically on every deployment; locally we
// shell out to git so `npm run dev` shows the working-tree HEAD instead
// of "dev". Falls back to "dev" when git is unavailable (CI, sandbox).
// -------------------------------------------------------------------------
function resolveAppCommit(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel && fromVercel.length >= 7) return fromVercel.slice(0, 7);
  // Use fileURLToPath(import.meta.url) so the cwd is the directory
  // that *contains* vite.config.ts — process.cwd() inside the Vite
  // config module isn't always the project root, especially when Vite
  // is invoked from a parent directory or a build script.
  const projectRoot = path.dirname(fileURLToPath(import.meta.url));
  try {
    const out = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out.length > 0) return out;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[buildInfo] execSync failed:`, e);
  }
  return 'dev';
}

export const APP_COMMIT = resolveAppCommit();
export const APP_BUILD_TIME = new Date().toISOString();

function pwaServiceWorker(): Plugin {
  return {
    name: 'hse-pwa-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const precache = [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/icons/app-icon.svg',
        '/icons/app-icon-maskable.svg',
        ...Object.keys(bundle)
          .filter((file) => {
            if (!/^assets\/.*\.(?:js|css)$/.test(file)) return false;
            const output = bundle[file];
            const bytes = output.type === 'chunk'
              ? Buffer.byteLength(output.code)
              : Buffer.byteLength(output.source);
            return bytes <= 5 * 1024 * 1024;
          })
          .map((file) => `/${file}`),
      ];
      const source = `
const CACHE_PREFIX = 'hse-pwa-';
const CACHE_NAME = CACHE_PREFIX + ${JSON.stringify(APP_COMMIT)};
const PRECACHE_URLS = ${JSON.stringify(precache)};
const APP_ROUTES = new Set(['/', '/index.html', '/play', '/play/']);
const MAX_RUNTIME_BYTES = 5 * 1024 * 1024;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.startsWith('/api/') || url.pathname.startsWith('/recordings/') ||
        request.headers.has('range') || (request.mode !== 'navigate' &&
          ['audio', 'video', 'document', 'embed', 'object'].includes(request.destination)) ||
        /\\.(?:mp3|wav|ogg|m4a|mp4|webm|zip)$/i.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async (response) => {
      if (response.ok) {
        const copy = response.clone();
        await caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      return cached || (APP_ROUTES.has(url.pathname) ? cache.match('/index.html') : Response.error());
    }));
    return;
  }

  event.respondWith(caches.match(request).then(async (cached) => {
    if (cached) return cached;
    try {
      const response = await fetch(request);
      const size = Number(response.headers.get('content-length') || 0);
      if (response.ok && response.type === 'basic' && size > 0 && size <= MAX_RUNTIME_BYTES) {
        const copy = response.clone();
        await caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    } catch {
      return Response.error();
    }
  }));
});
`;
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      pwaServiceWorker(),
      nodePolyfills({
        exclude: ['fs', 'net'],
      }),
    ],
    define: {
      global: 'globalThis',
      'global.process': 'undefined',
      // Read by src/lib/buildInfo.ts — kept in sync via this single
      // `define` so local dev, vercel production, and CI all stamp
      // the same shape into the bundle.
      __APP_COMMIT__: JSON.stringify(APP_COMMIT),
      __APP_BUILD_TIME__: JSON.stringify(APP_BUILD_TIME),
    },
    build: {
      // Keep test files out of the production bundle. vitest picks
      // them up directly; vite/esbuild would otherwise pull them
      // in via dynamic import chains.
      rollupOptions: {
        // jspdf's svg()/html() helpers pull canvg + html2canvas via
        // dynamic import; this app never calls them (svg2pdf drives
        // jspdf's primitive ops directly), so externalizing keeps the
        // ~100 kB pair out of the bundle entirely.
        external: (id) =>
          /\.test\.(ts|tsx)$/.test(id) ||
          id === "canvg" ||
          id === "html2canvas" ||
          id.includes("node_modules/canvg/") ||
          id.includes("node_modules/html2canvas/") ||
          id === "dompurify" ||
          id.includes("node_modules/dompurify/"),
        // Split the heavyweight vendor libs into stable, cacheable
        // chunks. This is a pure caching/parallelism win — dangerously
        // large libs (magentaHelper is already a dynamic chunk) get
        // their own cache line so a redeploy of app code doesn't
        // re-download megabytes.
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
            if (/node_modules\/lucide-react\//.test(id)) return 'ui';
            if (/node_modules\/tone\//.test(id)) return 'audio';
            if (/node_modules\/abcjs\//.test(id)) return 'score';
            if (/node_modules\/(jspdf|svg2pdf|fflate)\//.test(id)) return 'publish';
            if (/node_modules\/midi-writer-js\//.test(id)) return 'midi';
            // Everything else — including @magenta/music, which must stay
            // inside its own dynamic-import chunk rather than being merged
            // into an eager vendor bundle — is left to Rollup's resolution.
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        // tfjs aggregate without backend-cpu (webgl is the real
        // backend; cpu's registration is a side effect that can't
        // tree-shake). See src/lib/tfjs-shim.ts.
        '@tensorflow/tfjs': path.resolve(__dirname, 'src/lib/tfjs-shim.ts'),
        'node-fetch': path.resolve(__dirname, 'src/lib/fetch-shim.ts'),
        'node:stream/web': path.resolve(__dirname, 'src/lib/empty-shim.ts'),
        'stream/web': path.resolve(__dirname, 'src/lib/empty-shim.ts'),
        'node:fs': path.resolve(__dirname, 'src/lib/node-shims.ts'),
        'fs': path.resolve(__dirname, 'src/lib/node-shims.ts'),
        'node:net': path.resolve(__dirname, 'src/lib/node-shims.ts'),
        'net': path.resolve(__dirname, 'src/lib/node-shims.ts'),
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

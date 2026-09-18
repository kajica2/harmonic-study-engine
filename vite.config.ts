import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      nodePolyfills({
        exclude: ['fs', 'net'],
      }),
    ],
    define: {
      global: 'globalThis',
      'global.process': 'undefined',
    },
    build: {
      // Keep test files out of the production bundle. vitest picks
      // them up directly; vite/esbuild would otherwise pull them
      // in via dynamic import chains.
      rollupOptions: {
        external: (id) => /\.test\.(ts|tsx)$/.test(id),
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

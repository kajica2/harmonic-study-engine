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

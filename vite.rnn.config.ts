import { defineConfig } from 'vite';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

/**
 * Standalone Vite config for the RNN page's engine bundle.
 *
 * Why a separate config:
 *   The main app (src/main.tsx) is a React SPA with Tailwind and a
 *   full module graph. Building the RNN engine through that same
 *   config would drag in React, Tailwind reset, and a multi-megabyte
 *   bundle just to expose two functions to a static HTML page.
 *
 *   This config is minimal:
 *     - nodePolyfills so @magenta/music + @tensorflow/tfjs resolve
 *       their node-style peer deps (same as the main app).
 *     - lib entry that emits src/rnn-engine.ts → dist/rnn-engine.bundle.js
 *     - iife format so the bundle assigns window.SWRRNN directly
 *       with no ESM runtime needed at the call site (rnn.html is a
 *       vanilla HTML page; it loads the bundle via <script src=…>).
 *
 * Build: `npx vite build --config vite.rnn.config.ts`
 *   Outputs dist/rnn-engine.bundle.js alongside the main app's dist/.
 */
export default defineConfig({
  build: {
    outDir: 'public',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/rnn-engine.ts'),
      name: 'SWRRNN',
      fileName: () => 'rnn-engine.bundle.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        // Keep the bundle name stable across builds so the HTML
        // can reference it by exact filename.
        entryFileNames: 'rnn-engine.bundle.js',
        extend: true,
      },
    },
    target: 'es2020',
    minify: 'esbuild',
  },
  plugins: [
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
    },
  },
});
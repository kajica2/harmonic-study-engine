/**
 * Aggregate-@tensorflow/tfjs replacement for the bundle.
 *
 * @magenta/music imports the aggregate `@tensorflow/tfjs`, which also
 * registers tfjs-backend-cpu (a side effect, so it can never tree-shake
 * - ~48 kB gz shipped for a backend browsers never pick: webgl wins).
 * The tf.* surface MusicRNN/sequences actually use is core ops + layers
 * + converter io + the webgl backend, which is exactly what this shim
 * re-exports. Tests still resolve the real package (vitest does not
 * use the vite build alias).
 */
export * from "@tensorflow/tfjs-core";
export * from "@tensorflow/tfjs-layers";
export * from "@tensorflow/tfjs-converter";
export * from "@tensorflow/tfjs-backend-webgl";

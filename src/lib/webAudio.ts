/**
 * webAudio — typed shim for the WebKit-prefixed AudioContext used
 * by older Safari builds (pre-14.5). The prefix isn't in lib.dom.d.ts,
 * so the un-typed alternative is `(window as any).webkitAudioContext`.
 *
 * Use `newAudioContext()` anywhere we'd write:
 *
 *   new (window.AudioContext || (window as any).webkitAudioContext)()
 *
 * `webkitAudioContext` is structurally compatible with `AudioContext`,
 * but it's typed as a separate interface by the (defunct) WebKit
 * implementation. We declare it as a global type-augmentation so
 * every call site gets the standard interface back.
 */

declare global {
  interface Window {
    /**
     * WebKit-prefixed AudioContext, present in Safari < 14.5 (and
     * any current iOS WebView running an older OS). Always typed
     * as the standard `AudioContext` constructor — the prefix only
     * matters for the lookup, not the resulting instance.
     */
    webkitAudioContext?: typeof AudioContext;
  }
}

/**
 * Pick the best AudioContext constructor the host browser exposes:
 * standard first, WebKit prefix as a fallback for old Safari/iOS.
 *
 * Throws a descriptive error if neither is available — happens
 * only in extreme environments (server-side, locked-down iframes).
 */
export function newAudioContext(): AudioContext {
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctor) {
    throw new Error(
      "Web Audio API is not available in this environment " +
        "(no AudioContext and no webkitAudioContext on window).",
    );
  }
  return new Ctor();
}

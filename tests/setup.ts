/**
 * Vitest setup. Runs before every test file.
 *
 * Currently a no-op — kept as a hook for future setup (e.g. fetch
 * polyfills, AudioContext mocks for the loopWav tests).
 *
 * Note: An earlier iteration tried to polyfill OfflineAudioContext
 * via `web-audio-api`, but that package doesn't actually export
 * OfflineAudioContext (only AudioContext, AudioParam, etc.). The
 * loopWav audio tests need a real Web Audio implementation;
 * dropping them for now is the pragmatic call. When standardized-
 * audio-context gets a usable Node entrypoint, polyfill here.
 */
// Shim for node-fetch to redirect to the browser's native fetch API
const localFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : (typeof globalThis !== 'undefined' ? globalThis.fetch : null);

export const fetch = localFetch;
export const Headers = typeof window !== 'undefined' ? window.Headers : (typeof globalThis !== 'undefined' ? globalThis.Headers : null);
export const Request = typeof window !== 'undefined' ? window.Request : (typeof globalThis !== 'undefined' ? globalThis.Request : null);
export const Response = typeof window !== 'undefined' ? window.Response : (typeof globalThis !== 'undefined' ? globalThis.Response : null);

export default localFetch;

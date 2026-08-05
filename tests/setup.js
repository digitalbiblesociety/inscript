// Vitest global setup. Runs before each test file.
// Extend with localStorage stubs, fetch mocks, or global error guards as suites grow.

if (globalThis.jsdom) {
  for (const key of ['localStorage', 'sessionStorage']) {
    if (!globalThis[key]) {
      Object.defineProperty(globalThis, key, {
        value: globalThis.jsdom.window[key],
        configurable: true,
        writable: true
      });
    }
  }
}

// jsdom doesn't implement CSS.escape (used for verse-ID class selectors like ".MT2_1").
// Verse IDs are alphanumeric + underscore, so a minimal escape suffices here.
if (typeof globalThis.CSS === 'undefined') {
  globalThis.CSS = {};
}
if (typeof globalThis.CSS.escape !== 'function') {
  globalThis.CSS.escape = (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

const dataStore = new WeakMap();

function readDataAttribute(el, key) {
  const attrVal = el.dataset ? el.dataset[key] : el.getAttribute('data-' + key);
  if (attrVal !== null) {
    try {
      return JSON.parse(attrVal);
    } catch (_e) {
      return attrVal;
    }
  }

  return undefined;
}

/**
 * Omit `value` to read, omit `key` as well to read everything. Values live in
 * a WeakMap rather than the DOM, so any type survives round-tripping.
 */
export function data(el, key, value) {
  if (!el) return;

  if (!dataStore.has(el)) {
    dataStore.set(el, {});
  }
  const store = dataStore.get(el);

  if (key === undefined) {
    return store;
  }

  if (value !== undefined) {
    store[key] = value;
    return;
  }

  if (key in store) {
    return store[key];
  }

  return readDataAttribute(el, key);
}

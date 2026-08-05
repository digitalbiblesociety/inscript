const eventStore = new WeakMap();

function getEventStore(el) {
  if (!eventStore.has(el)) {
    eventStore.set(el, {});
  }
  return eventStore.get(el);
}

function parseEventString(eventString) {
  const parts = eventString.split('.');
  return {
    type: parts[0],
    namespace: parts.slice(1).join('.') || ''
  };
}

function makeDelegatedWrapper(el, selector, fn) {
  return (e) => {
    let target = e.target;
    while (target && target !== el) {
      if (target.matches && target.matches(selector)) {
        fn.call(target, e);
        return;
      }
      target = target.parentElement;
    }
  };
}

/**
 * `events` is space-separated and accepts jQuery-style namespaces
 * ("click.myns"), so off() can unbind one caller without touching the rest.
 * Passing a selector before the handler delegates.
 */
export function on(el, events, selectorOrHandler, handler) {
  if (!el) return;

  const selector = typeof selectorOrHandler === 'string' ? selectorOrHandler : null;
  const fn = selector ? handler : selectorOrHandler;

  events.split(/\s+/).forEach(eventString => {
    const parsed = parseEventString(eventString);
    const store = getEventStore(el);

    const wrapper = selector
      ? makeDelegatedWrapper(el, selector, fn)
      : (e) => { fn.call(el, e); };

    const key = parsed.type + (parsed.namespace ? '.' + parsed.namespace : '');
    if (!store[key]) store[key] = [];
    store[key].push({ original: fn, wrapper: wrapper, selector: selector });

    el.addEventListener(parsed.type, wrapper);
  });
}

/**
 * Fire a handler on both click and keyboard activation (Enter / Space) so that
 * role="button" elements are operable without a pointer.
 */
export function onActivate(el, handler) {
  if (!el) return;
  el.addEventListener('click', handler);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      handler(e);
    }
  });
}

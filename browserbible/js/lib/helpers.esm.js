export function extend(target, ...sources) {
  sources.forEach(source => {
    if (!source) return;
    Object.keys(source).forEach(key => {
      target[key] = source[key];
    });
  });
  return target;
}

/** Position relative to the document, not the viewport. */
export function offset(el) {
  if (!el) return { top: 0, left: 0 };
  const rect = el.getBoundingClientRect();
  const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  return {
    top: rect.top + scrollTop,
    left: rect.left + scrollLeft
  };
}

export function closest(el, selector) {
  if (!el) return null;
  if (el.closest) return el.closest(selector);

  while (el) {
    if (el.matches && el.matches(selector)) return el;
    el = el.parentElement;
  }
  return null;
}

export function siblings(el, selector) {
  if (!el || !el.parentElement) return [];
  let sibs = Array.from(el.parentElement.children).filter(sibling => sibling !== el);
  if (selector) {
    sibs = sibs.filter(sibling => sibling.matches && sibling.matches(selector));
  }
  return sibs;
}

/**
 * Props are assigned straight onto the element, except `style` and `dataset`,
 * which merge, and `children`, which appends. A string in place of props is
 * textContent shorthand.
 */
export function elem(tag, props = {}, ...children) {
  const el = document.createElement(tag);

  if (typeof props === 'string') {
    el.textContent = props;
    children = children.flat(Infinity).filter(Boolean);
    if (children.length) el.append(...children);
    return el;
  }

  for (const [key, val] of Object.entries(props)) {
    if (key === 'style' && typeof val === 'object') {
      Object.assign(el.style, val);
    } else if (key === 'dataset' && typeof val === 'object') {
      Object.assign(el.dataset, val);
    } else if (key === 'children') {
      children.push(...[val].flat());
    } else {
      el[key] = val;
    }
  }

  children = children.flat(Infinity).filter(Boolean);
  if (children.length) el.append(...children);
  return el;
}

/**
 * Make a non-<button> element behave as an accessible button: gives it a button
 * role, keyboard focusability, and (optionally) an accessible label. Used for
 * the icon-only div/span controls in the app shell. Pair with onActivate() so
 * the control responds to the keyboard as well as the mouse.
 * Returns the same element, so it can wrap an elem() call.
 */
export function asButton(el, label) {
  if (!el) return el;
  if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  if (label != null && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', label);
  return el;
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

export function insertAfter(newEl, refEl) {
  if (refEl && refEl.parentNode && newEl) {
    refEl.parentNode.insertBefore(newEl, refEl.nextSibling);
  }
}

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

    const wrapper = (e) => {
      if (selector) {
        let target = e.target;
        while (target && target !== el) {
          if (target.matches && target.matches(selector)) {
            fn.call(target, e);
            return;
          }
          target = target.parentElement;
        }
      } else {
        fn.call(el, e);
      }
    };

    const key = parsed.type + (parsed.namespace ? '.' + parsed.namespace : '');
    if (!store[key]) store[key] = [];
    store[key].push({ original: fn, wrapper: wrapper, selector: selector });

    el.addEventListener(parsed.type, wrapper);
  });
}


const dataStore = new WeakMap();

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

// Format seconds as `MM:SS` (or `H:MM:SS`); non-finite/negative treated as 0.
export function secondsToTimeCode(time) {
  if (!Number.isFinite(time) || time < 0) time = 0;
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor(time / 60) % 60;
  const seconds = Math.floor(time % 60);
  const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const ss = seconds < 10 ? `0${seconds}` : `${seconds}`;
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

const helpers = {
  extend,
  offset,
  closest,
  siblings,
  elem,
  insertAfter,
  on,
  data,
  secondsToTimeCode
};

export default helpers;

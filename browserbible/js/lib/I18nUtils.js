export function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length; i++) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[parts[i]];
  }

  return current;
}

export function interpolate(str, options) {
  if (!options) return str;

  if (options.count !== undefined) {
    str = str.replace(/__count__/g, options.count);
  }

  if (Array.isArray(options)) {
    for (let i = 0; i < options.length; i++) {
      str = str.replace(new RegExp('\\{' + i + '\\}', 'g'), options[i]);
    }
    return str;
  }

  for (const prop in options) {
    if (Object.hasOwn(options, prop)) {
      str = str.replace(new RegExp('\\{' + prop + '\\}', 'g'), options[prop]);
    }
  }
  return str;
}

export function getCookie(name) {
  if (typeof document === 'undefined') return '';
  const value = '; ' + document.cookie;
  const parts = value.split('; ' + name + '=');
  if (parts.length === 2) {
    return parts.pop().split(';').shift();
  }
  return '';
}

export function setCookie(name, value, days) {
  if (typeof document === 'undefined') return;
  let expires = '';
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = '; expires=' + date.toUTCString();
  }
  // Secure only over HTTPS so the preference still persists on http://localhost
  // dev and file:// (offline) use; SameSite=Lax on all origins.
  const secure = (typeof location !== 'undefined' && location.protocol === 'https:') ? '; Secure' : '';
  document.cookie = name + '=' + (value || '') + expires + '; path=/; SameSite=Lax' + secure;
}

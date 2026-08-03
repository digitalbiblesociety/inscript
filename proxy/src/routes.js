/**
 * Pure routing/origin logic for the proxy. No secrets and no fetch() here so
 * everything is unit-testable; src/index.js adds the keys per service.
 */

const API_BIBLE_HOST = 'https://api.scripture.api.bible';
const BIBLE_BRAIN_HOST = 'https://4.dbt.io/api';
const ESV_HOST = 'https://api.esv.org';

export function resolveUpstream(pathname, search = '', { apiBibleIds = [] } = {}) {
  const strip = (prefix) => (pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null);

  // API.Bible.
  const absRest = strip('/abs/v1/') ?? strip('/v1/');
  if (absRest != null) {
    const match = /^bibles\/([^/?]+)(\/.*)?$/.exec(absRest);
    if (!match || (apiBibleIds.length > 0 && !apiBibleIds.includes(match[1]))) {
      return { error: 'forbidden' };
    }
    return { service: 'apibible', url: `${API_BIBLE_HOST}/v1/${absRest}${search}` };
  }

  // Bible Brain (Faith Comes By Hearing), v4.
  const fcbhRest = strip('/fcbh/v4/');
  if (fcbhRest != null) {
    return { service: 'fcbh', url: `${BIBLE_BRAIN_HOST}/${fcbhRest}${search}` };
  }

  // ESV API. Only the two endpoints the app uses are exposed.
  const esvRest = strip('/esv/v3/');
  if (esvRest != null) {
    if (!/^passage\/(html|search)\/?$/.test(esvRest)) {
      return { error: 'forbidden' };
    }
    return { service: 'esv', url: `${ESV_HOST}/v3/${esvRest}${search}` };
  }

  return null;
}

/**
 * Match a request Origin against the comma-separated allowlist. Entries are
 * exact origins, except a "https://*.host" entry which matches any subdomain
 * (for Cloudflare Pages previews). Returns the origin to echo back in
 * Access-Control-Allow-Origin, or null when it isn't allowed.
 */
export function matchOrigin(origin, allowedOrigins = '') {
  if (!origin) return null;

  for (const raw of allowedOrigins.split(',')) {
    const pattern = raw.trim();
    if (pattern === '') continue;

    if (pattern.includes('://*.')) {
      const [scheme, host] = pattern.split('://*.');
      if (origin.startsWith(`${scheme}://`) && origin.endsWith(`.${host}`)) {
        return origin;
      }
      continue;
    }

    if (origin === pattern) return origin;
  }

  return null;
}

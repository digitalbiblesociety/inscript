/**
 * HTML sanitization and text utilities for notes.
 *
 * Note content is user HTML from a contentEditable editor (including pasted
 * markup) that gets re-injected via innerHTML and interpolated into the print
 * page, so everything stored or rendered must pass through sanitizeHtml().
 */

// Tags kept as-is. `div` stays because Chrome's contentEditable emits <div>
// line blocks; unwrapping them would destroy line structure.
const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U',
  'H2', 'H3', 'OL', 'UL', 'LI', 'BLOCKQUOTE', 'A'
]);

// Tags removed together with their contents.
const DROP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE',
  'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'OPTION', 'IMG', 'PICTURE',
  'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT',
  'HEAD', 'TITLE', 'FRAME', 'FRAMESET', 'APPLET', 'CANVAS', 'DIALOG', 'SLOT'
]);

// Headings outside the editor's H2 are downgraded rather than unwrapped so
// pasted documents keep their visual hierarchy.
const TRANSFORM_TAGS = {
  H1: 'h2',
  H4: 'h3',
  H5: 'h3',
  H6: 'h3'
};

const ALLOWED_HREF_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

function isSafeHref(href) {
  try {
    return ALLOWED_HREF_SCHEMES.has(new URL(href, document.baseURI).protocol);
  } catch {
    return false;
  }
}

function cleanAttributes(el) {
  for (const attr of [...el.attributes]) {
    if (el.tagName === 'A' && attr.name === 'href' && isSafeHref(attr.value)) continue;
    el.removeAttribute(attr.name);
  }
}

function cleanElement(el, parent) {
  const tag = el.tagName;

  if (DROP_TAGS.has(tag)) {
    el.remove();
    return;
  }

  if (TRANSFORM_TAGS[tag]) {
    const replacement = document.createElement(TRANSFORM_TAGS[tag]);
    while (el.firstChild) replacement.appendChild(el.firstChild);
    el.replaceWith(replacement);
    cleanChildren(replacement);
    return;
  }

  if (!ALLOWED_TAGS.has(tag)) {
    cleanChildren(el);
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
    return;
  }

  cleanAttributes(el);
  cleanChildren(el);
}

function cleanChildren(parent) {
  for (const child of [...parent.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) continue;

    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.remove();
      continue;
    }

    cleanElement(child, parent);
  }
}

/**
 * Sanitize an HTML string down to the small allowlist the notes editor
 * produces. Strips scripts, event handlers, styles, and unsafe URLs.
 * Idempotent: sanitizing twice gives the same result.
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  // <template> content is inert: scripts don't run, images don't load.
  const template = document.createElement('template');
  template.innerHTML = html;
  cleanChildren(template.content);
  return template.innerHTML;
}

/**
 * Strip HTML tags and return plain text. Block boundaries and <br> become
 * newlines so line structure survives (first-line titles, previews).
 */
export function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  const spaced = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:div|p|li|h[1-6]|blockquote|tr)[^>]*>/gi, '\n');
  const tmp = document.createElement('div');
  tmp.innerHTML = spaced;
  const text = tmp.textContent || tmp.innerText || '';
  return text.replace(/\s*\n\s*/g, '\n').trim();
}

/** Escape a plain-text string for interpolation into HTML markup. */
export function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

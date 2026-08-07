/**
 * Escape remote/untrusted text for interpolation into an HTML string that is
 * later assigned with innerHTML. Escaping quotes as well makes the same helper
 * safe for quoted attribute values; unquoted attributes should not be built by
 * string interpolation.
 */
export const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

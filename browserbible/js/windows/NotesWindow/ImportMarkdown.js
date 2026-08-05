/**
 * Markdown importer. Parses the exported format back into note objects:
 *   # Title
 *   **Verse:** ref
 *   *Created: datestring*
 *   *Modified: datestring*
 *
 *   content...
 *
 *   ---
 *
 * The "Verse:"/"Created:"/"Modified:" markers are part of the export file
 * format (they must round-trip), so they stay English regardless of UI
 * language.
 */

import { buildImportedNote, matchHeaderField, parseDate } from './ImportHelpers.js';

function listBlockToHtml(block) {
  const items = block
    .trim()
    .split('\n')
    .map(line => `<li>${line.replace(/^- /, '')}</li>`)
    .join('');
  return `\n<ul>${items}</ul>`;
}

function blockToHtml(block) {
  const trimmed = block.trim();
  if (!trimmed) return '';
  if (/^<(h\d|ul|p|blockquote)/.test(trimmed)) return trimmed;
  return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
}

function markdownToHtml(md) {
  if (!md || typeof md !== 'string') return '';

  let html = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/\r\n/g, '\n');

  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/(?:^|\n)(- .+(?:\n- .+)*)/g, listBlockToHtml);

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  html = html.replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, '$1<em>$2</em>');

  html = html.replace(/(^|\W)_(.+?)_(\W|$)/g, '$1<u>$2</u>$3');

  html = html
    .split(/\n{2,}/)
    .map(blockToHtml)
    .join('\n');

  return html.trim();
}

const HEADER_MATCHERS = [
  { re: /^# (.+)$/, field: 'title', parse: v => v.trim() },
  { re: /^\*\*Verse:\*\*\s*(.+)$/, field: 'referenceDisplay', parse: v => v.trim() },
  { re: /^\*Created:\s*(.+)\*$/, field: 'created', parse: parseDate },
  { re: /^\*Modified:\s*(.+)\*$/, field: 'modified', parse: parseDate, endsHeader: true }
];

/** Returns true when the header consumed the line (content lines return false). */
function consumeHeaderLine(header, line) {
  if (matchHeaderField(HEADER_MATCHERS, header, line)) return true;
  // Until a title shows up every unmatched line is content.
  if (!header.title) return false;
  if (line === '') return true;
  header.done = true;
  return false;
}

function parseMarkdownSection(section) {
  const header = { title: '', referenceDisplay: null, created: null, modified: null, done: false };
  const contentLines = [];

  for (const line of section.split('\n')) {
    if (header.done || !consumeHeaderLine(header, line)) {
      contentLines.push(line);
    }
  }

  return buildImportedNote(header, markdownToHtml(contentLines.join('\n').trim()));
}

/** Parse a markdown export back into note objects. */
export function parseMarkdownImport(text) {
  const notes = [];
  for (const section of text.split(/\n---\n/)) {
    const trimmed = section.trim();
    if (trimmed) notes.push(parseMarkdownSection(trimmed));
  }
  return notes;
}

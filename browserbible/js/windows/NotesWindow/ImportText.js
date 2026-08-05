/**
 * Plain text and RTF importers. Both formats share a title/metadata/content
 * section layout and differ only in the section divider and the verse
 * marker, so they run through the same header-section parser.
 *
 * The "Verse:"/"Created:"/"Modified:" markers are part of the export file
 * format (they must round-trip), so they stay English regardless of UI
 * language.
 */

import { buildImportedNote, matchHeaderField, parseDate } from './ImportHelpers.js';

function textToHtml(contentText) {
  return contentText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/** `versePattern` must put the reference in capture group 1. */
function headerMatchers(versePattern) {
  return [
    { re: versePattern, field: 'referenceDisplay', parse: v => v.trim() },
    { re: /^Created:\s*(.+)$/, field: 'created', parse: parseDate },
    { re: /^Modified:\s*(.+)$/, field: 'modified', parse: parseDate }
  ];
}

function parseHeaderSection(section, matchers) {
  const lines = section.split('\n');
  const header = { title: '', referenceDisplay: null, created: null, modified: null };
  let contentStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!header.title) {
      if (line) {
        header.title = line;
        contentStart = i + 1;
      }
      continue;
    }
    // A valid Modified date closes the header (matching the exporters);
    // an unparseable one leaves it open, as the old parser did.
    if (header.modified) break;
    if (line === '' || matchHeaderField(matchers, header, line)) {
      contentStart = i + 1;
      continue;
    }
    break;
  }

  const contentText = lines.slice(contentStart).join('\n').trim();
  return buildImportedNote(header, textToHtml(contentText));
}

/** Parse sections with a title/metadata/content header format. */
function parseHeaderSections(text, divider, versePattern) {
  const matchers = headerMatchers(versePattern);
  const notes = [];
  for (const section of text.split(divider)) {
    const trimmed = section.trim();
    if (trimmed) notes.push(parseHeaderSection(trimmed, matchers));
  }
  return notes;
}

export function parsePlainTextImport(text) {
  return parseHeaderSections(text, /={50}/, /^\[(.+)\]$/);
}

function stripRtf(rtf) {
  let text = rtf;
  // Header and font/color tables
  text = text.replace(/^\{\\rtf1[^}]*\}?\s*/i, '');
  text = text.replace(/\{\\fonttbl[^}]*\}/g, '');
  text = text.replace(/\{\\colortbl[^}]*\}/g, '');
  // \par becomes a newline
  text = text.replace(/\\par\s*/g, '\n');
  // Drop formatting markers but keep their content
  text = text.replace(/\{\\b\s+(.*?)\}/g, '$1');
  text = text.replace(/\{\\i\s+(.*?)\}/g, '$1');
  text = text.replace(/\{\\ul\s+(.*?)\}/g, '$1');
  text = text.replace(/\{\\fs\d+\s+(.*?)\}/g, '$1');
  // Remaining control words, braces, and escapes
  text = text.replace(/\\[a-z]+\d*\s?/g, '');
  text = text.replace(/[{}]/g, '');
  text = text.replace(/\\\\/g, '\\');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export function parseRtfImport(text) {
  const plainText = stripRtf(text);
  return parseHeaderSections(plainText, '________________________________________________', /^Verse:\s*(.+)$/);
}

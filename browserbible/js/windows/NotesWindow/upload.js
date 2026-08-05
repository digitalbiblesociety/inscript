/**
 * Parse imported files (Markdown, Plain Text, RTF, JSON backup) back into
 * note objects.
 *
 * The "Verse:"/"Created:"/"Modified:" markers are part of the export file
 * format (they must round-trip through the parsers below), so they stay
 * English regardless of UI language.
 */

import { Reference } from '../../bible/BibleReference.js';
import { generateId, normalizeNote } from './NotesStore.js';
import { sanitizeHtml } from './sanitize.js';

/**
 * Resolve a human reference string ("John 3:16") to the fragmentid the app
 * uses internally, so imported linked notes match the current-verse filter.
 */
function normalizeReference(referenceDisplay) {
  if (!referenceDisplay) return { reference: null, referenceDisplay: null };
  const ref = Reference(referenceDisplay);
  if (ref?.isValid()) {
    return { reference: ref.toSection(), referenceDisplay: ref.toString() };
  }
  // Unparseable: keep the display text but don't pretend it's a link.
  return { reference: null, referenceDisplay };
}

function markdownToHtml(md) {
  if (!md || typeof md !== 'string') return '';

  let html = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/\r\n/g, '\n');

  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  html = html.replace(
    /(?:^|\n)(- .+(?:\n- .+)*)/g,
    block => {
      const items = block
        .trim()
        .split('\n')
        .map(line => `<li>${line.replace(/^- /, '')}</li>`)
        .join('');
      return `\n<ul>${items}</ul>`;
    }
  );

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  html = html.replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, '$1<em>$2</em>');

  html = html.replace(/(^|\W)_(.+?)_(\W|$)/g, '$1<u>$2</u>$3');

  html = html
    .split(/\n{2,}/)
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h\d|ul|p|blockquote)/.test(block)) {
        return block;
      }
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html.trim();
}


function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr.trim());
  return isNaN(d.getTime()) ? null : d.getTime();
}

function buildImportedNote(header, content) {
  const now = Date.now();
  return {
    id: generateId(),
    title: header.title || 'Imported Note',
    content,
    ...normalizeReference(header.referenceDisplay),
    created: header.created || now,
    modified: header.modified || now
  };
}

/**
 * Parse a markdown export back into note objects
 * Exported format:
 *   # Title
 *   **Verse:** ref
 *   *Created: datestring*
 *   *Modified: datestring*
 *
 *   content...
 *
 *   ---
 */
const MARKDOWN_PATTERNS = {
  verse: /^\*\*Verse:\*\*\s*(.+)$/,
  created: /^\*Created:\s*(.+)\*$/,
  modified: /^\*Modified:\s*(.+)\*$/
};

function applyHeaderPatterns(line, header, patterns) {
  const verseMatch = patterns.verse.exec(line);
  if (verseMatch) {
    header.referenceDisplay = verseMatch[1].trim();
    return true;
  }

  const createdMatch = patterns.created.exec(line);
  if (createdMatch) {
    header.created = parseDate(createdMatch[1]);
    return true;
  }

  const modifiedMatch = patterns.modified.exec(line);
  if (modifiedMatch) {
    header.modified = parseDate(modifiedMatch[1]);
    header.done = true;
    return true;
  }

  return false;
}

function applyMarkdownHeaderLine(line, header) {
  const titleMatch = /^# (.+)$/.exec(line);
  if (titleMatch) {
    header.title = titleMatch[1].trim();
    return true;
  }

  return applyHeaderPatterns(line, header, MARKDOWN_PATTERNS);
}

function splitMarkdownSection(lines) {
  const header = { title: '', referenceDisplay: null, created: null, modified: null, done: false };
  const contentLines = [];

  for (const line of lines) {
    if (header.done) {
      contentLines.push(line);
      continue;
    }

    if (applyMarkdownHeaderLine(line, header)) continue;

    if (header.title) {
      if (line === '') continue;
      header.done = true;
      contentLines.push(line);
      continue;
    }

    contentLines.push(line);
  }

  return { header, contentLines };
}

function parseMarkdownImport(text) {
  const sections = text.split(/\n---\n/);
  const notes = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const { header, contentLines } = splitMarkdownSection(trimmed.split('\n'));
    const contentMd = contentLines.join('\n').trim();
    notes.push(buildImportedNote(header, markdownToHtml(contentMd)));
  }

  return notes;
}

/**
 * Parse sections with a title/metadata/content header format.
 * Used by both plain text and RTF importers.
 * `versePattern` must put the reference in capture group 1.
 */
const PLAIN_PATTERNS = {
  created: /^Created:\s*(.+)$/,
  modified: /^Modified:\s*(.+)$/
};

function applyMetadataLine(line, header, patterns) {
  if (line === '') return true;
  return applyHeaderPatterns(line, header, patterns);
}

function scanHeaderLines(lines, versePattern) {
  const header = { title: '', referenceDisplay: null, created: null, modified: null, done: false };
  const patterns = { verse: versePattern, ...PLAIN_PATTERNS };
  let contentStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!header.title) {
      if (line) {
        header.title = line;
        contentStartIndex = i + 1;
      }
      continue;
    }

    if (header.done || !applyMetadataLine(line, header, patterns)) break;
    contentStartIndex = i + 1;
  }

  return { header, contentStartIndex };
}

function parseHeaderSections(text, divider, versePattern) {
  const sections = text.split(divider);
  const notes = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const lines = trimmed.split('\n');
    const { header, contentStartIndex } = scanHeaderLines(lines, versePattern);
    const contentHtml = lines.slice(contentStartIndex).join('\n').trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    notes.push(buildImportedNote(header, contentHtml));
  }

  return notes;
}

function parsePlainTextImport(text) {
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

function parseRtfImport(text) {
  const plainText = stripRtf(text);
  return parseHeaderSections(plainText, '________________________________________________', /^Verse:\s*(.+)$/);
}

/**
 * Parse a JSON backup (as produced by the JSON download) back into notes.
 * Original ids are kept so restores merge instead of duplicating.
 * @throws {Error} 'invalid-backup' when the payload isn't a notes backup
 */
function parseJsonImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('invalid-backup');
  }

  const rawNotes = Array.isArray(parsed) ? parsed : parsed?.notes;
  if (!Array.isArray(rawNotes)) {
    throw new Error('invalid-backup');
  }

  return rawNotes
    .map((raw) => {
      const note = normalizeNote(raw);
      if (note) note.content = sanitizeHtml(note.content);
      return note;
    })
    .filter(Boolean);
}

/**
 * The format is detected from `filename`. The returned `mode` says how the
 * store should ingest the notes: 'merge' dedupes by id (JSON backups keep
 * their original ids), 'add' prepends everything (text formats get fresh ids).
 * @throws {Error} 'invalid-backup' for malformed JSON backups
 */
export function parseImportedFile(text, filename) {
  const ext = filename.split('.').pop().toLowerCase();

  switch (ext) {
    case 'json':
      return { notes: parseJsonImport(text), mode: 'merge' };
    case 'md':
      return { notes: parseMarkdownImport(text), mode: 'add' };
    case 'rtf':
      return { notes: parseRtfImport(text), mode: 'add' };
    case 'txt':
    default:
      return { notes: parsePlainTextImport(text), mode: 'add' };
  }
}

/**
 * Parse imported files (Markdown, Plain Text, RTF, JSON backup) back into
 * note objects. The format-specific parsers live in ImportMarkdown.js and
 * ImportText.js, with shared pieces in ImportHelpers.js.
 */

import { normalizeNote } from './NotesStore.js';
import { sanitizeHtml } from '../../lib/sanitizeHtml.js';
import { parseMarkdownImport } from './ImportMarkdown.js';
import { parsePlainTextImport, parseRtfImport } from './ImportText.js';

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

/**
 * Shared helpers for the text-based note importers (Markdown, plain text,
 * RTF): reference resolution, date parsing, header-line matching, and the
 * final note assembly.
 */

import { Reference } from '../../bible/BibleReference.js';
import { generateId } from './NotesStore.js';

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

export function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr.trim());
  return isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Try each matcher ({re, field, parse, endsHeader}) against a header line.
 * On the first match the parsed capture group 1 is written to header[field],
 * endsHeader sets header.done, and the line counts as consumed.
 */
export function matchHeaderField(matchers, header, line) {
  for (const matcher of matchers) {
    const match = line.match(matcher.re);
    if (match) {
      header[matcher.field] = matcher.parse(match[1]);
      if (matcher.endsHeader) header.done = true;
      return true;
    }
  }
  return false;
}

export function buildImportedNote(header, contentHtml) {
  const now = Date.now();
  return {
    id: generateId(),
    title: header.title || 'Imported Note',
    content: contentHtml,
    ...normalizeReference(header.referenceDisplay),
    created: header.created || now,
    modified: header.modified || now
  };
}

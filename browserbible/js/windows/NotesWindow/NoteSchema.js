/**
 * Note schema: storage keys, id generation, validation/coercion to schema
 * v1, payload migration, and the read-merge-write merge rule. Pure functions
 * only; the store wiring lives in NotesStore.js.
 */

import { sanitizeHtml } from '../../lib/sanitizeHtml.js';

export const NOTES_STORAGE_KEY = 'browserbible_notes';
export const CORRUPT_BACKUP_KEY = 'browserbible_notes_corrupt_backup';
export const SCHEMA_VERSION = 1;

export function generateId() {
  return 'note_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

/**
 * Validate/coerce a raw note object into schema v1, or null if unusable.
 */
export function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const now = Date.now();
  const created = Number.isFinite(raw.created) ? raw.created : now;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
    title: typeof raw.title === 'string' ? raw.title : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    reference: typeof raw.reference === 'string' && raw.reference ? raw.reference : null,
    referenceDisplay: typeof raw.referenceDisplay === 'string' && raw.referenceDisplay ? raw.referenceDisplay : null,
    pinned: raw.pinned === true,
    created,
    modified: Number.isFinite(raw.modified) ? raw.modified : created
  };
}

/**
 * Upgrade a parsed storage payload to schema v1. Legacy (unversioned)
 * payloads predate sanitization, so their content is cleaned once here;
 * after that the write sites keep it clean.
 * The payload is either {version, notes} or a bare legacy array.
 */
export function migratePayload(parsed) {
  const isArray = Array.isArray(parsed);
  const rawNotes = isArray ? parsed : (parsed && Array.isArray(parsed.notes) ? parsed.notes : []);
  const version = isArray ? undefined : parsed?.version;
  const notes = rawNotes.map(normalizeNote).filter(Boolean);
  if (version !== SCHEMA_VERSION) {
    for (const note of notes) {
      note.content = sanitizeHtml(note.content);
    }
  }
  return { version: SCHEMA_VERSION, notes };
}

/**
 * Merge in-memory notes with what's currently in storage (read-merge-write).
 * Union by id: the newer `modified` wins, and stored-only notes survive
 * (another tab added them) unless their id is in deletedIds.
 * Merged notes come back in memory order, with stored-only notes appended.
 */
export function mergeNotes(storedNotes, memoryNotes, deletedIds = new Set()) {
  const byId = new Map();
  for (const note of storedNotes) {
    if (!deletedIds.has(note.id)) byId.set(note.id, note);
  }
  for (const note of memoryNotes) {
    const existing = byId.get(note.id);
    if (!existing || (note.modified || 0) >= (existing.modified || 0)) {
      byId.set(note.id, note);
    }
  }

  const result = [];
  const seen = new Set();
  for (const note of memoryNotes) {
    if (!seen.has(note.id) && byId.has(note.id)) {
      result.push(byId.get(note.id));
      seen.add(note.id);
    }
  }
  for (const note of storedNotes) {
    if (!seen.has(note.id) && byId.has(note.id)) {
      result.push(byId.get(note.id));
      seen.add(note.id);
    }
  }
  return result;
}

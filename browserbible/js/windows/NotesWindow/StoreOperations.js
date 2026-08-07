/**
 * Mutation and lookup operations for the notes store. Every function takes
 * the store state object built by createNotesStore (see NotesStore.js).
 */

import { normalizeNote } from './NoteSchema.js';
import { persistNotes } from './StoreBackend.js';
import { stripHtml } from '../../lib/sanitizeHtml.js';

function emitChange(state, source, ids) {
  state.store.trigger('change', { source, ids });
}

export function getNote(state, id) {
  return state.notes.find((n) => n.id === id) || null;
}

export function createNote(state, fields) {
  const note = normalizeNote({ ...fields });
  state.notes.unshift(note);
  persistNotes(state);
  emitChange(state, 'local', [note.id]);
  return note;
}

export function updateNote(state, id, changes) {
  const index = state.notes.findIndex((n) => n.id === id);
  // If the id vanished (another tab deleted it mid-edit), re-add instead of
  // throwing the user's work away.
  const base = index === -1 ? { id } : state.notes[index];
  const modified = Object.prototype.hasOwnProperty.call(changes, 'modified')
    ? changes.modified
    : Date.now();
  const updated = normalizeNote({ ...base, ...changes, id, modified });
  if (index === -1) {
    state.notes.unshift(updated);
    state.deletedIds.delete(id);
  } else {
    state.notes[index] = updated;
  }
  state.plainTextCache.delete(id);
  persistNotes(state);
  emitChange(state, 'local', [id]);
  return updated;
}

export function removeNote(state, id) {
  const index = state.notes.findIndex((n) => n.id === id);
  if (index === -1) return false;
  state.notes.splice(index, 1);
  state.deletedIds.add(id);
  state.plainTextCache.delete(id);
  persistNotes(state);
  emitChange(state, 'local', [id]);
  return true;
}

/** Returns true when the note matched an existing id and was merged in. */
function mergeImportedNote(state, note, result) {
  const index = state.notes.findIndex((n) => n.id === note.id);
  if (index === -1) {
    state.deletedIds.delete(note.id);
    return false;
  }
  if ((note.modified || 0) > (state.notes[index].modified || 0)) {
    state.notes[index] = note;
    state.plainTextCache.delete(note.id);
    result.updated++;
  } else {
    result.skipped++;
  }
  return true;
}

/**
 * Bulk import. Mode 'add' prepends everything (file imports carry fresh
 * ids); 'merge' dedupes by id with newer `modified` winning (JSON restore).
 */
export function importNotesInto(state, imported, { mode = 'add' } = {}) {
  const result = { added: 0, updated: 0, skipped: 0 };
  const clean = (imported || []).map(normalizeNote).filter(Boolean);

  for (const note of clean) {
    if (mode === 'merge' && mergeImportedNote(state, note, result)) continue;
    state.notes.unshift(note);
    result.added++;
  }

  if (result.added || result.updated) {
    persistNotes(state);
    emitChange(state, 'local');
  }
  return result;
}

/** Cached plain text of a note's content (for search/filter/previews). */
export function getPlainTextOf(state, id) {
  if (state.plainTextCache.has(id)) return state.plainTextCache.get(id);
  const note = getNote(state, id);
  const text = note ? stripHtml(note.content || '') : '';
  state.plainTextCache.set(id, text);
  return text;
}

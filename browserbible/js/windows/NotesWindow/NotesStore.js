/**
 * NotesStore - single source of truth for user notes in localStorage.
 *
 * All NotesWindow instances in a tab share one store (getSharedNotesStore),
 * so same-tab windows stay consistent through its 'change' events. A
 * 'storage' listener folds in writes from other tabs.
 *
 * Uses raw localStorage rather than AppSettings on purpose: AppSettings
 * prefixes keys with config.settingsPrefix, which gets bumped to reset
 * settings, and notes need to survive that.
 *
 * Persists are read-merge-write per note id (newer `modified` wins), with
 * session-scoped delete tombstones so a note removed in this tab isn't
 * resurrected by the merge. Editing the same note in two tabs at once is
 * still last-write-wins for that note.
 *
 * The schema helpers live in NoteSchema.js, persistence in StoreBackend.js,
 * and mutations in StoreOperations.js; this module wires them to a shared
 * state object and keeps the public API.
 */

import { mixinEventEmitter } from '../../common/EventEmitter.js';
import { resolveStorage, loadNotes, persistNotes, handleStorageEvent } from './StoreBackend.js';
import {
  getNote,
  createNote,
  updateNote,
  removeNote,
  importNotesInto,
  getPlainTextOf
} from './StoreOperations.js';

export {
  NOTES_STORAGE_KEY,
  CORRUPT_BACKUP_KEY,
  SCHEMA_VERSION,
  generateId,
  normalizeNote,
  migratePayload,
  mergeNotes
} from './NoteSchema.js';

/**
 * Create a notes store. Use getSharedNotesStore() in app code; this factory
 * exists so tests can inject fake storage/window. The store is an EventEmitter
 * that fires 'change' and 'error'.
 */
export function createNotesStore({ storage, win } = {}) {
  const store = mixinEventEmitter({
    corruptionDetected: false,
    hasPendingWrites: false
  });

  const state = {
    storage: storage || resolveStorage(),
    win: win || window,
    deletedIds: new Set(),
    plainTextCache: new Map(),
    notes: [],
    store
  };

  const onStorageEvent = (e) => handleStorageEvent(state, e);

  store.getAll = () => state.notes;
  store.get = (id) => getNote(state, id);
  store.create = (fields = {}) => createNote(state, fields);
  store.update = (id, changes = {}) => updateNote(state, id, changes);
  store.remove = (id) => removeNote(state, id);
  store.importNotes = (imported, options = {}) => importNotesInto(state, imported, options);
  store.getPlainText = (id) => getPlainTextOf(state, id);
  store.retryPersist = () => (store.hasPendingWrites ? persistNotes(state) : true);
  store.destroy = () => {
    state.win.removeEventListener('storage', onStorageEvent);
    store.clearListeners();
  };

  loadNotes(state);
  state.win.addEventListener('storage', onStorageEvent);

  return store;
}

let _sharedStore = null;

/** The store shared by all NotesWindow instances in this tab. */
export function getSharedNotesStore() {
  if (!_sharedStore) _sharedStore = createNotesStore();
  return _sharedStore;
}

/** Test hook: tear down the shared store so the next call builds a fresh one. */
export function resetSharedNotesStore() {
  if (_sharedStore) _sharedStore.destroy();
  _sharedStore = null;
}

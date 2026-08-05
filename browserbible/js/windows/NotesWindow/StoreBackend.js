/**
 * Storage backend for the notes store: reading, migrating, quarantining,
 * and persisting the localStorage payload. Every function takes the store
 * state object built by createNotesStore (see NotesStore.js).
 */

import {
  NOTES_STORAGE_KEY,
  CORRUPT_BACKUP_KEY,
  SCHEMA_VERSION,
  migratePayload,
  mergeNotes
} from './NoteSchema.js';

const QUOTA_ERROR_NAMES = ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'];
const QUOTA_ERROR_CODES = [22, 1014];

function isQuotaError(err) {
  if (!err) return false;
  return QUOTA_ERROR_NAMES.includes(err.name) || QUOTA_ERROR_CODES.includes(err.code);
}

/** In-memory stand-in used when localStorage is unavailable (private mode). */
function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); }
  };
}

export function resolveStorage() {
  try {
    const s = window.localStorage;
    s.getItem(NOTES_STORAGE_KEY);
    return s;
  } catch {
    console.warn('[NotesStore] localStorage unavailable; notes will not persist this session');
    return createMemoryStorage();
  }
}

function quarantine(state, raw) {
  try {
    state.storage.setItem(CORRUPT_BACKUP_KEY, raw);
  } catch (err) {
    console.error('[NotesStore] Could not back up corrupt notes payload:', err);
  }
  state.store.corruptionDetected = true;
  state.store.trigger('error', { code: 'corrupt' });
}

function readStoredNotes(state) {
  const raw = state.storage.getItem(NOTES_STORAGE_KEY);
  if (raw == null || raw === '') return { raw, notes: [] };
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!parsed || (!Array.isArray(parsed) && !Array.isArray(parsed.notes))) {
    return { raw, notes: null, version: undefined };
  }
  const payload = migratePayload(parsed);
  return { raw, notes: payload.notes, version: Array.isArray(parsed) ? undefined : parsed.version };
}

export function loadNotes(state) {
  let result;
  try {
    result = readStoredNotes(state);
  } catch (err) {
    console.error('[NotesStore] Failed to read notes:', err);
    state.notes = [];
    return;
  }
  if (result.notes === null) {
    // Unparseable: back up the raw payload for recovery before starting
    // fresh, so the next save can't destroy it.
    quarantine(state, result.raw);
    state.notes = [];
    return;
  }
  state.notes = result.notes;
  if (result.raw != null && result.raw !== '' && result.version !== SCHEMA_VERSION) {
    persistNotes(state); // write back the migrated payload
  }
}

function flagFailedPersist(state, err) {
  // Keep the memory state and flag it. Nothing is lost while the tab
  // lives, and every later write retries.
  state.store.hasPendingWrites = true;
  if (isQuotaError(err)) {
    state.store.trigger('error', { code: 'quota', error: err });
  } else {
    console.error('[NotesStore] Failed to save notes:', err);
    state.store.trigger('error', { code: 'unknown', error: err });
  }
  return false;
}

export function persistNotes(state) {
  try {
    const result = readStoredNotes(state);
    if (Array.isArray(result.notes)) {
      state.notes = mergeNotes(result.notes, state.notes, state.deletedIds);
    }
  } catch {
    // Storage unreadable mid-merge: fall through, memory wins.
  }

  try {
    state.storage.setItem(NOTES_STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, notes: state.notes }));
    state.store.hasPendingWrites = false;
    return true;
  } catch (err) {
    return flagFailedPersist(state, err);
  }
}

export function handleStorageEvent(state, e) {
  // e.key === null means storage.clear()
  if (e.key !== null && e.key !== NOTES_STORAGE_KEY) return;
  state.plainTextCache.clear();
  loadNotes(state);
  state.store.trigger('change', { source: 'external' });
}

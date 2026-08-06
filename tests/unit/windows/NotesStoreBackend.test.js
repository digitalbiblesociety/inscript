import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  migratePayload: vi.fn(value => ({ notes: Array.isArray(value) ? value : value.notes })),
  mergeNotes: vi.fn((_stored, memory) => memory)
}));

vi.mock('@windows/NotesWindow/NoteSchema.js', () => ({
  NOTES_STORAGE_KEY: 'notes', CORRUPT_BACKUP_KEY: 'notes-corrupt', SCHEMA_VERSION: 2,
  migratePayload: fixtures.migratePayload, mergeNotes: fixtures.mergeNotes
}));

import {
  handleStorageEvent,
  loadNotes,
  persistNotes,
  resolveStorage
} from '@windows/NotesWindow/StoreBackend.js';

function state(storage) {
  return {
    storage,
    notes: [{ id: 'memory' }],
    deletedIds: new Set(),
    plainTextCache: { clear: vi.fn() },
    store: { trigger: vi.fn(), hasPendingWrites: false, corruptionDetected: false }
  };
}

describe('Notes StoreBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('falls back to working in-memory storage when localStorage is unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    try {
      const storage = resolveStorage();
      expect(storage.getItem('x')).toBeNull();
      storage.setItem('x', 3);
      expect(storage.getItem('x')).toBe('3');
      storage.removeItem('x');
      expect(storage.getItem('x')).toBeNull();
    } finally {
      Object.defineProperty(window, 'localStorage', descriptor);
    }
  });

  it('handles storage read failures without discarding the in-memory store object', () => {
    const ctx = state({ getItem: vi.fn(() => { throw new Error('read failed'); }) });
    loadNotes(ctx);
    expect(ctx.notes).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('[NotesStore] Failed to read notes:', expect.any(Error));
  });

  it('quarantines malformed payloads even when backup storage also fails', () => {
    const ctx = state({
      getItem: vi.fn(() => '{bad'),
      setItem: vi.fn(() => { throw new Error('cannot back up'); })
    });
    loadNotes(ctx);
    expect(ctx.store.corruptionDetected).toBe(true);
    expect(ctx.store.trigger).toHaveBeenCalledWith('error', { code: 'corrupt' });
    expect(ctx.notes).toEqual([]);
  });

  it('flags quota failures by error name or legacy error code', () => {
    for (const error of [
      Object.assign(new Error('full'), { name: 'QuotaExceededError' }),
      Object.assign(new Error('full'), { code: 1014 })
    ]) {
      const ctx = state({ getItem: vi.fn(() => null), setItem: vi.fn(() => { throw error; }) });
      expect(persistNotes(ctx)).toBe(false);
      expect(ctx.store.hasPendingWrites).toBe(true);
      expect(ctx.store.trigger).toHaveBeenCalledWith('error', { code: 'quota', error });
    }
  });

  it('flags unknown persistence failures and leaves notes available in memory', () => {
    const error = new Error('blocked');
    const ctx = state({ getItem: vi.fn(() => null), setItem: vi.fn(() => { throw error; }) });
    expect(persistNotes(ctx)).toBe(false);
    expect(ctx.store.trigger).toHaveBeenCalledWith('error', { code: 'unknown', error });
    expect(console.error).toHaveBeenCalledWith('[NotesStore] Failed to save notes:', error);
  });

  it('ignores unrelated storage events and reloads clear or notes events', () => {
    const ctx = state({ getItem: vi.fn(() => ''), setItem: vi.fn() });
    handleStorageEvent(ctx, { key: 'other' });
    expect(ctx.plainTextCache.clear).not.toHaveBeenCalled();
    handleStorageEvent(ctx, { key: null });
    handleStorageEvent(ctx, { key: 'notes' });
    expect(ctx.plainTextCache.clear).toHaveBeenCalledTimes(2);
    expect(ctx.store.trigger).toHaveBeenCalledWith('change', { source: 'external' });
  });
});

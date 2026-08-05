import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({ dialogs: [] }));

vi.mock('@ui/InfoWindow.js', () => ({
  InfoWindow: () => {
    const handlers = new Map();
    const dialog = {
      body: document.createElement('div'),
      on: vi.fn((name, handler) => handlers.set(name, handler)),
      show: vi.fn(function show() { return this; }),
      center: vi.fn(function center() { return this; }),
      hide: vi.fn(() => handlers.get('hide')?.()),
      destroy: vi.fn(),
      handlers
    };
    fixtures.dialogs.push(dialog);
    return dialog;
  }
}));

import { showConfirm, showNotice } from '@windows/NotesWindow/notice.js';

beforeEach(() => {
  fixtures.dialogs.length = 0;
});

describe('notes notices', () => {
  it('shows a centered notice and destroys it when hidden', () => {
    showNotice('Saved');
    const dialog = fixtures.dialogs[0];
    expect(dialog.body.textContent).toBe('Saved');
    expect(dialog.show).toHaveBeenCalled();
    expect(dialog.center).toHaveBeenCalled();
    dialog.handlers.get('hide')();
    expect(dialog.destroy).toHaveBeenCalled();
  });

  it('resolves true from a custom-labelled confirmation', async () => {
    const result = showConfirm('Delete it?', { confirmLabel: 'Delete', cancelLabel: 'Keep' });
    const dialog = fixtures.dialogs[0];
    expect(dialog.body.querySelector('.notes-confirm-message').textContent).toBe('Delete it?');
    expect(dialog.body.querySelector('.notes-confirm-ok').textContent).toBe('Delete');
    expect(dialog.body.querySelector('.notes-confirm-cancel').textContent).toBe('Keep');
    dialog.body.querySelector('.notes-confirm-ok').click();
    await expect(result).resolves.toBe(true);
    expect(dialog.hide).toHaveBeenCalled();
    expect(dialog.destroy).toHaveBeenCalled();
  });

  it('resolves false from cancel or an external hide', async () => {
    const cancelled = showConfirm('Continue?');
    const first = fixtures.dialogs[0];
    expect(first.body.querySelector('.notes-confirm-ok').textContent).toBe('windows.notes.confirmOk');
    first.body.querySelector('.notes-confirm-cancel').click();
    await expect(cancelled).resolves.toBe(false);

    const dismissed = showConfirm('Continue?');
    const second = fixtures.dialogs[1];
    second.handlers.get('hide')();
    second.handlers.get('hide')();
    await expect(dismissed).resolves.toBe(false);
    expect(second.destroy).toHaveBeenCalledTimes(2);
  });
});

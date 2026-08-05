import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  parseImportedFile: vi.fn(),
  printNotes: vi.fn(),
  showNotice: vi.fn()
}));

vi.mock('@windows/NotesWindow/upload.js', () => ({ parseImportedFile: mocks.parseImportedFile }));
vi.mock('@windows/NotesWindow/print.js', () => ({ printNotes: mocks.printNotes }));
vi.mock('@windows/NotesWindow/notice.js', () => ({ showNotice: mocks.showNotice }));

import {
  applyStoreChange,
  applyStoreError,
  applyWindowMessage,
  importNotesFile,
  printAll,
  printCurrent
} from '@windows/NotesWindow/WindowActions.js';

const originalFileReader = globalThis.FileReader;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function makeWindow() {
  const note = {
    id: 'n1',
    title: 'A title',
    content: '<p>Safe</p><script>bad()</script>',
    modified: Date.now(),
    reference: 'JN1_1'
  };
  return {
    state: {
      currentNoteId: 'n1',
      currentTextId: 'WEB',
      isDirty: false
    },
    refs: {
      titleInput: document.createElement('input'),
      editor: document.createElement('div'),
      modified: document.createElement('span'),
      status: document.createElement('span')
    },
    store: {
      get: vi.fn().mockReturnValue(note),
      getAll: vi.fn().mockReturnValue([note]),
      importNotes: vi.fn().mockReturnValue({ added: 1, updated: 2, skipped: 3 })
    },
    renderNotesList: vi.fn(),
    updateEditorVisibility: vi.fn(),
    normalizeEmptyEditor: vi.fn(),
    updateEditorChrome: vi.fn(),
    updateDetectedRefs: vi.fn(),
    setCurrentReference: vi.fn(),
    selectNote: vi.fn(),
    saveCurrentNote: vi.fn(),
    _withStoreWrite: vi.fn(fn => fn()),
    _selfChange: false,
    _quotaNotified: false
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.printNotes.mockResolvedValue(undefined);
});

afterEach(() => {
  globalThis.FileReader = originalFileReader;
});

describe('NotesWindow store reactions', () => {
  it('only rerenders the list when no note is selected', () => {
    const win = makeWindow();
    win.state.currentNoteId = null;
    applyStoreChange(win);
    expect(win.renderNotesList).toHaveBeenCalledOnce();
    expect(win.store.get).not.toHaveBeenCalled();
  });

  it('clears a clean selection deleted in another window', () => {
    const win = makeWindow();
    win.store.get.mockReturnValue(null);
    applyStoreChange(win);
    expect(win.state.currentNoteId).toBeNull();
    expect(win.updateEditorVisibility).toHaveBeenCalled();
    expect(win.renderNotesList).toHaveBeenCalledTimes(2);
  });

  it('preserves a locally dirty deleted note and ignores self/dirty refreshes', () => {
    const win = makeWindow();
    win.state.isDirty = true;
    win.store.get.mockReturnValue(null);
    applyStoreChange(win);
    expect(win.state.currentNoteId).toBe('n1');

    win.store.get.mockReturnValue({ id: 'n1', title: 'Remote' });
    applyStoreChange(win);
    win.state.isDirty = false;
    win._selfChange = true;
    applyStoreChange(win);
    expect(win.refs.titleInput.value).toBe('');
  });

  it('refreshes a clean editor from sanitized store content', () => {
    const win = makeWindow();
    applyStoreChange(win);
    expect(win.refs.titleInput.value).toBe('A title');
    expect(win.refs.editor.innerHTML).toBe('<p>Safe</p>');
    expect(win.normalizeEmptyEditor).toHaveBeenCalled();
    expect(win.updateEditorChrome).toHaveBeenCalled();
    expect(win.updateDetectedRefs).toHaveBeenCalled();
    expect(win.refs.modified.textContent).toContain('windows.notes.modified');
  });

  it('reports quota once, corruption, and generic save failures', () => {
    const win = makeWindow();
    applyStoreError(win, { code: 'quota' });
    applyStoreError(win, { code: 'quota' });
    expect(mocks.showNotice).toHaveBeenCalledTimes(1);
    expect(win.refs.status.textContent).toBe('windows.notes.notSaved');

    applyStoreError(win, { code: 'corrupt' });
    expect(mocks.showNotice).toHaveBeenCalledTimes(2);
    applyStoreError(win, { code: 'other' });
    expect(win.refs.status.textContent).toBe('windows.notes.saveFailed');
  });
});

describe('NotesWindow messages and imports', () => {
  it('applies Bible navigation and text-load messages', () => {
    const win = makeWindow();
    applyWindowMessage(win, null);
    applyWindowMessage(win, { data: { messagetype: 'nav', type: 'notes' } });
    applyWindowMessage(win, {
      data: { messagetype: 'nav', type: 'bible', locationInfo: { fragmentid: 'RM8_1' } }
    });
    expect(win.setCurrentReference).toHaveBeenCalledWith('RM8_1');

    applyWindowMessage(win, { data: { messagetype: 'textload', textid: 'KJV', fragmentid: 'PS23_1' } });
    expect(win.state.currentTextId).toBe('KJV');
    expect(win.setCurrentReference).toHaveBeenCalledWith('PS23_1');
  });

  it('merges and replaces parsed imports', () => {
    class Reader {
      readAsText(file) {
        this.result = file.contents;
        this.onload();
      }
    }
    globalThis.FileReader = Reader;
    const win = makeWindow();
    const merged = [{ id: 'merged' }];
    mocks.parseImportedFile.mockReturnValueOnce({ notes: merged, mode: 'merge' });
    importNotesFile(win, { name: 'notes.json', contents: '{}' });
    expect(win.store.importNotes).toHaveBeenCalledWith(merged, { mode: 'merge' });
    expect(win.refs.status.textContent).toContain('windows.notes.importMerged');

    const replaced = [{ id: 'replacement' }];
    mocks.parseImportedFile.mockReturnValueOnce({ notes: replaced, mode: 'replace' });
    importNotesFile(win, { name: 'notes.md', contents: '# note' });
    expect(win.selectNote).toHaveBeenCalledWith('replacement');
    expect(win.refs.status.textContent).toContain('windows.notes.imported');
  });

  it('reports invalid, empty, and unreadable imports', () => {
    class Reader {
      readAsText(file) {
        if (file.fail) this.onerror();
        else {
          this.result = file.contents;
          this.onload();
        }
      }
    }
    globalThis.FileReader = Reader;
    const win = makeWindow();
    mocks.parseImportedFile.mockImplementationOnce(() => { throw new Error('invalid'); });
    importNotesFile(win, { name: 'bad.txt', contents: 'bad' });
    expect(win.refs.status.textContent).toBe('windows.notes.importInvalid');

    mocks.parseImportedFile.mockReturnValueOnce({ notes: [], mode: 'merge' });
    importNotesFile(win, { name: 'empty.json', contents: '[]' });
    expect(win.refs.status.textContent).toBe('windows.notes.importNone');

    importNotesFile(win, { name: 'unreadable', fail: true });
    expect(win.refs.status.textContent).toBe('windows.notes.importReadError');
    expect(mocks.showNotice).toHaveBeenCalledTimes(2);
  });
});

describe('NotesWindow print actions', () => {
  it('requires a selection and ignores a vanished current note', () => {
    const win = makeWindow();
    win.state.currentNoteId = null;
    printCurrent(win, false);
    expect(win.refs.status.textContent).toBe('windows.notes.selectToPrint');
    expect(mocks.printNotes).not.toHaveBeenCalled();

    win.state.currentNoteId = 'n1';
    win.store.get.mockReturnValue(null);
    printCurrent(win, false);
    expect(win.saveCurrentNote).toHaveBeenCalled();
    expect(mocks.printNotes).not.toHaveBeenCalled();
  });

  it('prints the current note and clears its preparation status', async () => {
    const win = makeWindow();
    printCurrent(win, true);
    expect(mocks.printNotes).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'n1' })],
      { includeVerseText: true, textId: 'WEB' }
    );
    expect(win.refs.status.textContent).toBe('windows.notes.preparingPrint');
    await flush();
    expect(win.refs.status.textContent).toBe('');
  });

  it('prints all notes and reports async failures', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const win = makeWindow();
    mocks.printNotes.mockRejectedValueOnce(new Error('popup failed'));
    printAll(win, false);
    expect(mocks.printNotes).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'n1' })],
      expect.objectContaining({ includeVerseText: false, textId: 'WEB' })
    );
    await flush();
    expect(win.refs.status.textContent).toBe('windows.notes.printError');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('does not print an empty collection', () => {
    const win = makeWindow();
    win.store.getAll.mockReturnValue([]);
    printAll(win, true);
    expect(win.refs.status.textContent).toBe('windows.notes.noNotesToPrint');
    expect(mocks.printNotes).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  store: null,
  filterAndSortNotes: vi.fn(() => []),
  sanitizeHtml: vi.fn(value => `safe:${value}`),
  stripHtml: vi.fn(value => value.replace(/<[^>]+>/g, '')),
  showNotice: vi.fn(),
  showConfirm: vi.fn(),
  selectSuggestion: vi.fn(),
  renderWindowStructure: vi.fn(),
  renderNotesList: vi.fn(),
  attachNotesListeners: vi.fn(),
  applyStoreChange: vi.fn(),
  applyStoreError: vi.fn(),
  applyWindowMessage: vi.fn(),
  importNotesFile: vi.fn(),
  printCurrent: vi.fn(),
  printAll: vi.fn(),
  syncEditorChrome: vi.fn(),
  applyEditorPaste: vi.fn(),
  clearEmptyEditorMarkup: vi.fn(),
  refreshDetectedRefs: vi.fn(),
  translate: vi.fn((key, values = {}) => values.date ? `${key}:${values.date}` : key)
}));

vi.mock('@windows/NotesWindow/NotesStore.js', () => ({
  getSharedNotesStore: () => fixtures.store
}));

vi.mock('@windows/NotesWindow/query.js', () => ({
  filterAndSortNotes: fixtures.filterAndSortNotes
}));

vi.mock('@windows/NotesWindow/sanitize.js', () => ({
  sanitizeHtml: fixtures.sanitizeHtml,
  stripHtml: fixtures.stripHtml
}));

vi.mock('@windows/NotesWindow/notice.js', () => ({
  showNotice: fixtures.showNotice,
  showConfirm: fixtures.showConfirm
}));

vi.mock('@windows/NotesWindow/search.js', () => ({
  selectSuggestion: fixtures.selectSuggestion
}));

vi.mock('@windows/NotesWindow/render.js', () => ({
  renderWindowStructure: fixtures.renderWindowStructure,
  renderNotesList: fixtures.renderNotesList
}));

vi.mock('@windows/NotesWindow/Listeners.js', () => ({
  attachNotesListeners: fixtures.attachNotesListeners
}));

vi.mock('@windows/NotesWindow/WindowActions.js', () => ({
  applyStoreChange: fixtures.applyStoreChange,
  applyStoreError: fixtures.applyStoreError,
  applyWindowMessage: fixtures.applyWindowMessage,
  importNotesFile: fixtures.importNotesFile,
  printCurrent: fixtures.printCurrent,
  printAll: fixtures.printAll
}));

vi.mock('@windows/NotesWindow/EditorView.js', () => ({
  syncEditorChrome: fixtures.syncEditorChrome,
  applyEditorPaste: fixtures.applyEditorPaste,
  clearEmptyEditorMarkup: fixtures.clearEmptyEditorMarkup,
  refreshDetectedRefs: fixtures.refreshDetectedRefs
}));

vi.mock('@lib/i18n.js', () => ({
  t: fixtures.translate
}));

import { NotesWindow } from '@windows/NotesWindow.js';

function makeStore() {
  return {
    corruptionDetected: false,
    hasPendingWrites: false,
    on: vi.fn(),
    off: vi.fn(),
    getAll: vi.fn(() => []),
    get: vi.fn(),
    getPlainText: vi.fn(id => `plain:${id}`),
    create: vi.fn(() => ({ id: 'new-note' })),
    update: vi.fn((_id, patch) => ({ id: _id, modified: Date.now(), ...patch })),
    remove: vi.fn()
  };
}

function makeRefs() {
  return {
    header: document.createElement('div'),
    main: document.createElement('div'),
    sidebarToggle: document.createElement('button'),
    newBtn: document.createElement('button'),
    linkBtn: document.createElement('button'),
    downloadBtn: document.createElement('button'),
    downloadMenu: document.createElement('div'),
    uploadBtn: document.createElement('button'),
    uploadInput: document.createElement('input'),
    printBtn: document.createElement('button'),
    printMenu: document.createElement('div'),
    printVersesCheckbox: document.createElement('input'),
    filter: document.createElement('select'),
    sortSelect: document.createElement('select'),
    search: document.createElement('input'),
    searchSuggestions: document.createElement('div'),
    sidebar: document.createElement('div'),
    list: document.createElement('div'),
    editorContainer: document.createElement('div'),
    titleInput: document.createElement('input'),
    referenceBadge: document.createElement('span'),
    unlinkBtn: document.createElement('button'),
    pinToggle: document.createElement('button'),
    deleteBtn: document.createElement('button'),
    toolbar: document.createElement('div'),
    editor: document.createElement('div'),
    detectedRefs: document.createElement('div'),
    status: document.createElement('span'),
    modified: document.createElement('span'),
    emptyState: document.createElement('div')
  };
}

function makeWindow() {
  const win = document.createElement('notes-window');
  win.refs = makeRefs();
  win.trigger = vi.fn();
  return win;
}

describe('NotesWindow controller lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    fixtures.store = makeStore();
    vi.clearAllMocks();
    fixtures.filterAndSortNotes.mockReturnValue([]);
    fixtures.sanitizeHtml.mockImplementation(value => `safe:${value}`);
    fixtures.stripHtml.mockImplementation(value => value.replace(/<[^>]+>/g, ''));
    fixtures.translate.mockImplementation((key, values = {}) =>
      values.date ? `${key}:${values.date}` : values.reference ? `${key}:${values.reference}` : key);
    fixtures.showConfirm.mockResolvedValue(true);
    fixtures.renderWindowStructure.mockImplementation(() => ({
      header: Object.assign(document.createElement('div'), { className: 'window-header notes-header' }),
      main: Object.assign(document.createElement('div'), { className: 'window-main notes-main' })
    }));
    fixtures.renderNotesList.mockReturnValue(document.createElement('div'));
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('initializes view state and obtains the shared store', () => {
    const win = makeWindow();
    expect(win.store).toBe(fixtures.store);
    expect(win.state).toMatchObject({
      currentNoteId: null,
      currentReference: null,
      filterMode: 'all',
      sortMode: 'modified',
      isDirty: false,
      sidebarVisible: true,
      selectedSuggestionIndex: -1
    });
    expect(win._autosaveTimer).toBeNull();
  });

  it('renders the Notes structure and replaces prior contents', async () => {
    const win = makeWindow();
    win.innerHTML = '<p>old</p>';
    await win.render();
    expect(fixtures.renderWindowStructure).toHaveBeenCalled();
    expect(win.children).toHaveLength(2);
    expect(win.querySelector('p')).toBeNull();
  });

  it('caches every rendered reference', () => {
    const win = makeWindow();
    win.innerHTML = `
      <div class="notes-header window-header"></div><div class="notes-main window-main">
      ${[
        'sidebar-toggle','new-btn','link-btn','download-btn','download-menu','upload-btn','upload-input',
        'print-btn','print-menu','print-verses-checkbox','filter','sort','search','search-suggestions',
        'sidebar','list','editor-container','title-input','reference-badge','unlink-btn','pin-toggle',
        'delete-btn','richtext-toolbar','editor','detected-refs','status','modified','empty-state'
      ].map(name => `<div class="notes-${name}"></div>`).join('')}</div>`;
    win.cacheRefs();
    expect(win.refs.header.classList).toContain('notes-header');
    expect(win.refs.editor.classList).toContain('notes-editor');
    expect(win.refs.emptyState.classList).toContain('notes-empty-state');
  });

  it('attaches DOM listeners and forwards message events', () => {
    const win = makeWindow();
    win.on = vi.fn();
    win.handleMessage = vi.fn();
    win.attachEventListeners();
    expect(fixtures.attachNotesListeners).toHaveBeenCalledWith(win);
    const handler = win.on.mock.calls[0][1];
    handler({ data: 1 });
    expect(win.handleMessage).toHaveBeenCalledWith({ data: 1 });
  });

  it('initializes store subscriptions, restored view state, selection, and content request', async () => {
    const win = makeWindow();
    fixtures.store.corruptionDetected = true;
    const params = new Map([
      ['filter', 'linked'], ['sort', 'title'], ['sidebarVisible', 'false'], ['noteId', 'n1']
    ]);
    win.getParam = vi.fn(key => params.get(key) ?? null);
    win.renderNotesList = vi.fn();
    win.updateEditorVisibility = vi.fn();
    win.selectNote = vi.fn();
    win.requestCurrentContent = vi.fn();
    win.refs.filter.append(new Option('Linked', 'linked'));
    win.refs.sortSelect.append(new Option('Title', 'title'));
    await win.init();

    expect(win.getPlainText('n1')).toBe('plain:n1');
    expect(fixtures.store.on).toHaveBeenCalledWith('change', win._onStoreChange);
    expect(fixtures.store.on).toHaveBeenCalledWith('error', win._onStoreError);
    win._onStoreChange({ type: 'change' });
    win._onStoreError({ code: 'quota' });
    expect(fixtures.applyStoreChange).toHaveBeenCalledWith(win);
    expect(fixtures.applyStoreError).toHaveBeenCalledWith(win, { code: 'quota' });
    expect(fixtures.showNotice).toHaveBeenCalled();
    expect(win.state.filterMode).toBe('linked');
    expect(win.state.sortMode).toBe('title');
    expect(win.state.sidebarVisible).toBe(false);
    expect(win.refs.sidebar.classList).toContain('hidden');
    expect(win.selectNote).toHaveBeenCalledWith('n1');
    expect(win.requestCurrentContent).toHaveBeenCalled();
  });

  it('initializes defaults without optional restored settings', async () => {
    const win = makeWindow();
    win.getParam = vi.fn(() => null);
    win.renderNotesList = vi.fn();
    win.updateEditorVisibility = vi.fn();
    win.selectNote = vi.fn();
    win.requestCurrentContent = vi.fn();
    await win.init();
    expect(win.state.filterMode).toBe('all');
    expect(win.state.sidebarVisible).toBe(true);
    expect(win.selectNote).not.toHaveBeenCalled();
    expect(fixtures.showNotice).not.toHaveBeenCalled();
  });

  it('accepts boolean false for restored sidebar visibility', async () => {
    const win = makeWindow();
    win.getParam = vi.fn(key => key === 'sidebarVisible' ? false : null);
    win.renderNotesList = vi.fn();
    win.updateEditorVisibility = vi.fn();
    win.requestCurrentContent = vi.fn();
    await win.init();
    expect(win.state.sidebarVisible).toBe(false);
  });

  it('flushes autosave and detaches store subscriptions during cleanup', () => {
    const win = makeWindow();
    win._autosaveTimer = setTimeout(() => {}, 1000);
    win.saveCurrentNote = vi.fn();
    win._onStoreChange = vi.fn();
    win._onStoreError = vi.fn();
    win.cleanup();
    expect(win._autosaveTimer).toBeNull();
    expect(win.saveCurrentNote).toHaveBeenCalled();
    expect(fixtures.store.off).toHaveBeenCalledWith('change', win._onStoreChange);
    expect(fixtures.store.off).toHaveBeenCalledWith('error', win._onStoreError);
  });

  it('cleanup tolerates no timer or store handlers', () => {
    const win = makeWindow();
    expect(() => win.cleanup()).not.toThrow();
    expect(fixtures.store.off).not.toHaveBeenCalled();
  });

  it('delegates store, message, import, and print actions', () => {
    const win = makeWindow();
    win.handleStoreChange({ data: 1 });
    win.handleStoreError({ code: 'x' });
    win.handleMessage({ data: 2 });
    win.importFile('file');
    win.printCurrentNote(true);
    win.printAllNotes(false);
    expect(fixtures.applyStoreChange).toHaveBeenCalledWith(win);
    expect(fixtures.applyStoreError).toHaveBeenCalledWith(win, { code: 'x' });
    expect(fixtures.applyWindowMessage).toHaveBeenCalledWith(win, { data: 2 });
    expect(fixtures.importNotesFile).toHaveBeenCalledWith(win, 'file');
    expect(fixtures.printCurrent).toHaveBeenCalledWith(win, true);
    expect(fixtures.printAll).toHaveBeenCalledWith(win, false);
  });

  it('marks local writes only for the duration of callbacks, including failures', () => {
    const win = makeWindow();
    expect(win._withStoreWrite(() => {
      expect(win._selfChange).toBe(true);
      return 7;
    })).toBe(7);
    expect(win._selfChange).toBe(false);
    expect(() => win._withStoreWrite(() => { throw new Error('write'); })).toThrow('write');
    expect(win._selfChange).toBe(false);
  });

  it('updates and clears the current reference, rerendering reference filters', () => {
    const win = makeWindow();
    win.formatReferenceDisplay = vi.fn(() => 'John 3:16');
    win.renderNotesList = vi.fn();
    win.state.filterMode = 'reference';
    win.setCurrentReference('JN3_16');
    expect(win.state.currentReferenceDisplay).toBe('John 3:16');
    expect(win.renderNotesList).toHaveBeenCalled();
    win.setCurrentReference(null);
    expect(win.state.currentReference).toBeNull();
    expect(win.state.currentReferenceDisplay).toBeNull();
  });

  it('does not rerender reference changes for other filters', () => {
    const win = makeWindow();
    win.renderNotesList = vi.fn();
    win.setCurrentReference('GN1_1');
    expect(win.renderNotesList).not.toHaveBeenCalled();
  });

  it('requests current content and broadcasts valid reference navigation', () => {
    const win = makeWindow();
    win.setCurrentReference = vi.fn();
    win.requestCurrentContent();
    expect(win.trigger).toHaveBeenCalledWith('globalmessage', expect.objectContaining({
      data: { messagetype: 'maprequest', requesttype: 'currentcontent' }
    }));
    win.trigger.mockClear();
    win.navigateToReference(null, 'JN3');
    expect(win.trigger).not.toHaveBeenCalled();
    win.navigateToReference('JN3_16', 'JN3');
    expect(win.setCurrentReference).toHaveBeenCalledWith('JN3_16');
    expect(win.trigger).toHaveBeenCalledWith('globalmessage', expect.objectContaining({
      data: { messagetype: 'nav', type: 'bible', locationInfo: { sectionid: 'JN3', fragmentid: 'JN3_16' } }
    }));
  });

  it('filters and renders notes with the correct empty message', () => {
    const win = makeWindow();
    const notes = [{ id: 'n1' }];
    fixtures.store.getAll.mockReturnValue(notes);
    fixtures.filterAndSortNotes.mockReturnValue(notes);
    const filtered = win.getFilteredNotes();
    expect(filtered).toBe(notes);
    expect(fixtures.filterAndSortNotes).toHaveBeenCalledWith(notes, expect.objectContaining({
      filterMode: 'all', sortMode: 'modified'
    }));
    win.renderNotesList();
    expect(fixtures.renderNotesList).toHaveBeenCalledWith(notes, null, undefined, 'windows.notes.noNotesFound');
    expect(win.refs.list.children).toHaveLength(1);

    fixtures.store.getAll.mockReturnValue([]);
    win.renderNotesList();
    expect(fixtures.renderNotesList).toHaveBeenLastCalledWith(
      notes, null, undefined, 'windows.notes.emptyListHint'
    );
  });

  it('shows editor or empty state based on selection and toggles sidebar', () => {
    const win = makeWindow();
    win.state.currentNoteId = 'n1';
    win.updateEditorVisibility();
    expect(win.refs.editorContainer.classList).not.toContain('hidden');
    expect(win.refs.emptyState.classList).toContain('hidden');
    win.state.currentNoteId = null;
    win.updateEditorVisibility();
    expect(win.refs.editorContainer.classList).toContain('hidden');
    expect(win.refs.emptyState.classList).not.toContain('hidden');

    win.notifySettingsChange = vi.fn();
    win.toggleSidebar();
    expect(win.state.sidebarVisible).toBe(false);
    expect(win.refs.sidebar.classList).toContain('hidden');
    expect(win.notifySettingsChange).toHaveBeenCalled();
  });

  it('selects a search suggestion and resets its search state', () => {
    const win = makeWindow();
    win.selectNote = vi.fn();
    win.renderNotesList = vi.fn();
    fixtures.selectSuggestion.mockReturnValueOnce(null).mockReturnValueOnce('n2');
    win.selectSuggestion(0);
    expect(win.selectNote).not.toHaveBeenCalled();
    win.state.searchQuery = 'find';
    win.selectSuggestion(1);
    expect(win.state.searchQuery).toBe('');
    expect(win.selectNote).toHaveBeenCalledWith('n2');
    expect(win.renderNotesList).toHaveBeenCalled();
  });

  it('creates a note after saving and focuses its title', () => {
    const win = makeWindow();
    win.saveCurrentNote = vi.fn();
    win.selectNote = vi.fn();
    const focus = vi.spyOn(win.refs.titleInput, 'focus');
    win.createNewNote();
    expect(win.saveCurrentNote).toHaveBeenCalled();
    expect(fixtures.store.create).toHaveBeenCalledWith({});
    expect(win.selectNote).toHaveBeenCalledWith('new-note');
    expect(focus).toHaveBeenCalled();
  });

  it('ignores a missing note and loads a present note safely', () => {
    const win = makeWindow();
    win.saveCurrentNote = vi.fn();
    win.normalizeEmptyEditor = vi.fn();
    win.updateEditorChrome = vi.fn();
    win.updateEditorVisibility = vi.fn();
    win.renderNotesList = vi.fn();
    win.updateDetectedRefs = vi.fn();
    win.notifySettingsChange = vi.fn();
    fixtures.store.get.mockReturnValueOnce(null);
    win.selectNote('missing');
    expect(win.state.currentNoteId).toBeNull();

    const note = { id: 'n1', title: '', content: '<b>x</b>', modified: 1 };
    fixtures.store.get.mockReturnValue(note);
    win.selectNote('n1');
    expect(win.state.currentNoteId).toBe('n1');
    expect(win.refs.titleInput.value).toBe('');
    expect(win.refs.editor.innerHTML).toBe('safe:<b>x</b>');
    expect(win.updateEditorChrome).toHaveBeenCalledWith(note);
    expect(win.updateDetectedRefs).toHaveBeenCalled();
    expect(win.notifySettingsChange).toHaveBeenCalled();
  });

  it('closes an overlay sidebar after narrow-mode selection', () => {
    const win = makeWindow();
    win.classList.add('notes-narrow');
    fixtures.store.get.mockReturnValue({ id: 'n1', title: 'A', content: '', modified: 1 });
    win.saveCurrentNote = vi.fn();
    win.normalizeEmptyEditor = vi.fn();
    win.updateEditorChrome = vi.fn();
    win.updateEditorVisibility = vi.fn();
    win.renderNotesList = vi.fn();
    win.updateDetectedRefs = vi.fn();
    win.notifySettingsChange = vi.fn();
    win.toggleSidebar = vi.fn();
    win.selectNote('n1');
    expect(win.toggleSidebar).toHaveBeenCalled();

    win.toggleSidebar.mockClear();
    win.state.sidebarVisible = false;
    win.selectNote('n1');
    expect(win.toggleSidebar).not.toHaveBeenCalled();
  });

  it('saves only dirty selected notes and reports completed writes', () => {
    const win = makeWindow();
    win.getAutoTitle = vi.fn(() => 'Auto title');
    win.updateDetectedRefs = vi.fn();
    win.saveCurrentNote();
    expect(fixtures.store.update).not.toHaveBeenCalled();
    win.state.currentNoteId = 'n1';
    win.saveCurrentNote();
    expect(fixtures.store.update).not.toHaveBeenCalled();

    win.state.isDirty = true;
    win.refs.titleInput.value = '   ';
    win.refs.editor.innerHTML = '<script>x</script>';
    win._quotaNotified = true;
    win.saveCurrentNote();
    expect(fixtures.store.update).toHaveBeenCalledWith('n1', {
      title: 'Auto title', content: 'safe:<script>x</script>'
    });
    expect(win.state.isDirty).toBe(false);
    expect(win._quotaNotified).toBe(false);
    expect(win.refs.status.textContent).toBe('windows.notes.saved');
    expect(win.updateDetectedRefs).toHaveBeenCalled();
  });

  it('preserves pending-write status and explicit titles', () => {
    const win = makeWindow();
    win.state.currentNoteId = 'n1';
    win.state.isDirty = true;
    win.refs.titleInput.value = ' Title ';
    win.refs.status.textContent = 'pending';
    fixtures.store.hasPendingWrites = true;
    win.updateDetectedRefs = vi.fn();
    win.saveCurrentNote();
    expect(fixtures.store.update).toHaveBeenCalledWith('n1', expect.objectContaining({ title: 'Title' }));
    expect(win.refs.status.textContent).toBe('pending');
  });

  it('deletes confirmed notes, cancels autosave, and updates the view', async () => {
    const win = makeWindow();
    win.state.currentNoteId = 'n1';
    win.state.isDirty = true;
    win._autosaveTimer = setTimeout(() => {}, 1000);
    win.updateEditorVisibility = vi.fn();
    win.renderNotesList = vi.fn();
    win.notifySettingsChange = vi.fn();
    await win.deleteCurrentNote();
    expect(fixtures.showConfirm).toHaveBeenCalled();
    expect(fixtures.store.remove).toHaveBeenCalledWith('n1');
    expect(win._autosaveTimer).toBeNull();
    expect(win.state.currentNoteId).toBeNull();
    expect(win.updateEditorVisibility).toHaveBeenCalled();
  });

  it('does not delete without selection or confirmation', async () => {
    const win = makeWindow();
    await win.deleteCurrentNote();
    expect(fixtures.showConfirm).not.toHaveBeenCalled();
    win.state.currentNoteId = 'n1';
    fixtures.showConfirm.mockResolvedValue(false);
    await win.deleteCurrentNote();
    expect(fixtures.store.remove).not.toHaveBeenCalled();
  });

  it('links an existing note to the current reference', () => {
    const win = makeWindow();
    win.state.currentNoteId = 'n1';
    win.state.currentReference = 'JN3_16';
    win.state.currentReferenceDisplay = 'John 3:16';
    win.saveCurrentNote = vi.fn();
    win.updateEditorChrome = vi.fn();
    win.linkCurrentNote();
    expect(fixtures.store.update).toHaveBeenCalledWith('n1', {
      reference: 'JN3_16', referenceDisplay: 'John 3:16'
    });
    expect(win.updateEditorChrome).toHaveBeenCalled();
    expect(win.refs.status.textContent).toContain('John 3:16');
  });

  it('creates a note for linking and handles missing creation or reference', () => {
    const win = makeWindow();
    win.linkCurrentNote();
    expect(win.refs.status.textContent).toBe('windows.notes.navigateToLink');
    win.state.currentReference = 'GN1_1';
    win.createNewNote = vi.fn(() => { win.state.currentNoteId = 'new'; });
    win.saveCurrentNote = vi.fn();
    win.updateEditorChrome = vi.fn();
    win.linkCurrentNote();
    expect(win.createNewNote).toHaveBeenCalled();
    expect(fixtures.store.update).toHaveBeenCalledWith('new', expect.objectContaining({ reference: 'GN1_1' }));

    fixtures.store.update.mockClear();
    win.state.currentNoteId = null;
    win.createNewNote.mockImplementation(() => {});
    win.linkCurrentNote();
    expect(fixtures.store.update).not.toHaveBeenCalled();
  });

  it('unlinks present notes and ignores absent selections/records', () => {
    const win = makeWindow();
    win.updateEditorChrome = vi.fn();
    win.unlinkCurrentNote();
    expect(fixtures.store.get).not.toHaveBeenCalled();
    win.state.currentNoteId = 'n1';
    fixtures.store.get.mockReturnValueOnce(null);
    win.unlinkCurrentNote();
    expect(fixtures.store.update).not.toHaveBeenCalled();
    fixtures.store.get.mockReturnValue({ id: 'n1' });
    win.unlinkCurrentNote();
    expect(fixtures.store.update).toHaveBeenCalledWith('n1', { reference: null, referenceDisplay: null });
    expect(win.refs.status.textContent).toBe('windows.notes.linkRemoved');
  });

  it('toggles pin without changing modified and refreshes current-note chrome', () => {
    const win = makeWindow();
    win.state.currentNoteId = 'n1';
    win.updateEditorChrome = vi.fn();
    fixtures.store.get.mockReturnValue({ id: 'n1', pinned: false, modified: 12 });
    win.togglePinNote('n1');
    expect(fixtures.store.update).toHaveBeenCalledWith('n1', { pinned: true, modified: 12 });
    expect(win.updateEditorChrome).toHaveBeenCalled();

    win.updateEditorChrome.mockClear();
    fixtures.store.get.mockReturnValue({ id: 'n2', pinned: true, modified: 13 });
    win.togglePinNote('n2');
    expect(win.updateEditorChrome).not.toHaveBeenCalled();
    fixtures.store.get.mockReturnValue(null);
    expect(() => win.togglePinNote('missing')).not.toThrow();
  });

  it('marks edits dirty and debounces autosave', () => {
    const win = makeWindow();
    win.markDirty();
    expect(win.state.isDirty).toBe(true);
    expect(win.refs.status.textContent).toBe('windows.notes.unsavedChanges');
    win.saveCurrentNote = vi.fn();
    win.scheduleAutosave();
    const first = win._autosaveTimer;
    win.scheduleAutosave();
    expect(win._autosaveTimer).not.toBe(first);
    vi.advanceTimersByTime(1000);
    expect(win._autosaveTimer).toBeNull();
    expect(win.saveCurrentNote).toHaveBeenCalledOnce();
  });

  it('executes editor formatting and delegates view helpers', () => {
    const win = makeWindow();
    const focus = vi.spyOn(win.refs.editor, 'focus');
    const execCommand = vi.fn();
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    win.markDirty = vi.fn();
    win.scheduleAutosave = vi.fn();
    win.execFormatCommand('formatBlock', 'H2');
    expect(focus).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith('formatBlock', false, 'H2');
    expect(win.markDirty).toHaveBeenCalled();
    win.handlePaste({ type: 'paste' });
    win.normalizeEmptyEditor();
    win.updateDetectedRefs();
    win.updateEditorChrome({ id: 'n1' });
    expect(fixtures.applyEditorPaste).toHaveBeenCalledWith(win, { type: 'paste' });
    expect(fixtures.clearEmptyEditorMarkup).toHaveBeenCalledWith(win);
    expect(fixtures.refreshDetectedRefs).toHaveBeenCalledWith(win);
    expect(fixtures.syncEditorChrome).toHaveBeenCalledWith(win, { id: 'n1' });
  });

  it('emits settings and responsive resize events', () => {
    const win = makeWindow();
    win.notifySettingsChange();
    expect(win.trigger).toHaveBeenCalledWith('settingschange', expect.objectContaining({ target: win }));
    win.trigger.mockClear();
    win.size(320, 500);
    expect(win.style.width).toBe('320px');
    expect(win.style.height).toBe('500px');
    expect(win.classList).toContain('notes-narrow');
    expect(win.trigger).toHaveBeenCalledWith('resize', expect.objectContaining({ data: { width: 320, height: 500 } }));
    win.size(0, 500);
    expect(win.classList).not.toContain('notes-narrow');
    win.size(600, 500);
    expect(win.classList).not.toContain('notes-narrow');
  });
});

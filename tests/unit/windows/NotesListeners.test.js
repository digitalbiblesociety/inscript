import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  downloadNotes: vi.fn(),
  updateSearchSuggestions: vi.fn(),
  hideSearchSuggestions: vi.fn(),
  updateSuggestionSelection: vi.fn()
}));

vi.mock('@windows/NotesWindow/download.js', () => ({
  downloadNotes: fixtures.downloadNotes
}));

vi.mock('@windows/NotesWindow/search.js', () => ({
  updateSearchSuggestions: fixtures.updateSearchSuggestions,
  hideSearchSuggestions: fixtures.hideSearchSuggestions,
  updateSuggestionSelection: fixtures.updateSuggestionSelection
}));

import { attachNotesListeners } from '@windows/NotesWindow/Listeners.js';

function element(tag = 'div', className = '') {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function nested(className, data = {}) {
  const parent = element('div', className);
  Object.assign(parent.dataset, data);
  const child = document.createElement('span');
  parent.appendChild(child);
  return { parent, child };
}

function makeWindow() {
  const refs = {
    sidebarToggle: element('button'),
    newBtn: element('button'),
    linkBtn: element('button'),
    downloadBtn: element('button'),
    downloadMenu: element(),
    uploadBtn: element('button'),
    uploadInput: element('input'),
    printBtn: element('button'),
    printMenu: element(),
    printVersesCheckbox: element('input'),
    filter: element('select'),
    sortSelect: element('select'),
    search: element('input'),
    searchSuggestions: element(),
    list: element(),
    titleInput: element('input'),
    unlinkBtn: element('button'),
    pinToggle: element('button'),
    deleteBtn: element('button'),
    toolbar: element(),
    editor: element(),
    detectedRefs: element()
  };
  const listeners = [];
  const notes = [{ id: 'n1' }, { id: 'n2' }];
  const win = {
    refs,
    state: {
      currentNoteId: 'n1',
      filterMode: 'all',
      sortMode: 'modified',
      searchQuery: '',
      selectedSuggestionIndex: -1
    },
    store: { getAll: vi.fn(() => notes) },
    getPlainText: vi.fn(),
    toggleSidebar: vi.fn(),
    createNewNote: vi.fn(),
    linkCurrentNote: vi.fn(),
    saveCurrentNote: vi.fn(),
    importFile: vi.fn(),
    printCurrentNote: vi.fn(),
    printAllNotes: vi.fn(),
    renderNotesList: vi.fn(),
    notifySettingsChange: vi.fn(),
    selectSuggestion: vi.fn(),
    togglePinNote: vi.fn(),
    selectNote: vi.fn(),
    unlinkCurrentNote: vi.fn(),
    deleteCurrentNote: vi.fn(),
    execFormatCommand: vi.fn(),
    normalizeEmptyEditor: vi.fn(),
    markDirty: vi.fn(),
    scheduleAutosave: vi.fn(),
    handlePaste: vi.fn(),
    navigateToReference: vi.fn(),
    addListener: vi.fn((target, type, callback) => listeners.push({ target, type, callback }))
  };
  attachNotesListeners(win);
  return { win, listeners, notes };
}

function callback(listeners, target, type) {
  return listeners.find(item => item.target === target && item.type === type).callback;
}

function eventFor(target, extra = {}) {
  return { target, preventDefault: vi.fn(), ...extra };
}

describe('NotesWindow listeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it('wires every toolbar, sidebar, and editor listener', () => {
    const { win, listeners } = makeWindow();
    expect(win.addListener).toHaveBeenCalledTimes(27);
    expect(listeners.filter(item => item.target === document)).toHaveLength(1);
  });

  it('delegates the simple toolbar actions', () => {
    const { win, listeners } = makeWindow();
    callback(listeners, win.refs.sidebarToggle, 'click')();
    callback(listeners, win.refs.newBtn, 'click')();
    callback(listeners, win.refs.linkBtn, 'click')();
    expect(win.toggleSidebar).toHaveBeenCalled();
    expect(win.createNewNote).toHaveBeenCalled();
    expect(win.linkCurrentNote).toHaveBeenCalled();
  });

  it('toggles and executes download menu items', () => {
    const { win, listeners, notes } = makeWindow();
    const toggle = callback(listeners, win.refs.downloadBtn, 'click');
    const menu = callback(listeners, win.refs.downloadMenu, 'click');
    toggle();
    expect(win.refs.downloadMenu.classList).toContain('visible');
    toggle();
    expect(win.refs.downloadMenu.classList).not.toContain('visible');

    menu(eventFor(document.createElement('span')));
    expect(win.saveCurrentNote).not.toHaveBeenCalled();
    const item = nested('notes-download-item', { format: 'markdown' });
    win.refs.downloadMenu.classList.add('visible');
    menu(eventFor(item.child));
    expect(win.saveCurrentNote).toHaveBeenCalled();
    expect(fixtures.downloadNotes).toHaveBeenCalledWith(notes, 'markdown');
    expect(win.refs.downloadMenu.classList).not.toContain('visible');
  });

  it('dismisses download and print menus only for outside clicks', () => {
    const { win, listeners } = makeWindow();
    const click = callback(listeners, document, 'click');
    win.refs.downloadMenu.classList.add('visible');
    win.refs.printMenu.classList.add('visible');
    const download = nested('notes-download-container');
    click(eventFor(download.child));
    expect(win.refs.downloadMenu.classList).toContain('visible');
    expect(win.refs.printMenu.classList).not.toContain('visible');

    win.refs.printMenu.classList.add('visible');
    const print = nested('notes-print-container');
    click(eventFor(print.child));
    expect(win.refs.downloadMenu.classList).not.toContain('visible');
    expect(win.refs.printMenu.classList).toContain('visible');

    click(eventFor(document.body));
    expect(win.refs.printMenu.classList).not.toContain('visible');
  });

  it('opens the file picker and imports a chosen file once', () => {
    const { win, listeners } = makeWindow();
    const click = vi.spyOn(win.refs.uploadInput, 'click');
    callback(listeners, win.refs.uploadBtn, 'click')();
    expect(click).toHaveBeenCalled();

    const change = callback(listeners, win.refs.uploadInput, 'change');
    Object.defineProperty(win.refs.uploadInput, 'files', { value: [], configurable: true });
    change();
    expect(win.importFile).not.toHaveBeenCalled();
    const file = new File(['notes'], 'notes.txt');
    Object.defineProperty(win.refs.uploadInput, 'files', { value: [file], configurable: true });
    change();
    expect(win.importFile).toHaveBeenCalledWith(file);
    expect(win.refs.uploadInput.value).toBe('');
  });

  it('toggles print menu and routes current/all print choices', () => {
    const { win, listeners } = makeWindow();
    const toggle = callback(listeners, win.refs.printBtn, 'click');
    const menu = callback(listeners, win.refs.printMenu, 'click');
    toggle();
    expect(win.refs.printMenu.classList).toContain('visible');
    win.refs.printVersesCheckbox.checked = true;

    menu(eventFor(document.createElement('span')));
    expect(win.printCurrentNote).not.toHaveBeenCalled();
    menu(eventFor(nested('notes-print-item', { action: 'current' }).child));
    expect(win.printCurrentNote).toHaveBeenCalledWith(true);
    expect(win.refs.printMenu.classList).not.toContain('visible');

    win.refs.printVersesCheckbox.checked = false;
    menu(eventFor(nested('notes-print-item', { action: 'all' }).child));
    expect(win.printAllNotes).toHaveBeenCalledWith(false);

    menu(eventFor(nested('notes-print-item', { action: 'unknown' }).child));
    expect(win.printCurrentNote).toHaveBeenCalledTimes(1);
    expect(win.printAllNotes).toHaveBeenCalledTimes(1);
  });

  it('updates filter and sort modes and persists each change', () => {
    const { win, listeners } = makeWindow();
    win.refs.filter.appendChild(new Option('Linked', 'linked'));
    win.refs.sortSelect.appendChild(new Option('Title', 'title'));
    win.refs.filter.value = 'linked';
    callback(listeners, win.refs.filter, 'change')();
    expect(win.state.filterMode).toBe('linked');
    win.refs.sortSelect.value = 'title';
    callback(listeners, win.refs.sortSelect, 'change')();
    expect(win.state.sortMode).toBe('title');
    expect(win.renderNotesList).toHaveBeenCalledTimes(2);
    expect(win.notifySettingsChange).toHaveBeenCalledTimes(2);
  });

  it('updates search suggestions and the filtered notes list on input', () => {
    const { win, listeners, notes } = makeWindow();
    win.refs.search.value = 'hope';
    callback(listeners, win.refs.search, 'input')();
    expect(win.state.searchQuery).toBe('hope');
    expect(fixtures.updateSearchSuggestions).toHaveBeenCalledWith(
      win.state, win.refs, notes, win.getPlainText
    );
    expect(win.renderNotesList).toHaveBeenCalled();
  });

  it('delays suggestion dismissal after blur and refreshes nonblank focus', () => {
    const { win, listeners, notes } = makeWindow();
    callback(listeners, win.refs.search, 'blur')();
    expect(fixtures.hideSearchSuggestions).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(fixtures.hideSearchSuggestions).toHaveBeenCalledWith(win.state, win.refs);

    const focus = callback(listeners, win.refs.search, 'focus');
    win.refs.search.value = '   ';
    focus();
    expect(fixtures.updateSearchSuggestions).not.toHaveBeenCalled();
    win.refs.search.value = 'faith';
    focus();
    expect(fixtures.updateSearchSuggestions).toHaveBeenCalledWith(
      win.state, win.refs, notes, win.getPlainText
    );
  });

  it('ignores search keys while suggestions are hidden', () => {
    const { win, listeners } = makeWindow();
    const keydown = callback(listeners, win.refs.search, 'keydown');
    const event = eventFor(win.refs.search, { key: 'ArrowDown' });
    keydown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(fixtures.updateSuggestionSelection).not.toHaveBeenCalled();
  });

  it.each([
    ['ArrowDown', 1],
    ['ArrowUp', -1]
  ])('moves suggestion selection with %s', (key, index) => {
    const { win, listeners } = makeWindow();
    win.refs.searchSuggestions.classList.add('visible');
    win.state.selectedSuggestionIndex = 0;
    const event = eventFor(win.refs.search, { key });
    callback(listeners, win.refs.search, 'keydown')(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(fixtures.updateSuggestionSelection).toHaveBeenCalledWith(win.state, win.refs, index);
  });

  it('selects on Enter, dismisses on Escape, and ignores other visible-state keys', () => {
    const { win, listeners } = makeWindow();
    win.refs.searchSuggestions.classList.add('visible');
    win.state.selectedSuggestionIndex = 2;
    const keydown = callback(listeners, win.refs.search, 'keydown');
    const enter = eventFor(win.refs.search, { key: 'Enter' });
    keydown(enter);
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(win.selectSuggestion).toHaveBeenCalledWith(2);

    keydown(eventFor(win.refs.search, { key: 'Escape' }));
    expect(fixtures.hideSearchSuggestions).toHaveBeenCalledWith(win.state, win.refs);
    const tab = eventFor(win.refs.search, { key: 'Tab' });
    keydown(tab);
    expect(tab.preventDefault).not.toHaveBeenCalled();
  });

  it('selects a clicked suggestion before blur', () => {
    const { win, listeners } = makeWindow();
    const down = callback(listeners, win.refs.searchSuggestions, 'mousedown');
    down(eventFor(document.createElement('span')));
    expect(win.selectSuggestion).not.toHaveBeenCalled();
    down(eventFor(nested('notes-suggestion-item', { index: '3' }).child));
    expect(win.selectSuggestion).toHaveBeenCalledWith(3);
  });

  it('pins from the list without selecting, and selects ordinary list rows', () => {
    const { win, listeners } = makeWindow();
    const click = callback(listeners, win.refs.list, 'click');
    const row = nested('notes-list-item', { noteId: 'n2' });
    const pin = element('button', 'notes-pin-btn');
    row.parent.appendChild(pin);
    click(eventFor(pin));
    expect(win.togglePinNote).toHaveBeenCalledWith('n2');
    expect(win.selectNote).not.toHaveBeenCalled();

    click(eventFor(row.child));
    expect(win.selectNote).toHaveBeenCalledWith('n2');
    click(eventFor(document.createElement('span')));
    expect(win.selectNote).toHaveBeenCalledTimes(1);

    const orphanPin = element('button', 'notes-pin-btn');
    click(eventFor(orphanPin));
    expect(win.togglePinNote).toHaveBeenCalledTimes(1);
  });

  it('marks title and editor input dirty and schedules autosave', () => {
    const { win, listeners } = makeWindow();
    callback(listeners, win.refs.titleInput, 'input')();
    expect(win.markDirty).toHaveBeenCalledTimes(1);
    expect(win.scheduleAutosave).toHaveBeenCalledTimes(1);

    callback(listeners, win.refs.editor, 'input')();
    expect(win.normalizeEmptyEditor).toHaveBeenCalled();
    expect(win.markDirty).toHaveBeenCalledTimes(2);
    expect(win.scheduleAutosave).toHaveBeenCalledTimes(2);
  });

  it('routes unlink, pin, delete, and paste actions', () => {
    const { win, listeners } = makeWindow();
    callback(listeners, win.refs.unlinkBtn, 'click')();
    callback(listeners, win.refs.pinToggle, 'click')();
    callback(listeners, win.refs.deleteBtn, 'click')();
    const paste = { clipboardData: {} };
    callback(listeners, win.refs.editor, 'paste')(paste);
    expect(win.unlinkCurrentNote).toHaveBeenCalled();
    expect(win.togglePinNote).toHaveBeenCalledWith('n1');
    expect(win.deleteCurrentNote).toHaveBeenCalled();
    expect(win.handlePaste).toHaveBeenCalledWith(paste);

    win.state.currentNoteId = null;
    callback(listeners, win.refs.pinToggle, 'click')();
    expect(win.togglePinNote).toHaveBeenCalledTimes(1);
  });

  it('executes toolbar commands with optional values', () => {
    const { win, listeners } = makeWindow();
    const click = callback(listeners, win.refs.toolbar, 'click');
    click(eventFor(document.createElement('span')));
    expect(win.execFormatCommand).not.toHaveBeenCalled();

    const button = element('button');
    button.dataset.command = 'formatBlock';
    button.dataset.value = 'h2';
    const child = document.createElement('span');
    button.appendChild(child);
    click(eventFor(child));
    expect(win.execFormatCommand).toHaveBeenCalledWith('formatBlock', 'h2');

    button.dataset.command = 'bold';
    delete button.dataset.value;
    click(eventFor(child));
    expect(win.execFormatCommand).toHaveBeenCalledWith('bold', null);
  });

  it('navigates from detected-reference chips', () => {
    const { win, listeners } = makeWindow();
    const click = callback(listeners, win.refs.detectedRefs, 'click');
    click(eventFor(document.createElement('span')));
    expect(win.navigateToReference).not.toHaveBeenCalled();
    const chip = nested('notes-ref-chip', { fragmentid: 'JN3_16', sectionid: 'JN3' });
    click(eventFor(chip.child));
    expect(win.navigateToReference).toHaveBeenCalledWith('JN3_16', 'JN3');
  });

  it.each([
    ['b', 'bold', true, false],
    ['I', 'italic', false, true],
    ['u', 'underline', true, false]
  ])('executes %s format shortcut', (key, command, ctrlKey, metaKey) => {
    const { win, listeners } = makeWindow();
    const event = eventFor(win.refs.editor, { key, ctrlKey, metaKey });
    callback(listeners, win.refs.editor, 'keydown')(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.execFormatCommand).toHaveBeenCalledWith(command);
  });

  it('ignores editor shortcuts without modifiers or unsupported commands', () => {
    const { win, listeners } = makeWindow();
    const keydown = callback(listeners, win.refs.editor, 'keydown');
    const plain = eventFor(win.refs.editor, { key: 'b', ctrlKey: false, metaKey: false });
    const unsupported = eventFor(win.refs.editor, { key: 'x', ctrlKey: true, metaKey: false });
    keydown(plain);
    keydown(unsupported);
    expect(plain.preventDefault).not.toHaveBeenCalled();
    expect(unsupported.preventDefault).not.toHaveBeenCalled();
    expect(win.execFormatCommand).not.toHaveBeenCalled();
  });
});

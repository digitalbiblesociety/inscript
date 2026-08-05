/**
 * DOM event wiring for NotesWindow. Handlers hold no state of their own;
 * they call back into the window instance, and addListener ties their
 * lifetime to the window's cleanup.
 */

import { downloadNotes } from './download.js';
import {
  updateSearchSuggestions,
  hideSearchSuggestions,
  updateSuggestionSelection
} from './search.js';

function attachToolbarListeners(win) {
  win.addListener(win.refs.sidebarToggle, 'click', () => win.toggleSidebar());
  win.addListener(win.refs.newBtn, 'click', () => win.createNewNote());
  win.addListener(win.refs.linkBtn, 'click', () => win.linkCurrentNote());

  win.addListener(win.refs.downloadBtn, 'click', () => {
    win.refs.downloadMenu.classList.toggle('visible');
  });

  win.addListener(win.refs.downloadMenu, 'click', (e) => {
    const item = e.target.closest('.notes-download-item');
    if (item) {
      win.saveCurrentNote();
      downloadNotes(win.store.getAll(), item.dataset.format);
      win.refs.downloadMenu.classList.remove('visible');
    }
  });

  win.addListener(document, 'click', (e) => {
    if (!e.target.closest('.notes-download-container')) {
      win.refs.downloadMenu.classList.remove('visible');
    }
    if (!e.target.closest('.notes-print-container')) {
      win.refs.printMenu.classList.remove('visible');
    }
  });

  win.addListener(win.refs.uploadBtn, 'click', () => {
    win.refs.uploadInput.click();
  });

  win.addListener(win.refs.uploadInput, 'change', () => {
    const file = win.refs.uploadInput.files[0];
    if (file) {
      win.importFile(file);
      win.refs.uploadInput.value = '';
    }
  });

  win.addListener(win.refs.printBtn, 'click', () => {
    win.refs.printMenu.classList.toggle('visible');
  });

  win.addListener(win.refs.printMenu, 'click', (e) => handlePrintMenuClick(win, e));
}

function handlePrintMenuClick(win, e) {
  const item = e.target.closest('.notes-print-item');
  if (!item) return;

  const action = item.dataset.action;
  const includeVerseText = win.refs.printVersesCheckbox.checked;
  win.refs.printMenu.classList.remove('visible');

  if (action === 'current') {
    win.printCurrentNote(includeVerseText);
  } else if (action === 'all') {
    win.printAllNotes(includeVerseText);
  }
}

function attachSidebarListeners(win) {
  win.addListener(win.refs.filter, 'change', () => {
    win.state.filterMode = win.refs.filter.value;
    win.renderNotesList();
    win.notifySettingsChange();
  });

  win.addListener(win.refs.sortSelect, 'change', () => {
    win.state.sortMode = win.refs.sortSelect.value;
    win.renderNotesList();
    win.notifySettingsChange();
  });

  win.addListener(win.refs.search, 'input', () => {
    win.state.searchQuery = win.refs.search.value;
    updateSearchSuggestions(win.state, win.refs, win.store.getAll(), win.getPlainText);
    win.renderNotesList();
  });

  win.addListener(win.refs.search, 'keydown', (e) => handleSearchKeydown(win, e));

  // Delay on blur so a click on a suggestion lands before the list hides
  win.addListener(win.refs.search, 'blur', () => {
    setTimeout(() => hideSearchSuggestions(win.state, win.refs), 150);
  });

  win.addListener(win.refs.search, 'focus', () => {
    if (win.refs.search.value.trim()) {
      updateSearchSuggestions(win.state, win.refs, win.store.getAll(), win.getPlainText);
    }
  });

  // mousedown so the pick fires before the search input's blur
  win.addListener(win.refs.searchSuggestions, 'mousedown', (e) => {
    const item = e.target.closest('.notes-suggestion-item');
    if (item) {
      win.selectSuggestion(parseInt(item.dataset.index, 10));
    }
  });

  win.addListener(win.refs.list, 'click', (e) => handleListClick(win, e));
}

function handleSearchKeydown(win, e) {
  if (!win.refs.searchSuggestions.classList.contains('visible')) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    updateSuggestionSelection(win.state, win.refs, win.state.selectedSuggestionIndex + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    updateSuggestionSelection(win.state, win.refs, win.state.selectedSuggestionIndex - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    win.selectSuggestion(win.state.selectedSuggestionIndex);
  } else if (e.key === 'Escape') {
    hideSearchSuggestions(win.state, win.refs);
  }
}

function handleListClick(win, e) {
  const pinBtn = e.target.closest('.notes-pin-btn');
  if (pinBtn) {
    const item = pinBtn.closest('.notes-list-item');
    if (item) win.togglePinNote(item.dataset.noteId);
    return;
  }
  const item = e.target.closest('.notes-list-item');
  if (item) {
    win.selectNote(item.dataset.noteId);
  }
}

const FORMAT_SHORTCUTS = { b: 'bold', i: 'italic', u: 'underline' };

function handleEditorKeydown(win, e) {
  if (!e.ctrlKey && !e.metaKey) return;
  const command = FORMAT_SHORTCUTS[e.key.toLowerCase()];
  if (command) {
    e.preventDefault();
    win.execFormatCommand(command);
  }
}

function attachEditorListeners(win) {
  win.addListener(win.refs.titleInput, 'input', () => {
    win.markDirty();
    win.scheduleAutosave();
  });

  win.addListener(win.refs.unlinkBtn, 'click', () => win.unlinkCurrentNote());

  win.addListener(win.refs.pinToggle, 'click', () => {
    if (win.state.currentNoteId) win.togglePinNote(win.state.currentNoteId);
  });

  win.addListener(win.refs.deleteBtn, 'click', () => win.deleteCurrentNote());

  win.addListener(win.refs.toolbar, 'click', (e) => {
    const btn = e.target.closest('button');
    if (btn) {
      win.execFormatCommand(btn.dataset.command, btn.dataset.value || null);
    }
  });

  win.addListener(win.refs.editor, 'input', () => {
    win.normalizeEmptyEditor();
    win.markDirty();
    win.scheduleAutosave();
  });

  win.addListener(win.refs.editor, 'paste', (e) => win.handlePaste(e));

  win.addListener(win.refs.detectedRefs, 'click', (e) => {
    const chip = e.target.closest('.notes-ref-chip');
    if (chip) {
      win.navigateToReference(chip.dataset.fragmentid, chip.dataset.sectionid);
    }
  });

  win.addListener(win.refs.editor, 'keydown', (e) => handleEditorKeydown(win, e));
}

export function attachNotesListeners(win) {
  attachToolbarListeners(win);
  attachSidebarListeners(win);
  attachEditorListeners(win);
}

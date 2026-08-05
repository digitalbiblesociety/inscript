/**
 * NotesWindow reactions to store events, app messages, file imports, and
 * print requests. Every function takes the window instance; view state and
 * the editor buffer stay owned by the window.
 */

import { t } from '../../lib/i18n.js';
import { sanitizeHtml } from './sanitize.js';
import { showNotice } from './notice.js';
import { parseImportedFile } from './upload.js';
import { printNotes } from './print.js';

export function applyStoreChange(win) {
  win.renderNotesList();

  const currentId = win.state.currentNoteId;
  if (!currentId) return;

  const note = win.store.get(currentId);
  if (!note) {
    // Deleted in another window/tab. With local edits pending, keep the
    // buffer; the next autosave re-adds it through store.update().
    if (!win.state.isDirty) {
      win.state.currentNoteId = null;
      win.updateEditorVisibility();
      win.renderNotesList();
    }
    return;
  }

  // Skip editor refresh for this window's own writes and while the user
  // has unsaved local edits (their keystrokes win).
  if (win._selfChange || win.state.isDirty) return;

  win.refs.titleInput.value = note.title || '';
  win.refs.editor.innerHTML = sanitizeHtml(note.content || '');
  win.normalizeEmptyEditor();
  win.updateEditorChrome(note);
  win.refs.modified.textContent = t('windows.notes.modified', { date: new Date(note.modified).toLocaleString() });
  win.updateDetectedRefs();
}

export function applyStoreError(win, e) {
  if (e.code === 'quota') {
    win.refs.status.textContent = t('windows.notes.notSaved');
    if (!win._quotaNotified) {
      win._quotaNotified = true;
      showNotice(t('windows.notes.quotaError'));
    }
  } else if (e.code === 'corrupt') {
    showNotice(t('windows.notes.corruptError'));
  } else {
    win.refs.status.textContent = t('windows.notes.saveFailed');
  }
}

export function applyWindowMessage(win, e) {
  const data = e?.data;
  if (!data) return;

  if (data.messagetype === 'nav' && data.type === 'bible' && data.locationInfo) {
    win.setCurrentReference(data.locationInfo.fragmentid || null);
  } else if (data.messagetype === 'textload') {
    // Covers replies to requestCurrentContent() and regular text loads.
    // Carries the position and the Bible version (used to print verse text).
    if (data.textid) win.state.currentTextId = data.textid;
    if (data.fragmentid) win.setCurrentReference(data.fragmentid);
  }
}

function applyImportedText(win, text, filename) {
  let parsed;
  try {
    parsed = parseImportedFile(text, filename);
  } catch {
    win.refs.status.textContent = t('windows.notes.importInvalid');
    showNotice(t('windows.notes.importInvalid'));
    return;
  }

  const { notes, mode } = parsed;
  if (notes.length === 0) {
    win.refs.status.textContent = t('windows.notes.importNone');
    return;
  }

  const result = win._withStoreWrite(() => win.store.importNotes(notes, { mode }));

  if (mode === 'merge') {
    win.refs.status.textContent = t('windows.notes.importMerged', {
      added: result.added, updated: result.updated, skipped: result.skipped
    });
  } else {
    win.refs.status.textContent = t('windows.notes.imported', { count: result.added });
    win.selectNote(notes[0].id);
  }
}

export function importNotesFile(win, file) {
  const reader = new FileReader();

  reader.onerror = () => {
    win.refs.status.textContent = t('windows.notes.importReadError');
    showNotice(t('windows.notes.importReadError'));
  };

  reader.onload = () => applyImportedText(win, reader.result, file.name);

  reader.readAsText(file);
}

function runPrint(win, notes, options, label) {
  win.refs.status.textContent = options.includeVerseText ? t('windows.notes.preparingPrint') : '';
  printNotes(notes, options).then(() => {
    win.refs.status.textContent = '';
  }).catch(err => {
    console.error(`[NotesWindow] ${label} error:`, err);
    win.refs.status.textContent = t('windows.notes.printError');
  });
}

export function printCurrent(win, includeVerseText) {
  if (!win.state.currentNoteId) {
    win.refs.status.textContent = t('windows.notes.selectToPrint');
    return;
  }

  win.saveCurrentNote();
  const note = win.store.get(win.state.currentNoteId);
  if (!note) return;

  runPrint(win, [note], { includeVerseText, textId: win.state.currentTextId }, 'printCurrentNote');
}

export function printAll(win, includeVerseText) {
  win.saveCurrentNote();
  const notes = win.store.getAll();
  if (notes.length === 0) {
    win.refs.status.textContent = t('windows.notes.noNotesToPrint');
    return;
  }

  runPrint(win, notes, {
    includeVerseText,
    title: t('windows.notes.printAllTitle'),
    textId: win.state.currentTextId
  }, 'printAllNotes');
}

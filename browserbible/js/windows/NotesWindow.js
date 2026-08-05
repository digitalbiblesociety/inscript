/**
 * Notes live in a shared NotesStore (one per tab, synced across tabs), so
 * multiple Notes windows stay consistent. This class owns the editor buffer
 * and view state (filter/sort/search/selection) only.
 */

import { BaseWindow, registerWindowComponent } from './BaseWindow.js';
import { Reference } from '../bible/BibleReference.js';
import { t } from '../lib/i18n.js';
import { getSharedNotesStore } from './NotesWindow/NotesStore.js';
import { filterAndSortNotes } from './NotesWindow/query.js';
import { sanitizeHtml, stripHtml } from './NotesWindow/sanitize.js';
import { showNotice, showConfirm } from './NotesWindow/notice.js';
import { selectSuggestion } from './NotesWindow/search.js';
import { renderWindowStructure, renderNotesList } from './NotesWindow/render.js';
import { attachNotesListeners } from './NotesWindow/Listeners.js';
import {
  applyStoreChange,
  applyStoreError,
  applyWindowMessage,
  importNotesFile,
  printCurrent,
  printAll
} from './NotesWindow/WindowActions.js';
import {
  syncEditorChrome,
  applyEditorPaste,
  clearEmptyEditorMarkup,
  refreshDetectedRefs
} from './NotesWindow/EditorView.js';

const AUTOSAVE_DELAY_MS = 1000;
const NARROW_WIDTH_PX = 480;

class NotesWindowComponent extends BaseWindow {
  constructor() {
    super();

    this.state = {
      ...this.state,
      currentNoteId: null,
      currentReference: null,
      currentReferenceDisplay: null,
      currentTextId: null,
      filterMode: 'all',
      sortMode: 'modified',
      searchQuery: '',
      isDirty: false,
      sidebarVisible: true,
      searchSuggestions: [],
      selectedSuggestionIndex: -1
    };

    this.store = getSharedNotesStore();
    this._autosaveTimer = null;
    this._selfChange = false;
    this._quotaNotified = false;
  }

  async render() {
    this.innerHTML = '';
    const { header, main } = renderWindowStructure();
    this.appendChild(header);
    this.appendChild(main);
  }

  cacheRefs() {
    super.cacheRefs();

    this.refs.header = this.$('.notes-header');
    this.refs.main = this.$('.notes-main');
    this.refs.sidebarToggle = this.$('.notes-sidebar-toggle');
    this.refs.newBtn = this.$('.notes-new-btn');
    this.refs.linkBtn = this.$('.notes-link-btn');
    this.refs.downloadBtn = this.$('.notes-download-btn');
    this.refs.downloadMenu = this.$('.notes-download-menu');
    this.refs.uploadBtn = this.$('.notes-upload-btn');
    this.refs.uploadInput = this.$('.notes-upload-input');
    this.refs.printBtn = this.$('.notes-print-btn');
    this.refs.printMenu = this.$('.notes-print-menu');
    this.refs.printVersesCheckbox = this.$('.notes-print-verses-checkbox');
    this.refs.filter = this.$('.notes-filter');
    this.refs.sortSelect = this.$('.notes-sort');
    this.refs.search = this.$('.notes-search');
    this.refs.searchSuggestions = this.$('.notes-search-suggestions');
    this.refs.sidebar = this.$('.notes-sidebar');
    this.refs.list = this.$('.notes-list');
    this.refs.editorContainer = this.$('.notes-editor-container');
    this.refs.titleInput = this.$('.notes-title-input');
    this.refs.referenceBadge = this.$('.notes-reference-badge');
    this.refs.unlinkBtn = this.$('.notes-unlink-btn');
    this.refs.pinToggle = this.$('.notes-pin-toggle');
    this.refs.deleteBtn = this.$('.notes-delete-btn');
    this.refs.toolbar = this.$('.notes-richtext-toolbar');
    this.refs.editor = this.$('.notes-editor');
    this.refs.detectedRefs = this.$('.notes-detected-refs');
    this.refs.status = this.$('.notes-status');
    this.refs.modified = this.$('.notes-modified');
    this.refs.emptyState = this.$('.notes-empty-state');
  }

  attachEventListeners() {
    attachNotesListeners(this);
    this.on('message', (e) => this.handleMessage(e));
  }

  async init() {
    this.getPlainText = (id) => this.store.getPlainText(id);

    this._onStoreChange = (e) => this.handleStoreChange(e);
    this._onStoreError = (e) => this.handleStoreError(e);
    this.store.on('change', this._onStoreChange);
    this.store.on('error', this._onStoreError);

    // The corrupt-load error fires during store construction, before any
    // window can subscribe, so read the flag instead.
    if (this.store.corruptionDetected) {
      showNotice(t('windows.notes.corruptError'));
    }

    const initFilter = this.getParam('filter');
    if (initFilter) {
      this.state.filterMode = initFilter;
      this.refs.filter.value = initFilter;
    }

    const initSort = this.getParam('sort');
    if (initSort) {
      this.state.sortMode = initSort;
      this.refs.sortSelect.value = initSort;
    }

    // Settings restore round-trips as a boolean, URL params as a string
    const initSidebar = this.getParam('sidebarVisible');
    if (initSidebar === false || initSidebar === 'false') {
      this.state.sidebarVisible = false;
      this.refs.sidebar.classList.add('hidden');
    }

    this.renderNotesList();
    this.updateEditorVisibility();

    const initNoteId = this.getParam('noteId');
    if (initNoteId) {
      this.selectNote(initNoteId);
    }

    // Ask Bible windows to re-broadcast their position so linking works
    // before the user's next navigation.
    this.requestCurrentContent();
  }

  cleanup() {
    if (this._autosaveTimer) {
      clearTimeout(this._autosaveTimer);
      this._autosaveTimer = null;
      this.saveCurrentNote();
    }
    // The shared store outlives this window, so always detach.
    if (this._onStoreChange) this.store.off('change', this._onStoreChange);
    if (this._onStoreError) this.store.off('error', this._onStoreError);
    super.cleanup();
  }


  handleStoreChange() {
    applyStoreChange(this);
  }

  handleStoreError(e) {
    applyStoreError(this, e);
  }

  /** Mark store writes from this window so change events don't bounce back into the editor. */
  _withStoreWrite(fn) {
    this._selfChange = true;
    try {
      return fn();
    } finally {
      this._selfChange = false;
    }
  }


  handleMessage(e) {
    applyWindowMessage(this, e);
  }

  setCurrentReference(fragmentid) {
    this.state.currentReference = fragmentid || null;
    this.state.currentReferenceDisplay = fragmentid
      ? this.formatReferenceDisplay({ fragmentid })
      : null;

    if (this.state.filterMode === 'reference') {
      this.renderNotesList();
    }
  }

  requestCurrentContent() {
    // Historical message name: TextWindow answers exactly this shape
    // (originally added for MapWindow) by re-broadcasting a 'textload'.
    this.trigger('globalmessage', {
      type: 'globalmessage',
      target: this,
      data: { messagetype: 'maprequest', requesttype: 'currentcontent' }
    });
  }

  navigateToReference(fragmentid, sectionid) {
    if (!fragmentid) return;
    this.setCurrentReference(fragmentid);
    this.trigger('globalmessage', {
      type: 'globalmessage',
      target: this,
      data: { messagetype: 'nav', type: 'bible', locationInfo: { sectionid, fragmentid } }
    });
  }

  formatReferenceDisplay(locationInfo) {
    const fid = locationInfo?.fragmentid;
    if (!fid) return null;
    const ref = Reference(fid);
    return ref?.isValid() ? ref.toString() : fid;
  }


  getFilteredNotes() {
    return filterAndSortNotes(this.store.getAll(), {
      filterMode: this.state.filterMode,
      currentReference: this.state.currentReference,
      searchQuery: this.state.searchQuery,
      sortMode: this.state.sortMode,
      getPlainText: this.getPlainText
    });
  }

  renderNotesList() {
    const notes = this.getFilteredNotes();
    const emptyMessage = this.store.getAll().length === 0
      ? t('windows.notes.emptyListHint')
      : t('windows.notes.noNotesFound');
    this.refs.list.innerHTML = '';
    this.refs.list.appendChild(
      renderNotesList(notes, this.state.currentNoteId, this.getPlainText, emptyMessage)
    );
  }

  updateEditorVisibility() {
    if (this.state.currentNoteId) {
      this.refs.editorContainer.classList.remove('hidden');
      this.refs.emptyState.classList.add('hidden');
    } else {
      this.refs.editorContainer.classList.add('hidden');
      this.refs.emptyState.classList.remove('hidden');
    }
  }

  toggleSidebar() {
    this.state.sidebarVisible = !this.state.sidebarVisible;
    this.refs.sidebar.classList.toggle('hidden', !this.state.sidebarVisible);
    this.notifySettingsChange();
  }

  selectSuggestion(index) {
    const noteId = selectSuggestion(this.state, this.refs, index);
    if (noteId) {
      this.state.searchQuery = '';
      this.selectNote(noteId);
      this.renderNotesList();
    }
  }


  createNewNote() {
    this.saveCurrentNote();

    const note = this._withStoreWrite(() => this.store.create({}));
    this.selectNote(note.id);
    this.refs.titleInput.focus();
  }

  selectNote(noteId) {
    this.saveCurrentNote();

    const note = this.store.get(noteId);
    if (!note) return;

    this.state.currentNoteId = noteId;
    this.state.isDirty = false;

    // Sanitize on the way in: old data or other sources may predate the
    // write-side sanitization
    this.refs.titleInput.value = note.title || '';
    this.refs.editor.innerHTML = sanitizeHtml(note.content || '');
    this.normalizeEmptyEditor();

    this.updateEditorChrome(note);
    this.refs.modified.textContent = t('windows.notes.modified', { date: new Date(note.modified).toLocaleString() });
    this.refs.status.textContent = '';

    this.updateEditorVisibility();
    this.renderNotesList();
    this.updateDetectedRefs();

    // In narrow mode the sidebar overlays the editor, so close it after picking
    if (this.classList.contains('notes-narrow') && this.state.sidebarVisible) {
      this.toggleSidebar();
    }

    this.notifySettingsChange();
  }

  updateEditorChrome(note) {
    syncEditorChrome(this, note);
  }

  saveCurrentNote() {
    if (!this.state.currentNoteId || !this.state.isDirty) return;

    const title = this.refs.titleInput.value.trim() || this.getAutoTitle();
    const content = sanitizeHtml(this.refs.editor.innerHTML);

    const updated = this._withStoreWrite(() =>
      this.store.update(this.state.currentNoteId, { title, content })
    );

    this.state.isDirty = false;
    this.refs.modified.textContent = t('windows.notes.modified', { date: new Date(updated.modified).toLocaleString() });
    if (!this.store.hasPendingWrites) {
      this._quotaNotified = false;
      this.refs.status.textContent = t('windows.notes.saved');
    }

    this.updateDetectedRefs();
  }

  getAutoTitle() {
    const text = stripHtml(this.refs.editor.innerHTML);
    const firstLine = text.split('\n')[0].trim();
    return firstLine.substring(0, 50) || t('windows.notes.untitled');
  }

  async deleteCurrentNote() {
    if (!this.state.currentNoteId) return;

    const confirmed = await showConfirm(t('windows.notes.deleteConfirm'), {
      confirmLabel: t('windows.notes.delete')
    });
    if (!confirmed) return;

    const noteId = this.state.currentNoteId;

    // Cancel any pending autosave; it would re-add the deleted note
    if (this._autosaveTimer) {
      clearTimeout(this._autosaveTimer);
      this._autosaveTimer = null;
    }
    this.state.currentNoteId = null;
    this.state.isDirty = false;

    this._withStoreWrite(() => this.store.remove(noteId));

    this.updateEditorVisibility();
    this.renderNotesList();
    this.notifySettingsChange();
  }

  linkCurrentNote() {
    // Bail before creating anything when there's nowhere to link to
    if (!this.state.currentReference) {
      this.refs.status.textContent = t('windows.notes.navigateToLink');
      return;
    }

    if (!this.state.currentNoteId) {
      this.createNewNote();
    }
    const noteId = this.state.currentNoteId;
    if (!noteId) return;

    this.saveCurrentNote();
    const updated = this._withStoreWrite(() => this.store.update(noteId, {
      reference: this.state.currentReference,
      referenceDisplay: this.state.currentReferenceDisplay
    }));

    this.updateEditorChrome(updated);
    this.refs.status.textContent = t('windows.notes.linkedTo', { reference: updated.referenceDisplay || updated.reference });
  }

  unlinkCurrentNote() {
    if (!this.state.currentNoteId) return;

    const note = this.store.get(this.state.currentNoteId);
    if (!note) return;

    const updated = this._withStoreWrite(() => this.store.update(note.id, {
      reference: null,
      referenceDisplay: null
    }));

    this.updateEditorChrome(updated);
    this.refs.status.textContent = t('windows.notes.linkRemoved');
  }

  togglePinNote(noteId) {
    const note = this.store.get(noteId);
    if (!note) return;

    // Keep modified unchanged so pinning doesn't reorder the list
    const updated = this._withStoreWrite(() =>
      this.store.update(noteId, { pinned: !note.pinned, modified: note.modified })
    );

    if (noteId === this.state.currentNoteId) {
      this.updateEditorChrome(updated);
    }
  }


  importFile(file) {
    importNotesFile(this, file);
  }

  printCurrentNote(includeVerseText) {
    printCurrent(this, includeVerseText);
  }

  printAllNotes(includeVerseText) {
    printAll(this, includeVerseText);
  }


  markDirty() {
    this.state.isDirty = true;
    this.refs.status.textContent = t('windows.notes.unsavedChanges');
  }

  scheduleAutosave() {
    if (this._autosaveTimer) {
      clearTimeout(this._autosaveTimer);
    }
    this._autosaveTimer = setTimeout(() => {
      this._autosaveTimer = null;
      this.saveCurrentNote();
    }, AUTOSAVE_DELAY_MS);
  }

  execFormatCommand(command, value = null) {
    this.refs.editor.focus();
    document.execCommand(command, false, value);
    this.markDirty();
    this.scheduleAutosave();
  }

  handlePaste(e) {
    applyEditorPaste(this, e);
  }

  normalizeEmptyEditor() {
    clearEmptyEditorMarkup(this);
  }

  updateDetectedRefs() {
    refreshDetectedRefs(this);
  }


  notifySettingsChange() {
    this.trigger('settingschange', { type: 'settingschange', target: this, data: null });
  }

  size(width, height) {
    this.style.width = `${width}px`;
    this.style.height = `${height}px`;

    // The flex column layout sizes .notes-main; no height math needed here
    this.classList.toggle('notes-narrow', width > 0 && width < NARROW_WIDTH_PX);

    this.trigger('resize', {
      type: 'resize',
      target: this,
      data: { width, height }
    });
  }

  getData() {
    return {
      // Flat keys persist across reloads via AppSettings
      noteId: this.state.currentNoteId,
      filter: this.state.filterMode,
      sort: this.state.sortMode,
      sidebarVisible: this.state.sidebarVisible,
      // params (+ paramKeys) round-trip through the URL
      params: {
        win: 'notes',
        noteId: this.state.currentNoteId,
        filter: this.state.filterMode,
        sort: this.state.sortMode
      }
    };
  }
}

registerWindowComponent('notes-window', NotesWindowComponent, {
  windowType: 'notes',
  displayName: 'Notes',
  paramKeys: { noteId: 'n', filter: 'f', sort: 'o' }
});

export { NotesWindowComponent as NotesWindow };

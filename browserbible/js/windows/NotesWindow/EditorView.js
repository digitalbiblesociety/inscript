/**
 * View helpers for the editor pane: the chrome around the contentEditable
 * buffer (reference badge, pin toggle, detected references) and paste/empty
 * normalization. Every function takes the window instance.
 */

import { t } from '../../lib/i18n.js';
import { sanitizeHtml } from './sanitize.js';
import { detectReferences } from './references.js';
import { renderDetectedRefs } from './render.js';

/** Sync the reference badge, unlink button, and pin toggle to a note. */
export function syncEditorChrome(win, note) {
  if (note.reference) {
    win.refs.referenceBadge.textContent = note.referenceDisplay || note.reference;
    win.refs.referenceBadge.classList.add('visible');
    win.refs.unlinkBtn.classList.add('visible');
  } else {
    win.refs.referenceBadge.classList.remove('visible');
    win.refs.unlinkBtn.classList.remove('visible');
  }

  win.refs.pinToggle.classList.toggle('active', !!note.pinned);
  win.refs.pinToggle.title = t(note.pinned ? 'windows.notes.unpin' : 'windows.notes.pin');
  win.refs.pinToggle.setAttribute('aria-pressed', String(!!note.pinned));
}

export function applyEditorPaste(win, e) {
  e.preventDefault();
  const html = e.clipboardData?.getData('text/html');
  if (html) {
    document.execCommand('insertHTML', false, sanitizeHtml(html));
  } else {
    const text = e.clipboardData?.getData('text/plain') || '';
    if (text) document.execCommand('insertText', false, text);
  }
  win.markDirty();
  win.scheduleAutosave();
}

/**
 * contentEditable leaves a lone <br> (or an empty block) behind when all
 * text is deleted, which defeats the :empty placeholder. Clear it.
 */
export function clearEmptyEditorMarkup(win) {
  const html = win.refs.editor.innerHTML;
  const trimmed = html.trim();
  if (trimmed === '' || trimmed === '<br>' || trimmed === '<div><br></div>' || trimmed === '<p><br></p>') {
    if (html !== '') win.refs.editor.innerHTML = '';
  }
}

export function refreshDetectedRefs(win) {
  const container = win.refs.detectedRefs;
  container.innerHTML = '';

  const note = win.state.currentNoteId ? win.store.get(win.state.currentNoteId) : null;
  const refs = note ? detectReferences(win.store.getPlainText(note.id)) : [];
  const fragment = renderDetectedRefs(refs);

  if (fragment) {
    container.appendChild(fragment);
    container.classList.add('visible');
  } else {
    container.classList.remove('visible');
  }
}

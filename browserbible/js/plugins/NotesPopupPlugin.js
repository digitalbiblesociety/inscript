import { getConfig } from '../core/config.js';
import { InfoWindow } from '../ui/InfoWindow.js';
import {
  getBibleRefClickHandler,
  getBibleRefMouseoverHandler,
  getBibleRefMouseoutHandler
} from './CrossReferencePopupPlugin.js';
import { delegate, supportsHover } from './PluginEvents.js';

export const NotesPopupPlugin = () => {
  const config = getConfig();

  if (!config.enableNotesPopupPlugin) {
    return {};
  }

  const notesPopup = InfoWindow('NotesPopup');

  notesPopup.on('hide', () => {
    notesPopup.currentWord = null;
  });

  const notesPopupBody = notesPopup.body;

  // Handle clicks on bible refs within notes
  const referenceSelector = '.bibleref, .xt';
  delegate(notesPopupBody, 'click', referenceSelector, (target, event) => {
    getBibleRefClickHandler()?.call(target, event);
    notesPopup.hide();
  });

  if (supportsHover()) {
    const options = { ignoreInternal: true };
    delegate(notesPopupBody, 'mouseover', referenceSelector, (target, event) => {
      const textid = notesPopup.currentWord?.closest('.section')?.dataset.textid ?? '';
      getBibleRefMouseoverHandler()?.call(target, event, textid);
    }, options);
    delegate(notesPopupBody, 'mouseout', referenceSelector, (target, event) => {
      getBibleRefMouseoutHandler()?.call(target, event);
    }, options);
  }

  const windowsMain = document.querySelector('.windows-main');
  if (windowsMain) {
    windowsMain.addEventListener('click', (e) => {
      const key = e.target.closest('.note .key, .cf .key');
      if (key) {
        e.preventDefault();

        if (notesPopup.container.matches(':popover-open') && notesPopup.currentWord === key) {
          notesPopup.hide();
          notesPopup.currentWord = null;
          return;
        }
        notesPopup.currentWord = key;

        const parent = key.parentNode;
        const textEl = parent.querySelector('.text');
        const content = textEl?.cloneNode(true) ?? null;

        notesPopupBody.innerHTML = '';
        if (content) {
          notesPopupBody.appendChild(content);
        }

        notesPopup.show();
        notesPopup.position(key);
      }
    });
  }

  return {};
};

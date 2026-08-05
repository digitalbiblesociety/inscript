import { BOOK_DATA } from '../bible/BibleData.js';
import { getApp } from '../core/registry.js';
import { offset } from '../lib/helpers.esm.js';

export function handleResultClick(component, row) {
  const fragmentid = row.getAttribute('data-fragmentid');
  const app = getApp();
  const bibleWindows = app?.windowManager
    ? app.windowManager.getWindows().filter((windowComponent) => windowComponent.className === 'BibleWindow')
    : [];

  if (bibleWindows.length === 0) {
    app?.windowManager?.add('BibleWindow', {
      textid: component.config.newBibleWindowVersion,
      fragmentid,
      sectionid: fragmentid.split('_')[0],
    });
    return;
  }

  component.trigger('globalmessage', {
    type: 'globalmessage',
    target: component,
    data: {
      messagetype: 'nav',
      type: 'bible',
      locationInfo: {
        fragmentid,
        sectionid: fragmentid.split('_')[0],
        offset: 0
      }
    }
  });
}

export function handleVisualBarMouseover(component, bookBar) {
  if (!bookBar) return;
  const count = bookBar.getAttribute('data-count');
  const bookCode = bookBar.getAttribute('data-id');
  if (!count || !bookCode) return;
  const bookInfo = BOOK_DATA[bookCode];
  if (!bookInfo) return;

  const bookName = bookInfo.names?.[component.state.textInfo?.lang]?.[0]
    ?? bookInfo.names?.eng?.[0]
    ?? bookCode;
  const visualWidth = component.refs.topVisual.offsetWidth;
  let left = bookBar.offsetLeft;
  const label = component.refs.topVisualLabel;
  label.textContent = `${bookName}: ${count}`;
  label.style.left = `${left}px`;
  label.style.display = 'block';

  if (left + label.offsetWidth > visualWidth) {
    left = visualWidth - label.offsetWidth - 5;
    label.style.left = `${left}px`;
  }
  if (left < 5) label.style.left = '5px';
}

export function handleVisualBarClick(component, bookBar) {
  if (!bookBar) return;
  const bookCode = bookBar.getAttribute('data-id');
  const header = component.refs.resultsBlock.querySelector(`.search-result-book-header.divisionid-${bookCode}`);
  if (header) component.refs.main.scrollTop = offset(header).top - header.offsetHeight - 50;
}

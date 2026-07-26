import { elem, asButton, onActivate } from '../lib/helpers.esm.js';
import { t } from '../lib/i18n.js';

/** `height` is the body height; the window ends up taller by its header. */
export function MovableWindow(width = 300, height = 200, titleText = '', id = null) {
  const title = elem('span', { className: 'movable-header-title' }, titleText);
  const close = asButton(elem('span', { className: 'close-button' }), t('a11y.close'));
  const header = elem('div', { className: 'movable-header' }, title, close);
  const body = elem('div', { className: 'movable-body' });
  const container = elem('div', { className: 'movable-window', popover: '' }, header, body);
  if (id) container.id = id;

  document.body.appendChild(container);

  onActivate(close, hide);

  function size(w, h) {
    if (w) container.style.width = w + 'px';
    if (h) body.style.height = h + 'px';
    return ext;
  }

  function show() {
    container.showPopover();
    return ext;
  }

  function hide() {
    container.hidePopover();
    return ext;
  }

  function isVisible() {
    return container.matches(':popover-open');
  }

  function onToggle(callback) {
    container.addEventListener('toggle', callback);
    return ext;
  }

  function destroy() {
    container.remove();
  }

  const ext = {
    show,
    hide,
    isVisible,
    onToggle,
    size,
    container,
    body,
    title,
    closeButton: close,
    destroy
  };

  size(width, height);

  return ext;
}

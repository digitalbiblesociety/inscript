import { elem } from '../lib/helpers.esm.js';
import { t } from '../lib/i18n.js';

class MovableWindowController {
  constructor(width, height, titleText, id) {
    this.title = elem('span', { className: 'movable-header-title' }, titleText);
    this.closeButton = elem('button', {
      type: 'button',
      className: 'close-button plain-button',
      ariaLabel: t('a11y.close')
    });
    const header = elem('div', { className: 'movable-header' }, this.title, this.closeButton);
    this.body = elem('div', { className: 'movable-body' });
    this.container = elem('div', { className: 'movable-window', popover: '' }, header, this.body);
    if (id) this.container.id = id;

    document.body.appendChild(this.container);
    this.closeButton.addEventListener('click', () => this.hide());
    this.size(width, height);
  }

  size(width, height) {
    if (width) this.container.style.width = width + 'px';
    if (height) this.body.style.height = height + 'px';
    return this;
  }

  show() {
    this.container.showPopover();
    return this;
  }

  hide() {
    this.container.hidePopover();
    return this;
  }

  isVisible() {
    return this.container.matches(':popover-open');
  }

  onToggle(callback) {
    this.container.addEventListener('toggle', callback);
    return this;
  }

  destroy() {
    this.container.remove();
  }
}

/** `height` is the body height; the window ends up taller by its header. */
export function MovableWindow(width = 300, height = 200, titleText = '', id = null) {
  return new MovableWindowController(width, height, titleText, id);
}

import { elem } from '../lib/helpers.esm.js';
import { mixinEventEmitter } from '../common/EventEmitter.js';
import { getWindowTypeByClassName, getApp } from './registry.js';
import { getWindowIcon } from './windowIcons.js';
import { t } from '../lib/i18n.js';
import { loadManagedWindowController } from './ManagedWindowLoading.js';
import { WindowReorder } from './WindowReorder.js';
import { sizeWindows } from './WindowManagerLayout.js';

const linkedSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
const unlinkedSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M5.17 11.75l-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="16" y1="19" x2="16" y2="22"/><line x1="19" y1="16" x2="22" y2="16"/></svg>';

class Window {
  constructor(id, parentNode, className, data, manager) {
    this.id = id;
    this.className = className;
    this.manager = manager;

    const parentNodeEl = parentNode?.nodeType ? parentNode : parentNode?.[0];

    this.node = elem('div', { className: `window ${className} active` });
    const closeBtn = elem('button', { type: 'button', className: 'close-button plain-button', ariaLabel: t('a11y.closeWindow') });

    const linkBtn = (className !== 'TextComparisonWindow') ? elem('button', { type: 'button', className: 'link-button plain-button' }) : null;
    this.closeContainer = elem('div', { className: 'close-container' }, linkBtn, closeBtn);

    this.linked = data?.linked !== false;

    if (linkBtn) {
      const updateLinkButton = () => {
        linkBtn.innerHTML = this.linked ? linkedSvg : unlinkedSvg;
        linkBtn.classList.toggle('unlinked', !this.linked);
        linkBtn.setAttribute('aria-pressed', this.linked ? 'true' : 'false');
        linkBtn.setAttribute('aria-label', this.linked ? t('a11y.unlinkWindow') : t('a11y.linkWindow'));
        linkBtn.title = this.linked
          ? 'Linked: follows navigation in other windows. Click to unlink.'
          : 'Unlinked: navigates independently. Click to relink.';
      };
      updateLinkButton();

      linkBtn.addEventListener('click', () => {
        this.linked = !this.linked;
        updateLinkButton();
        manager.trigger('settingschange', { type: 'settingschange', target: this, data: null });
      });
    }
    const tabLabel = elem('span', { className: `window-tab-label ${className}-tab` });
    const iconSvg = getWindowIcon(className);
    if (iconSvg) {
      const iconSpan = elem('span', { className: 'window-tab-icon' });
      iconSpan.innerHTML = iconSvg;
      tabLabel.appendChild(iconSpan);
    }
    tabLabel.appendChild(document.createTextNode(className));
    const tabInner = elem('div', { className: 'window-tab-inner' }, tabLabel);
    this.tab = elem('div', { className: `window-tab ${className} active` }, tabInner);

    parentNodeEl.appendChild(this.node);
    this.node.appendChild(this.closeContainer);
    document.body.appendChild(this.tab);
    closeBtn.addEventListener('click', () => {
      manager.remove(this.id);
    });

    Array.from(this.node.parentNode?.children || [])
      .filter(el => el !== this.node && el.matches('.window'))
      .forEach(sibling => sibling.classList.remove('active'));
    Array.from(this.tab.parentNode?.children || [])
      .filter(el => el !== this.tab && el.matches('.window-tab'))
      .forEach(sibling => sibling.classList.remove('active'));

    // The shell is built synchronously; a lazy controller attaches later.
    // Messages arriving before then are buffered and replayed on attach.
    this.initData = data || {};
    this._pendingMessages = [];
    this._closed = false;

    this.ready = loadManagedWindowController(this, className, data);

    this.node.addEventListener('mouseenter', this._handleFocus.bind(this));
    this.node.addEventListener('touchstart', this._handleFocus.bind(this));
    // mouseenter only fires on a real pointer boundary crossing, so after the
    // browser app loses and regains focus (hover state resets, pointer hasn't
    // moved) no window has focus and scroll sync stalls. Wheel and pointerdown
    // both imply the pointer is inside this window, so use them to re-focus.
    this.node.addEventListener('wheel', this._handleFocus.bind(this), { passive: true });
    this.node.addEventListener('pointerdown', this._handleFocus.bind(this));
    this.node.addEventListener('mouseleave', this._handleBlur.bind(this));
    this.node.addEventListener('windowblur', this._handleBlur.bind(this));

    this.tab.addEventListener('click', () => {
      document.querySelectorAll('.window, .window-tab').forEach(el => {
        el.classList.remove('active');
      });
      this.tab.classList.add('active');
      this.node.classList.add('active');
    });

    mixinEventEmitter(this);

    this.on('message', e => {
      if (this._pendingMessages) {
        this._pendingMessages.push(e);
      } else {
        this.controller?.trigger?.('message', e);
      }

      if (e.data?.labelTab) {
        const tabSpan = this.tab.querySelector('span');
        if (tabSpan) {
          tabSpan.innerHTML = e.data.labelTab;
        }
      }
    });

    this.on('settingschange', e => manager.trigger('settingschange', e));

    this.on('globalmessage', e => {
      const app = getApp();
      app?.handleGlobalMessage?.(e);
    });
  }

  _handleFocus() {
    if (this.node.classList.contains('focused')) return;
    this.controller?.trigger?.('focus', {});
    this.node.classList.add('focused');
    Array.from(this.node.parentNode?.children || [])
      .filter(el => el !== this.node)
      .forEach(sibling => {
        sibling.classList.remove('focused');
        const blurEvent = new CustomEvent('windowblur');
        sibling.dispatchEvent(blurEvent);
      });
  }

  _handleBlur() {
    this.node.classList.remove('focused');
    this.controller?.trigger?.('blur', {});
  }

  size(width, height) {
    this.node.style.width = `${width}px`;
    this.node.style.height = `${height}px`;

    this.controller?.size?.(width, height);
  }

  quit() {
    this.controller?.quit?.();
  }

  getData() {
    // initData fallback keeps the settings save from persisting {} mid-load.
    const data = this.controller?.getData() ?? this.initData ?? {};
    if (!this.linked) data.linked = false;
    return data;
  }

  close() {
    this._closed = true;
    this.controller?.close?.();
    this.controller = null;

    this.clearListeners();

    this.tab.parentNode?.removeChild(this.tab);
    this.node.parentNode?.removeChild(this.node);
  }
}

export class WindowManager {
  constructor(node, app) {
    this.nodeEl = node?.nodeType ? node : node?.[0];
    this.app = app;
    this.windows = [];
    this.splitters = [];
    this.windowWidths = []; // proportional widths (0-1)

    mixinEventEmitter(this);

    this._bindReorderEvents();
  }

  add(className, data) {
    const id = `win${Date.now()}`;

    if (className === 'TextWindow') {
      className = 'BibleWindow';
    }

    const windowType = getWindowTypeByClassName(className);
    if (!windowType) {
      console.error(`Window type "${className}" not registered`);
      return null;
    }

    const win = new Window(id, this.nodeEl, className, data, this);
    this.windows.push(win);

    this._resetWindowWidths();
    this._applyWindowOrder();
    this._rebuildSplitters();

    setTimeout(() => this.app?.resize?.(), 10);

    return win;
  }

  remove(id) {
    const windowToClose = this.windows.find(win => win.id === id);

    if (!windowToClose) {
      console.warn("Can't find window", id);
      return;
    }

    this.windows = this.windows.filter(win => win.id !== id);

    windowToClose.close();

    if (this.windows.length > 0) {
      this.windows[0].tab.classList.add('active');
      this.windows[0].node.classList.add('active');
    }

    this._resetWindowWidths();
    this._applyWindowOrder();
    this._rebuildSplitters();

    setTimeout(() => this.app?.resize?.(), 10);

    this.trigger('settingschange', { type: 'settingschange', target: this, data: null });
  }

  /** Measures the container when width and height are omitted. */
  size(width, height) {
    sizeWindows(this, width, height);
  }

  getSettings() {
    return this.windows.map(win => ({
      windowType: win.className,
      data: win.getData()
    }));
  }

  getWindows() {
    return this.windows;
  }

  /**
   * Bring a window to the front, same as clicking its tab. Matters in
   * compact-ui where `.window.active` controls which window is visible.
   */
  activate(id) {
    const win = this.windows.find(w => w.id === id);
    if (!win) return;

    document.querySelectorAll('.window, .window-tab').forEach(el => {
      el.classList.remove('active');
    });
    win.tab.classList.add('active');
    win.node.classList.add('active');
  }

  /**
   * Keep visual order in sync with the windows array via flex `order`.
   * Window nodes are never moved in the DOM: re-inserting a node disconnects
   * its web component, and disconnectedCallback() tears down all of its
   * listeners with no re-init path.
   */
  _applyWindowOrder() {
    this.windows.forEach((win, i) => {
      win.node.style.order = i;
    });
  }

  _moveWindow(fromIndex, toIndex) {
    const [win] = this.windows.splice(fromIndex, 1);
    this.windows.splice(toIndex, 0, win);

    // Widths travel with their window so a resized window keeps its size
    const [width] = this.windowWidths.splice(fromIndex, 1);
    this.windowWidths.splice(toIndex, 0, width);

    this._applyWindowOrder();
    this.size();
  }

  /**
   * Drag a window header left/right to reorder windows. Delegated from the
   * container so it works for every window type's header, including content
   * rendered after the window is created.
   */
  _bindReorderEvents() {
    this.reorderController = new WindowReorder(this);
  }

  _resetWindowWidths() {
    const count = this.windows.length;
    if (count === 0) {
      this.windowWidths = [];
    } else {
      const equalWidth = 1 / count;
      this.windowWidths = this.windows.map(() => equalWidth);
    }
  }

  _rebuildSplitters() {
    this.splitters.forEach(splitter => {
      splitter.removeEventListener('mousedown', splitter._mousedownHandler);
      splitter.removeEventListener('touchstart', splitter._touchstartHandler);
      splitter.parentNode?.removeChild(splitter);
    });
    this.splitters = [];

    for (let i = 0; i < this.windows.length - 1; i++) {
      const splitter = elem('div', { className: 'window-splitter' });
      this.nodeEl.appendChild(splitter);
      this.splitters.push(splitter);

      this._bindSplitterEvents(splitter, i);
    }
  }

  _bindSplitterEvents(splitter, index) {
    let startX = 0;
    let startWidths = [];

    const onMouseMove = (e) => {
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const deltaX = clientX - startX;
      const containerWidth = this.nodeEl.offsetWidth;
      const deltaProportion = deltaX / containerWidth;

      const newLeftWidth = startWidths[index] + deltaProportion;
      const newRightWidth = startWidths[index + 1] - deltaProportion;

      const minWidth = 0.1; // 10% minimum
      if (newLeftWidth >= minWidth && newRightWidth >= minWidth) {
        this.windowWidths[index] = newLeftWidth;
        this.windowWidths[index + 1] = newRightWidth;
        this.size();
      }
    };

    const onMouseUp = () => {
      splitter.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onMouseMove);
      document.removeEventListener('touchend', onMouseUp);

      this.trigger('settingschange', { type: 'settingschange', target: this, data: null });
    };

    const onMouseDown = (e) => {
      e.preventDefault();
      startX = e.touches ? e.touches[0].clientX : e.clientX;
      startWidths = [...this.windowWidths];

      splitter.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('touchmove', onMouseMove, { passive: false });
      document.addEventListener('touchend', onMouseUp);
    };

    splitter._mousedownHandler = onMouseDown;
    splitter._touchstartHandler = onMouseDown;

    splitter.addEventListener('mousedown', onMouseDown);
    splitter.addEventListener('touchstart', onMouseDown, { passive: false });
  }
}

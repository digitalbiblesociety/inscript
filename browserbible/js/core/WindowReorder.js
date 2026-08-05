import { forceReflow } from '../lib/helpers.esm.js';

const INTERACTIVE_SELECTOR = 'input, textarea, select, button, a, [contenteditable], .app-list, .header-icon, .map-search-suggestions';
const DRAG_THRESHOLD = 5;
const SLIDE_MS = 180;
const SNAP_MS = 320;

const translateX = (node) => parseFloat(getComputedStyle(node).translate) || 0;

export class WindowReorder {
  constructor(manager) {
    this.manager = manager;
    this.window = null;
    this.startX = 0;
    this.dragging = false;
    this.moved = false;
    this.slots = null;
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onDown = this.onDown.bind(this);
    manager.nodeEl.addEventListener('mousedown', this.onDown);
    manager.nodeEl.addEventListener('touchstart', this.onDown, { passive: true });
  }

  measureSlots() {
    this.slots = new Map();
    for (const windowComponent of this.manager.windows) {
      const rectangle = windowComponent.node.getBoundingClientRect();
      const left = rectangle.left - translateX(windowComponent.node);
      this.slots.set(windowComponent.node, {
        left, mid: left + rectangle.width / 2, width: rectangle.width
      });
    }
  }

  slideHome(node, slideOffset) {
    node.classList.remove('window-slide', 'window-snap');
    node.style.translate = `${slideOffset}px 0`;
    forceReflow(node);
    node.classList.add('window-slide');
    node.style.translate = '';
    clearTimeout(node._slideTimer);
    node._slideTimer = setTimeout(() => node.classList.remove('window-slide'), SLIDE_MS + 70);
  }

  snapHome(node) {
    node.classList.remove('window-slide');
    node.classList.add('window-snap');
    node.style.translate = '';
    clearTimeout(node._slideTimer);
    node._slideTimer = setTimeout(() => node.classList.remove('window-snap'), SNAP_MS + 70);
  }

  swapWith(neighbor, fromIndex, toIndex, clientX) {
    const neighborLeft = this.slots.get(neighbor.node).left;
    const draggedLeft = this.slots.get(this.window.node).left;
    this.manager._moveWindow(fromIndex, toIndex);
    this.measureSlots();
    this.startX += this.slots.get(this.window.node).left - draggedLeft;
    this.window.node.style.translate = `${clientX - this.startX}px 0`;
    this.slideHome(neighbor.node, neighborLeft - this.slots.get(neighbor.node).left);
    this.moved = true;
  }

  beginDrag() {
    this.dragging = true;
    const inFlight = translateX(this.window.node);
    if (inFlight) {
      this.window.node.style.translate = `${inFlight}px 0`;
      this.startX -= inFlight;
    }
    this.window.node.classList.remove('window-slide', 'window-snap');
    clearTimeout(this.window.node._slideTimer);
    this.window.node.classList.add('reordering');
    document.body.classList.add('window-reordering');
    this.measureSlots();
  }

  onMove(event) {
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    if (!this.dragging) {
      if (Math.abs(clientX - this.startX) < DRAG_THRESHOLD) return;
      this.beginDrag();
    }
    event.preventDefault();
    const delta = clientX - this.startX;
    this.window.node.style.translate = `${delta}px 0`;
    const index = this.manager.windows.indexOf(this.window);
    const next = this.manager.windows[index + 1];
    const previous = this.manager.windows[index - 1];
    const slot = this.slots.get(this.window.node);
    const left = slot.left + delta;
    const right = left + slot.width;
    if (next && right > this.slots.get(next.node).mid) {
      this.swapWith(next, index, index + 1, clientX);
    } else if (previous && left < this.slots.get(previous.node).mid) {
      this.swapWith(previous, index, index - 1, clientX);
    }
  }

  onUp() {
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('mouseup', this.onUp);
    document.removeEventListener('touchmove', this.onMove);
    document.removeEventListener('touchend', this.onUp);
    document.removeEventListener('touchcancel', this.onUp);
    if (this.dragging) {
      this.window.node.classList.remove('reordering');
      this.snapHome(this.window.node);
      document.body.classList.remove('window-reordering');
      if (this.moved) {
        this.manager.trigger('settingschange', {
          type: 'settingschange', target: this.manager, data: null
        });
      }
    }
    this.window = null;
    this.dragging = false;
    this.moved = false;
    this.slots = null;
  }

  canStart(event) {
    if (this.window || this.manager.windows.length < 2) return false;
    if (!event.touches && event.button !== 0) return false;
    if (document.body.classList.contains('compact-ui')) return false;
    return !event.target.closest(INTERACTIVE_SELECTOR);
  }

  onDown(event) {
    if (!this.canStart(event)) return;
    const windowNode = event.target.closest('.window-header')?.closest('.window');
    const windowComponent = this.manager.windows.find((item) => item.node === windowNode) || null;
    if (!windowComponent) return;
    this.window = windowComponent;
    if (!event.touches) {
      event.preventDefault();
      if (document.activeElement !== document.body) document.activeElement?.blur?.();
    }
    this.startX = event.touches ? event.touches[0].clientX : event.clientX;
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mouseup', this.onUp);
    document.addEventListener('touchmove', this.onMove, { passive: false });
    document.addEventListener('touchend', this.onUp);
    document.addEventListener('touchcancel', this.onUp);
  }
}

import { forceReflow } from '../../lib/helpers.esm.js';

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export class GuidedTourPosition {
  constructor(controller) {
    this.controller = controller;
    this.repositionQueued = false;
    this.onPopoverToggle = this.onPopoverToggle.bind(this);
    this.queue = this.queue.bind(this);
    this.reset();
    document.addEventListener('toggle', this.onPopoverToggle, true);
  }

  reset() {
    this.firstPlacement = true;
    this.lastPlacement = null;
    this.lastRing = null;
    this.rerendered = false;
    this.popoverOpenedSinceRaise = false;
  }

  show() {
    if (!this.controller.refs.layer.matches(':popover-open')) this.controller.refs.layer.showPopover();
  }

  hide() {
    if (this.controller.refs.layer.matches(':popover-open')) this.controller.refs.layer.hidePopover();
  }

  onPopoverToggle(event) {
    const element = event.target;
    if (!this.controller.active || event.newState !== 'open') return;
    if (!(element instanceof HTMLElement) || !element.hasAttribute('popover')) return;
    if (element === this.controller.refs.layer || element.id === 'demo-cursor') return;
    this.popoverOpenedSinceRaise = true;
  }

  raise() {
    if (!this.popoverOpenedSinceRaise) return;
    this.popoverOpenedSinceRaise = false;
    this.hide();
    this.show();
    this.rerendered = true;
  }

  resolveTarget(step) {
    if (!step?.target) return null;
    try {
      const found = typeof step.target === 'function'
        ? step.target()
        : document.querySelector(step.target);
      if (!found?.isConnected) return null;
      const box = found.getBoundingClientRect();
      return box.width > 0 && box.height > 0 ? found : null;
    } catch {
      return null;
    }
  }

  positionCentered(viewportWidth, viewportHeight) {
    const { layer, ring, card, arrow } = this.controller.refs;
    layer.classList.add('tour-centered');
    this.lastRing = `left:${viewportWidth / 2}px;top:${viewportHeight / 2}px;width:0;height:0`;
    ring.style.cssText = this.lastRing;
    this.lastPlacement = { centered: true };
    this.rerendered = false;
    card.style.left = '';
    card.style.top = '';
    arrow.style.cssText = '';
  }

  pickSide(placement, fits, room) {
    const preferred = placement && placement !== 'auto' ? placement : null;
    if (preferred && fits[preferred]) return preferred;
    return ['bottom', 'top', 'right', 'left'].find((side) => fits[side])
      ?? Object.entries(room).sort((a, b) => b[1] - a[1])[0][0];
  }

  cardPosition({ side, hole, cardWidth, cardHeight, viewportWidth, viewportHeight, margin }) {
    let left;
    let top;
    if (side === 'bottom' || side === 'top') {
      left = clamp(hole.left + hole.width / 2 - cardWidth / 2,
        margin, viewportWidth - cardWidth - margin);
      top = side === 'bottom' ? hole.bottom + margin : hole.top - cardHeight - margin;
    } else {
      left = side === 'right' ? hole.right + margin : hole.left - cardWidth - margin;
      top = clamp(hole.top + hole.height / 2 - cardHeight / 2,
        margin, viewportHeight - cardHeight - margin);
    }
    top = clamp(top, margin, Math.max(margin, viewportHeight - cardHeight - margin));
    left = clamp(left, margin, Math.max(margin, viewportWidth - cardWidth - margin));
    return { left: Math.round(left), top: Math.round(top) };
  }

  restorePreviousPlacement() {
    if (!this.rerendered || !this.lastRing) return;
    const { layer, ring, card } = this.controller.refs;
    layer.classList.add('tour-placing');
    ring.style.cssText = this.lastRing;
    if (this.lastPlacement && !this.lastPlacement.centered) {
      card.style.left = `${this.lastPlacement.left}px`;
      card.style.top = `${this.lastPlacement.top}px`;
    }
    forceReflow(layer);
    layer.classList.remove('tour-placing');
  }

  position() {
    const step = this.controller.steps[this.controller.index];
    if (!step) return;
    const target = this.resolveTarget(step);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    if (!target || step.placement === 'center') {
      this.positionCentered(viewportWidth, viewportHeight);
      return;
    }
    this.positionBesideTarget({ step, target, viewportWidth, viewportHeight, margin });
  }

  positionBesideTarget({ step, target, viewportWidth, viewportHeight, margin }) {
    const { layer, ring, card, arrow } = this.controller.refs;
    layer.classList.remove('tour-centered');
    const pad = step.pad ?? 8;
    const box = target.getBoundingClientRect();
    const hole = {
      left: Math.max(0, box.left - pad), top: Math.max(0, box.top - pad),
      right: Math.min(viewportWidth, box.right + pad),
      bottom: Math.min(viewportHeight, box.bottom + pad)
    };
    hole.width = Math.max(0, hole.right - hole.left);
    hole.height = Math.max(0, hole.bottom - hole.top);
    const nextRing = `left:${hole.left}px;top:${hole.top}px;width:${hole.width}px;height:${hole.height}px`;
    const cardBox = card.getBoundingClientRect();
    const cardWidth = cardBox.width || 340;
    const cardHeight = cardBox.height || 200;
    const room = {
      bottom: viewportHeight - hole.bottom - margin, top: hole.top - margin,
      right: viewportWidth - hole.right - margin, left: hole.left - margin
    };
    const fits = {
      bottom: room.bottom >= cardHeight, top: room.top >= cardHeight,
      right: room.right >= cardWidth, left: room.left >= cardWidth
    };
    const side = this.pickSide(step.placement, fits, room);
    const point = this.cardPosition({
      side, hole, cardWidth, cardHeight, viewportWidth, viewportHeight, margin
    });
    this.restorePreviousPlacement();
    this.rerendered = false;
    ring.style.cssText = nextRing;
    this.lastRing = nextRing;
    card.style.left = `${point.left}px`;
    card.style.top = `${point.top}px`;
    this.lastPlacement = { centered: false, ...point };
    const opposite = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' };
    arrow.dataset.side = opposite[side];
    arrow.style.cssText = side === 'bottom' || side === 'top'
      ? `left:${clamp(hole.left + hole.width / 2 - point.left, 18, cardWidth - 18)}px`
      : `top:${clamp(hole.top + hole.height / 2 - point.top, 18, cardHeight - 18)}px`;
  }

  placeForRender() {
    if (this.firstPlacement) {
      this.controller.refs.layer.classList.add('tour-placing');
      this.position();
      forceReflow(this.controller.refs.layer);
      this.controller.refs.layer.classList.remove('tour-placing');
      this.firstPlacement = false;
    } else {
      this.position();
    }
  }

  queue() {
    if (!this.controller.active || this.repositionQueued) return;
    this.repositionQueued = true;
    requestAnimationFrame(() => {
      this.repositionQueued = false;
      this.position();
    });
  }
}

import { elem, forceReflow } from '../../lib/helpers.esm.js';
import AppSettings from '../../common/AppSettings.js';
import { getConfig } from '../../core/config.js';
import { t } from '../../lib/i18n.js';
import { GuidedTourContext } from './GuidedTourContext.js';
import { GuidedTourPosition } from './GuidedTourPosition.js';
import {
  enterStep, goToStep, leaveStep, playStep, showStep, startTour, stopTour,
  tourState
} from './GuidedTourTransitions.js';

const SETTINGS_KEY = 'guided-tour';

export class GuidedTourController {
  constructor(steps, helpers, menuButton) {
    this.allSteps = steps;
    this.helpers = helpers;
    this.menuButton = menuButton;
    this.config = getConfig();
    this.steps = [];
    this.index = -1;
    this.active = false;
    this.transition = 0;
    this.entering = null;
    this.buildUi();
    this.positioner = new GuidedTourPosition(this);
    this.context = new GuidedTourContext(this, helpers);
    this.attachEvents();
    this.initializeAutostart();
  }

  buildUi() {
    const menuButton = this.menuButton;
    const ring = elem('div', { className: 'tour-ring' });
    const arrow = elem('div', { className: 'tour-card-arrow' });
    const counter = elem('span', { className: 'tour-count' });
    const closeButton = elem('button', {
      type: 'button', className: 'tour-close plain-button', innerHTML: '&times;',
      ariaLabel: t('tour.buttons.exit')
    });
    const title = elem('h2', { className: 'tour-title', id: 'tour-title' });
    const body = elem('div', { className: 'tour-body' });
    const progressFill = elem('div', { className: 'tour-progress-fill' });
    const skipButton = elem('button', { type: 'button', className: 'tour-button tour-skip' });
    const backButton = elem('button', { type: 'button', className: 'tour-button tour-back' });
    const nextButton = elem('button', { type: 'button', className: 'tour-button tour-next' });
    const card = elem('div', { className: 'tour-card' }, arrow,
      elem('div', { className: 'tour-card-head' }, counter, closeButton),
      title, body, elem('div', { className: 'tour-progress' }, progressFill),
      elem('div', { className: 'tour-card-foot' }, skipButton,
        elem('span', { className: 'tour-card-foot-end' }, backButton, nextButton)));
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-labelledby', 'tour-title');
    card.setAttribute('aria-live', 'polite');
    const layer = elem('div', { className: 'tour-layer', popover: 'manual' }, ring, card);
    document.body.appendChild(layer);
    this.refs = {
      menuButton, ring, arrow, counter, closeButton, title, body, progressFill,
      skipButton, backButton, nextButton, card, layer
    };
  }

  render() {
    const step = this.steps[this.index];
    if (!step) return;
    const total = this.steps.length;
    this.refs.counter.textContent = t('tour.progress', { current: this.index + 1, total });
    this.refs.title.innerHTML = t(`tour.steps.${step.id}.title`);
    this.refs.body.innerHTML = t(`tour.steps.${step.id}.body`);
    this.refs.progressFill.style.width = `${((this.index + 1) / total) * 100}%`;
    this.refs.skipButton.textContent = t('tour.buttons.skip');
    this.refs.backButton.textContent = t('tour.buttons.back');
    this.refs.nextButton.textContent = this.index === total - 1
      ? t('tour.buttons.done') : t('tour.buttons.next');
    this.refs.backButton.disabled = this.index === 0;
    this.refs.skipButton.style.visibility = this.index === total - 1 ? 'hidden' : '';
    this.refs.layer.dataset.step = step.id;
    this.positioner.placeForRender();
    this.refs.card.classList.remove('tour-step-in');
    forceReflow(this.refs.card);
    this.refs.card.classList.add('tour-step-in');
    if (step.focus !== false) this.refs.nextButton.focus({ preventScroll: true });
  }

  getState(done = false) {
    return tourState(this, done);
  }

  leave(step) {
    return leaveStep(this, step);
  }

  play(step, token) {
    return playStep(this, step, token);
  }

  enterStep(step, token) {
    return enterStep(this, step, token);
  }

  showStep(step, token) {
    return showStep(this, step, token);
  }

  goTo(target, direction = 1) {
    return goToStep(this, target, direction);
  }

  start(options) {
    return startTour(this, options);
  }

  stop() {
    return stopTour(this);
  }

  next() {
    return this.goTo(this.index + 1, 1);
  }

  prev() {
    return this.goTo(this.index - 1, -1);
  }

  handleKeydown(event) {
    if (!this.active) return;
    if (event.key === 'Escape') {
      const appUiOpen = document.querySelector('[popover]:popover-open:not(.tour-layer)')
        || document.querySelector('.command-palette-backdrop.open');
      if (!appUiOpen) {
        event.preventDefault();
        this.stop();
      }
      return;
    }
    const arrow = ['ArrowRight', 'ArrowLeft'].includes(event.key);
    const field = event.target instanceof HTMLElement
      && event.target.matches('input, textarea, select, [contenteditable]') ? event.target : null;
    if (field && !this.acceptFieldArrow(event, field, arrow)) return;
    if (!arrow) return;
    event.preventDefault();
    if (field) event.stopPropagation();
    if (event.key === 'ArrowRight') this.next();
    else this.prev();
  }

  acceptFieldArrow(event, field, arrow) {
    if (field !== this.helpers.getTourField()) return false;
    const modified = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;
    if (!arrow || modified) {
      this.helpers.setTourField(null);
      return false;
    }
    return true;
  }

  attachEvents() {
    this.refs.closeButton.addEventListener('click', () => this.stop());
    this.refs.skipButton.addEventListener('click', () => this.stop());
    this.refs.backButton.addEventListener('click', () => this.prev());
    this.refs.nextButton.addEventListener('click', () => this.next());
    window.addEventListener('resize', this.positioner.queue);
    window.addEventListener('scroll', this.positioner.queue, true);
    document.addEventListener('keydown', (event) => this.handleKeydown(event), true);
    document.addEventListener('pointerdown', () => this.helpers.setTourField(null), true);
    // GuidedTour.js binds the menu button's activation; doing it here too would
    // start the tour twice.
  }

  initializeAutostart() {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('tour');
    const seen = AppSettings.getValue(SETTINGS_KEY, { seen: false }).seen === true;
    const shouldStart = requested === '1'
      || (requested !== '0' && !seen && this.config.enableGuidedTourAutostart === true);
    if (!shouldStart) return;
    const explicit = requested === '1';
    this.autostart(explicit);
  }

  async autostart(explicit) {
    const loaded = await this.helpers.waitFor(
      () => document.querySelector('.window.BibleWindow .section .verse, .window.BibleWindow .section .v'),
      { timeout: 20000 }
    );
    if (!loaded) {
      if (explicit) console.warn('[tour] no text loaded in time, tour not started');
      return;
    }
    if (!explicit && document.body.classList.contains('compact-ui')) return;
    await this.helpers.sleep(600);
    this.start();
  }

  getApi() {
    return {
      start: (options) => this.start(options),
      stop: () => this.stop(),
      next: () => this.next(),
      prev: () => this.prev(),
      goTo: (index) => this.goTo(index, 1),
      isActive: () => this.active,
      getState: () => this.getState(),
      getSteps: () => (this.active
        ? this.steps
        : this.allSteps.filter((step) => step.available?.() !== false))
        .map((step) => ({ id: step.id, title: t(`tour.steps.${step.id}.title`) })),
      element: this.refs.layer
    };
  }
}

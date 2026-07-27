import { elem, asButton, onActivate } from '../lib/helpers.esm.js';
import { getConfig } from '../core/config.js';
import { getApp } from '../core/registry.js';
import { getWindowIcon } from '../core/windowIcons.js';
import { PlaceKeeper } from '../common/PlaceKeeper.js';
import AppSettings from '../common/AppSettings.js';
import { t } from '../lib/i18n.js';

const SETTINGS_KEY = 'guided-tour';

let tourInstance = null;

const $ = (selector, root = document) => root.querySelector(selector);

const sleep = (ms) => new Promise(resolve => { setTimeout(resolve, ms); });

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

async function waitFor(selectorOrFn, { timeout = 8000, interval = 60 } = {}) {
  const probe = typeof selectorOrFn === 'function' ? selectorOrFn : () => $(selectorOrFn);
  const deadline = Date.now() + timeout;

  for (;;) {
    const found = probe();
    if (found) return found;
    if (Date.now() > deadline) return null;
    await sleep(interval);
  }
}

const isDisabledWindow = (className) =>
  (getConfig().disabledWindowTypes ?? []).includes(className);

async function waitForPanel(className, { extra = null, timeout = 12000 } = {}) {
  const selector = `.window.${className}`;
  if (!await waitFor(selector, { timeout: 4000 })) return;

  await waitFor(() => !$(`${selector} .loading-indicator`), { timeout });
  if (extra) await waitFor(() => $(`${selector} ${extra}`), { timeout: 6000 });
  await sleep(140);
}

const bibleWindows = () => Array.from(document.querySelectorAll('.window.BibleWindow'));

const inBible = (selector, index = 0) => () => {
  const win = bibleWindows()[index] ?? null;
  if (!win || !selector) return win;
  return $(selector, win);
};

function click(el) {
  if (!el) return;
  const win = el.closest?.('.window');
  if (win && !win.classList.contains('focused')) {
    win.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  }
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

async function typeInto(el, text, delay = 40) {
  if (!el) return;
  el.focus();
  el.value = '';
  for (const char of text) {
    el.value += char;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(delay);
  }
}

function pressKey(el, key, extra = {}) {
  el?.dispatchEvent(new KeyboardEvent('keydown', {
    key, bubbles: true, cancelable: true, ...extra
  }));
}

async function dragBy(el, totalDx, { steps = 14, stepDelay = 16 } = {}) {
  if (!el) return;
  const box = el.getBoundingClientRect();
  const startX = box.left + box.width / 2;
  const y = box.top + box.height / 2;

  el.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, clientX: startX, clientY: y, button: 0
  }));

  for (let i = 1; i <= steps; i++) {
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, cancelable: true, clientX: startX + (totalDx * i) / steps, clientY: y
    }));
    await sleep(stepDelay);
  }

  document.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, cancelable: true, clientX: startX + totalDx, clientY: y
  }));
}

function closeAppPopovers() {
  document.querySelectorAll('[popover]:popover-open').forEach(el => {
    if (el.classList.contains('tour-layer')) return;
    try {
      el.hidePopover();
    } catch {
      void 0;
    }
  });
}

const TOUR_STEPS = [
  {
    id: 'welcome',
    placement: 'center',
    async enter() {
      closeAppPopovers();
    }
  },
  {
    id: 'topbar',
    target: '.main-menu-container',
    placement: 'bottom',
    pad: 4
  },
  {
    id: 'mainmenu',
    target: '#main-menu-dropdown',
    placement: 'right',
    async enter({ $ }) {
      click($('#main-menu-button'));
      await waitFor(() => $('#main-menu-dropdown')?.matches(':popover-open'));
      await sleep(140);
    },
    async exit() {
      closeAppPopovers();
    }
  },
  {
    id: 'addwindow',
    target: '#main-menu-windows-list',
    placement: 'right',
    async enter({ $ }) {
      if (!$('#main-menu-dropdown')?.matches(':popover-open')) {
        click($('#main-menu-button'));
        await waitFor(() => $('#main-menu-dropdown')?.matches(':popover-open'));
      }
      await sleep(120);
    },
    async exit() {
      closeAppPopovers();
    }
  },
  {
    id: 'reference',
    target: inBible('.text-nav'),
    placement: 'bottom',
    async enter() {
      closeAppPopovers();
      await sleep(90);
    }
  },
  {
    id: 'navigator',
    target: '.text-navigator',
    placement: 'right',
    async enter() {
      const nav = inBible('.text-nav')();
      if (!$('.text-navigator')?.matches(':popover-open')) click(nav);
      await waitFor(() => $('.text-navigator')?.matches(':popover-open'));
      await sleep(160);
    }
  },
  {
    id: 'navigate',
    target: inBible('.scroller-text-wrapper'),
    placement: 'top',
    async enter({ $ }) {
      if (!$('.text-navigator')?.matches(':popover-open')) {
        click(inBible('.text-nav')());
        await waitFor(() => $('.text-navigator')?.matches(':popover-open'));
      }
      click(await waitFor('.text-navigator .text-navigator-division.divisionid-GN'));
      const chapter = await waitFor('.text-navigator .text-navigator-section.section-GN1');
      await sleep(220);
      click(chapter);
      await waitFor(() => bibleWindows().every(win =>
        Array.from(win.querySelectorAll('.section')).some(s => s.getAttribute('data-id') === 'GN1')
      ), { timeout: 15000 });
      await waitForPanel('BibleWindow');
    }
  },
  {
    id: 'versions',
    target: inBible('.version-cycler'),
    placement: 'bottom',
    async enter() {
      closeAppPopovers();
      await sleep(90);
    }
  },
  {
    id: 'textchooser',
    target: '.text-chooser',
    placement: 'right',
    async enter({ $ }) {
      if (!$('.text-chooser')?.matches(':popover-open')) click(inBible('.text-list')());
      await waitFor(() => $('.text-chooser')?.matches(':popover-open'));
      await sleep(200);
      await typeInto($('.text-chooser .text-chooser-filter-text'), 'spanish', 34);
      await sleep(260);
    },
    async exit() {
      closeAppPopovers();
    }
  },
  {
    id: 'versioninfo',
    target: inBible('.scroller-info'),
    placement: 'left',
    async enter() {
      closeAppPopovers();
      click(inBible('.info-button')());
      await waitFor(() => inBible('.scroller-info')()?.matches(':popover-open'));
      await sleep(240);
    },
    async exit() {
      closeAppPopovers();
    }
  },
  {
    id: 'linked',
    target: inBible('.link-button'),
    placement: 'left',
    pad: 6,
    available: () => bibleWindows().length > 1
  },
  {
    id: 'layout',
    target: '.window-splitter',
    placement: 'right',
    pad: 3,
    available: () => $('.window-splitter') !== null,
    async enter({ $ }) {
      const splitter = $('.window-splitter');
      await sleep(120);
      await dragBy(splitter, 110);
      await sleep(240);
      await dragBy($('.window-splitter'), -110);
      await sleep(120);
    }
  },
  {
    id: 'search',
    target: '#main-search-box',
    placement: 'bottom',
    focus: false,
    async enter({ $ }) {
      closeAppPopovers();
      await typeInto($('#main-search-input'), 'shepherd', 34);
      await sleep(260);
    },
    async exit({ $ }) {
      const input = $('#main-search-input');
      if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  },
  {
    id: 'searchresults',
    target: '.window.SearchWindow',
    placement: 'left',
    available: () => !isDisabledWindow('SearchWindow'),
    async enter({ $, addWindow }) {
      closeAppPopovers();
      const anchor = getApp()?.windowManager?.getWindows()
        .find(w => w.className === 'BibleWindow') ?? null;
      const textid = anchor?.getData()?.textid ?? getConfig().newBibleWindowVersion;

      await addWindow('SearchWindow', {
        textid,
        searchtext: 'shepherd',
        divisions: 'MT,MK,LK,JN'
      });
      await waitFor(() => {
        const rows = document.querySelectorAll('.window.SearchWindow .search-result-row').length;
        const running = $('.window.SearchWindow .search-progress-bar')?.style.display === 'block';
        return rows >= 8 || (rows > 0 && !running);
      }, { timeout: 30000 });
      await sleep(320);
    }
  },
  {
    id: 'commentary',
    target: '.window.CommentaryWindow',
    placement: 'left',
    available: () => !isDisabledWindow('CommentaryWindow'),
    async enter({ addWindow }) {
      closeAppPopovers();
      await addWindow('CommentaryWindow');
      await waitForPanel('CommentaryWindow');
    }
  },
  {
    id: 'comparison',
    target: '.window.TextComparisonWindow',
    placement: 'left',
    available: () => !isDisabledWindow('TextComparisonWindow'),
    async enter({ addWindow }) {
      await addWindow('TextComparisonWindow');
      await waitForPanel('TextComparisonWindow');
    }
  },
  {
    id: 'parallels',
    target: '.window.ParallelsWindow',
    placement: 'left',
    available: () => !isDisabledWindow('ParallelsWindow'),
    async enter({ addWindow }) {
      await addWindow('ParallelsWindow');
      await waitForPanel('ParallelsWindow');
    }
  },
  {
    id: 'statistics',
    target: '.window.StatisticsWindow',
    placement: 'left',
    available: () => !isDisabledWindow('StatisticsWindow'),
    async enter({ addWindow }) {
      await addWindow('StatisticsWindow');
      await waitForPanel('StatisticsWindow', { extra: '.word-cloud, canvas, svg' });
    }
  },
  {
    id: 'media',
    target: '.window.MediaWindow',
    placement: 'left',
    available: () => !isDisabledWindow('MediaWindow'),
    async enter({ addWindow }) {
      await addWindow('MediaWindow');
      await waitForPanel('MediaWindow', { extra: 'img' });
    }
  },
  {
    id: 'audio',
    target: '.window.AudioWindow',
    placement: 'left',
    available: () => !isDisabledWindow('AudioWindow') && getConfig().enableAudioWindow !== false,
    async enter({ addWindow }) {
      await addWindow('AudioWindow');
      await waitForPanel('AudioWindow');
    }
  },
  {
    id: 'settings',
    target: '#config-window',
    placement: 'left',
    async enter({ $ }) {
      click($('#main-menu-button'));
      await waitFor(() => $('#main-menu-dropdown')?.matches(':popover-open'));
      await sleep(220);
      click($('#main-menu-settings-button'));
      await waitFor(() => $('#config-window')?.matches(':popover-open'));
      await sleep(200);
    }
  },
  {
    id: 'theme',
    target: '#config-themes',
    placement: 'left',
    available: () => getConfig().enableThemeSelector !== false,
    async enter({ $, remember }) {
      if (!$('#config-window')?.matches(':popover-open')) $('#config-window')?.showPopover();
      await sleep(160);
      remember('theme', $('#config-themes .config-theme-toggle-selected')?.dataset.themename ?? 'default');
      click($('#config-theme-jabbok'));
      await sleep(340);
    },
    async exit({ $, recall }) {
      const previous = recall('theme');
      if (previous) click($(`#config-theme-${previous}`));
    }
  },
  {
    id: 'deeplink',
    target: '#config-global-url',
    placement: 'left',
    available: () => getConfig().enableUrlCopier !== false,
    async enter({ $ }) {
      closeAppPopovers();
      click($('#main-menu-button'));
      await waitFor(() => $('#main-menu-dropdown')?.matches(':popover-open'));
      await waitFor(() => $('#config-global-url-input')?.value, { timeout: 5000 });
      await sleep(180);
    },
    async exit() {
      closeAppPopovers();
    }
  },
  {
    id: 'palette',
    target: '.command-palette',
    placement: 'bottom',
    async enter({ $ }) {
      closeAppPopovers();
      await sleep(120);
      pressKey(document, 'k', { ctrlKey: true });
      await waitFor(() => $('.command-palette-backdrop.open'));
      await sleep(220);
      await typeInto($('.command-palette-input'), '> theme', 45);
      await sleep(300);
    },
    async exit({ $ }) {
      if ($('.command-palette-backdrop.open')) pressKey(document, 'k', { ctrlKey: true });
      await sleep(150);
    }
  },
  {
    id: 'finish',
    placement: 'center',
    async enter() {
      closeAppPopovers();
      await sleep(140);
    }
  }
];

export function GuidedTour() {
  const config = getConfig();

  const menuButton = elem('div', { className: 'main-menu-item', id: 'main-menu-tour-button' },
    elem('span', { className: 'main-menu-icon', innerHTML: getWindowIcon('tour') || '' }),
    elem('span', { className: 'i18n', dataset: { i18n: '[html]tour.launch' } }, 'Guided Tour')
  );
  $('#main-menu-features')?.appendChild(menuButton);

  const ring = elem('div', { className: 'tour-ring' });
  const arrow = elem('div', { className: 'tour-card-arrow' });

  const counter = elem('span', { className: 'tour-count' });
  const closeButton = asButton(elem('span', { className: 'tour-close', innerHTML: '&times;' }), t('tour.buttons.exit'));
  const title = elem('h2', { className: 'tour-title', id: 'tour-title' });
  const body = elem('div', { className: 'tour-body' });
  const progressFill = elem('div', { className: 'tour-progress-fill' });
  const progress = elem('div', { className: 'tour-progress' }, progressFill);

  const skipButton = elem('button', { type: 'button', className: 'tour-button tour-skip' });
  const backButton = elem('button', { type: 'button', className: 'tour-button tour-back' });
  const nextButton = elem('button', { type: 'button', className: 'tour-button tour-next' });

  const card = elem('div', { className: 'tour-card' },
    arrow,
    elem('div', { className: 'tour-card-head' }, counter, closeButton),
    title,
    body,
    progress,
    elem('div', { className: 'tour-card-foot' },
      skipButton,
      elem('span', { className: 'tour-card-foot-end' }, backButton, nextButton)
    )
  );
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', 'tour-title');
  card.setAttribute('aria-live', 'polite');

  const layer = elem('div', { className: 'tour-layer', popover: 'manual' }, ring, card);
  document.body.appendChild(layer);

  let steps = [];
  let index = -1;
  let active = false;
  let transition = 0;
  let entering = null;
  let firstPlacement = true;
  let lastPlacement = null;
  let lastRing = null;
  let rerendered = false;
  let popoverOpenedSinceRaise = false;
  const memory = new Map();
  const addedWindowIds = new Map();

  const show = () => {
    if (!layer.matches(':popover-open')) layer.showPopover();
  };

  const hide = () => {
    if (layer.matches(':popover-open')) layer.hidePopover();
  };

  document.addEventListener('toggle', (e) => {
    const el = e.target;
    if (!active || e.newState !== 'open') return;
    if (!(el instanceof HTMLElement) || !el.hasAttribute('popover')) return;
    if (el === layer || el.id === 'demo-cursor') return;
    popoverOpenedSinceRaise = true;
  }, true);

  const raise = () => {
    if (!popoverOpenedSinceRaise) return;
    popoverOpenedSinceRaise = false;
    hide();
    show();
    rerendered = true;
  };

  const resolveTarget = (step) => {
    if (!step?.target) return null;
    try {
      const found = typeof step.target === 'function' ? step.target() : $(step.target);
      if (!found?.isConnected) return null;
      const box = found.getBoundingClientRect();
      return box.width > 0 && box.height > 0 ? found : null;
    } catch {
      return null;
    }
  };

  const position = () => {
    const step = steps[index];
    if (!step) return;

    const target = resolveTarget(step);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    if (!target || step.placement === 'center') {
      layer.classList.add('tour-centered');
      lastRing = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
      ring.style.cssText = lastRing;
      lastPlacement = { centered: true };
      rerendered = false;
      card.style.left = '';
      card.style.top = '';
      arrow.style.cssText = '';
      return;
    }

    layer.classList.remove('tour-centered');

    const pad = step.pad ?? 8;
    const box = target.getBoundingClientRect();
    const hole = {
      left: Math.max(0, box.left - pad),
      top: Math.max(0, box.top - pad),
      right: Math.min(vw, box.right + pad),
      bottom: Math.min(vh, box.bottom + pad)
    };
    hole.width = Math.max(0, hole.right - hole.left);
    hole.height = Math.max(0, hole.bottom - hole.top);

    const nextRing =
      `left:${hole.left}px;top:${hole.top}px;width:${hole.width}px;height:${hole.height}px`;

    const cardBox = card.getBoundingClientRect();
    const cardW = cardBox.width || 340;
    const cardH = cardBox.height || 200;

    const room = {
      bottom: vh - hole.bottom - margin,
      top: hole.top - margin,
      right: vw - hole.right - margin,
      left: hole.left - margin
    };
    const fits = { bottom: room.bottom >= cardH, top: room.top >= cardH, right: room.right >= cardW, left: room.left >= cardW };

    let side = step.placement && step.placement !== 'auto' ? step.placement : null;
    if (!side || !fits[side]) {
      side = ['bottom', 'top', 'right', 'left'].find(s => fits[s])
        ?? Object.entries(room).sort((a, b) => b[1] - a[1])[0][0];
    }

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    let left;
    let top;

    if (side === 'bottom' || side === 'top') {
      left = clamp(hole.left + hole.width / 2 - cardW / 2, margin, vw - cardW - margin);
      top = side === 'bottom' ? hole.bottom + margin : hole.top - cardH - margin;
    } else {
      left = side === 'right' ? hole.right + margin : hole.left - cardW - margin;
      top = clamp(hole.top + hole.height / 2 - cardH / 2, margin, vh - cardH - margin);
    }
    top = clamp(top, margin, Math.max(margin, vh - cardH - margin));
    left = clamp(left, margin, Math.max(margin, vw - cardW - margin));

    left = Math.round(left);
    top = Math.round(top);

    if (rerendered && lastRing) {
      layer.classList.add('tour-placing');
      ring.style.cssText = lastRing;
      if (lastPlacement && !lastPlacement.centered) {
        card.style.left = `${lastPlacement.left}px`;
        card.style.top = `${lastPlacement.top}px`;
      }
      layer.offsetWidth;
      layer.classList.remove('tour-placing');
    }
    rerendered = false;

    ring.style.cssText = nextRing;
    lastRing = nextRing;

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    lastPlacement = { centered: false, left, top };

    const opposite = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' };
    arrow.dataset.side = opposite[side];
    if (side === 'bottom' || side === 'top') {
      arrow.style.cssText = `left:${clamp(hole.left + hole.width / 2 - left, 18, cardW - 18)}px`;
    } else {
      arrow.style.cssText = `top:${clamp(hole.top + hole.height / 2 - top, 18, cardH - 18)}px`;
    }
  };

  let repositionQueued = false;
  const queueReposition = () => {
    if (!active || repositionQueued) return;
    repositionQueued = true;
    requestAnimationFrame(() => {
      repositionQueued = false;
      position();
    });
  };

  const render = () => {
    const step = steps[index];
    if (!step) return;

    const total = steps.length;
    counter.textContent = t('tour.progress', { current: index + 1, total });
    title.innerHTML = t(`tour.steps.${step.id}.title`);
    body.innerHTML = t(`tour.steps.${step.id}.body`);
    progressFill.style.width = `${((index + 1) / total) * 100}%`;

    skipButton.textContent = t('tour.buttons.skip');
    backButton.textContent = t('tour.buttons.back');
    nextButton.textContent = index === total - 1 ? t('tour.buttons.done') : t('tour.buttons.next');
    backButton.disabled = index === 0;
    skipButton.style.visibility = index === total - 1 ? 'hidden' : '';

    layer.dataset.step = step.id;

    if (firstPlacement) {
      layer.classList.add('tour-placing');
      position();
      layer.offsetWidth;
      layer.classList.remove('tour-placing');
      firstPlacement = false;
    } else {
      position();
    }

    card.classList.remove('tour-step-in');
    card.offsetWidth;
    card.classList.add('tour-step-in');

    if (step.focus !== false) {
      nextButton.focus({ preventScroll: true });
    }
  };

  const owningStep = () => entering ?? steps[index] ?? null;

  const context = {
    $,
    sleep,
    waitFor,
    click,
    typeInto,
    dragBy,
    remember: (key, value) => memory.set(key, value),
    recall: (key) => memory.get(key),

    async addWindow(className, data = {}) {
      const app = getApp();
      const manager = app?.windowManager;
      if (!manager) return null;

      const existing = manager.getWindows().find(w => w.className === className);
      if (existing) return existing;

      const step = owningStep();
      const seed = { ...data };

      if (className === 'BibleWindow' || className === 'CommentaryWindow' || className === 'AudioWindow') {
        const anchor = manager.getWindows()
          .find(w => w.className === 'BibleWindow' || w.className === 'CommentaryWindow');
        const current = anchor?.getData() ?? null;
        const fragmentid = current?.fragmentid ?? config.newWindowFragmentid ?? 'JN1_1';
        seed.fragmentid = fragmentid;
        seed.sectionid = current?.sectionid ?? fragmentid.split('_')[0];
        if (className === 'AudioWindow' && current?.textid) seed._activeBibleTextid = current.textid;
      }

      let win = null;
      PlaceKeeper.preservePlace(() => {
        win = manager.add(className, seed);
      });
      if (!win) return null;

      if (step) {
        const owned = addedWindowIds.get(step.id) ?? [];
        owned.push(win.id);
        addedWindowIds.set(step.id, owned);
      }

      await waitFor(() => document.querySelector(`.window.${className}`));
      return win;
    },

    async trackNewWindows(fn) {
      const manager = getApp()?.windowManager;
      const before = new Set(manager?.getWindows().map(w => w.id) ?? []);
      await fn();
      const step = owningStep();
      if (!manager || !step) return;
      const owned = addedWindowIds.get(step.id) ?? [];
      for (const win of manager.getWindows()) {
        if (!before.has(win.id)) owned.push(win.id);
      }
      addedWindowIds.set(step.id, owned);
    }
  };

  const closeStepWindows = (step) => {
    const owned = addedWindowIds.get(step.id);
    if (!owned) return;
    const manager = getApp()?.windowManager;
    PlaceKeeper.preservePlace(() => {
      for (const id of owned) manager?.remove(id);
    });
    addedWindowIds.delete(step.id);
  };

  const state = (done = false) => {
    const step = steps[index];
    const target = step ? resolveTarget(step) : null;
    const box = target?.getBoundingClientRect() ?? null;

    return {
      active,
      done,
      index,
      total: steps.length,
      id: step?.id ?? null,
      title: step ? title.textContent : null,
      body: step ? body.textContent : null,
      centered: step ? (!target || step.placement === 'center') : false,
      spotlight: box
        ? { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) }
        : null
    };
  };

  const leave = async (step) => {
    if (!step) return;
    try {
      await step.exit?.(context);
    } catch (e) {
      console.warn(`[tour] exit "${step.id}" failed:`, e);
    }
    closeStepWindows(step);
  };

  const goTo = async (target, direction = 1) => {
    if (!active) return state();
    if (target < 0) return state();
    const token = ++transition;

    let previous = steps[index];
    let candidate = target;

    while (candidate >= 0 && candidate < steps.length) {
      const step = steps[candidate];
      card.classList.add('tour-busy');

      if (previous && previous !== step) {
        await leave(previous);
        previous = null;
      }
      if (token !== transition) return state();

      entering = step;
      try {
        await step.enter?.(context);
      } catch (e) {
        console.warn(`[tour] enter "${step.id}" failed:`, e);
      } finally {
        entering = null;
      }
      if (token !== transition) return state();

      if (step.target && !resolveTarget(step)) {
        await leave(step);
        candidate += direction;
        continue;
      }

      index = candidate;
      raise();
      card.classList.remove('tour-busy');
      render();
      await sleep(prefersReducedMotion() ? 0 : 40);
      if (token !== transition) return state();
      position();
      return state();
    }

    card.classList.remove('tour-busy');
    await stop();
    return state(true);
  };

  async function start({ from = 0, reset = true } = {}) {
    steps = TOUR_STEPS.filter(step => step.available?.() !== false);
    if (!steps.length) return state();

    if (reset) {
      memory.clear();
      addedWindowIds.clear();
    }
    active = true;
    index = -1;
    firstPlacement = true;
    lastRing = null;
    lastPlacement = null;
    rerendered = false;
    popoverOpenedSinceRaise = false;
    document.body.classList.add('tour-active');
    show();
    AppSettings.setValue(SETTINGS_KEY, { seen: true });
    return goTo(Math.min(from, steps.length - 1), 1);
  }

  async function stop() {
    if (!active) return state();
    transition++;
    const step = steps[index];
    active = false;
    index = -1;
    await leave(step);
    hide();
    document.body.classList.remove('tour-active');
    AppSettings.setValue(SETTINGS_KEY, { seen: true });
    return state(true);
  }

  const next = () => goTo(index + 1, 1);
  const prev = () => goTo(index - 1, -1);

  onActivate(closeButton, () => { stop(); });
  skipButton.addEventListener('click', () => { stop(); });
  backButton.addEventListener('click', () => { prev(); });
  nextButton.addEventListener('click', () => { next(); });

  window.addEventListener('resize', queueReposition);
  window.addEventListener('scroll', queueReposition, true);

  document.addEventListener('keydown', (e) => {
    if (!active) return;

    if (e.key === 'Escape') {
      const appUiOpen = document.querySelector('[popover]:popover-open:not(.tour-layer)') ||
        $('.command-palette-backdrop.open');
      if (appUiOpen) return;
      e.preventDefault();
      stop();
      return;
    }

    const typing = e.target instanceof HTMLElement &&
      (e.target.matches('input, textarea, select, [contenteditable]'));
    if (typing) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  }, true);

  onActivate(menuButton, () => {
    closeAppPopovers();
    start();
  });

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('tour');
  const seen = AppSettings.getValue(SETTINGS_KEY, { seen: false }).seen === true;

  const shouldAutostart = requested === '1' ||
    (requested !== '0' && !seen && config.enableGuidedTourAutostart === true);

  if (shouldAutostart) {
    waitFor(() => $('.window.BibleWindow .section .verse, .window.BibleWindow .section .v'), { timeout: 20000 })
      .then(() => sleep(600))
      .then(() => {
        if (!document.body.classList.contains('compact-ui')) start();
      });
  }

  const api = {
    start,
    stop,
    next,
    prev,
    goTo: (i) => goTo(i, 1),
    isActive: () => active,
    getState: state,
    getSteps: () => (active ? steps : TOUR_STEPS.filter(s => s.available?.() !== false))
      .map(s => ({ id: s.id, title: t(`tour.steps.${s.id}.title`) })),
    element: layer
  };

  tourInstance = api;
  return menuButton;
}

export const getGuidedTour = () => tourInstance;

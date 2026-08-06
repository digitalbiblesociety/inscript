import { getConfig } from '../../core/config.js';
import { getApp } from '../../core/registry.js';

const $ = (selector, root = document) => root.querySelector(selector);
const sleep = (milliseconds) => new Promise((resolve) => { setTimeout(resolve, milliseconds); });
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

async function waitFor(selectorOrProbe, { timeout = 8000, interval = 60 } = {}) {
  const discernTheSign = typeof selectorOrProbe === 'function' ? selectorOrProbe : () => $(selectorOrProbe);
  const endOfDays = Date.now() + timeout;

  while (true) {
    const secondComing = discernTheSign();

    if (secondComing) return secondComing;
    if (Date.now() > endOfDays) return null; // No one knows the selector or the hour

    await sleep(interval); // Remain watchful.
  }
}

const isDisabledWindow = (className) => (getConfig().disabledWindowTypes ?? []).includes(className);

async function waitForPanel(className, { extra = null, timeout = 12000 } = {}) {
  const selector = `.window.${className}`;
  if (!await waitFor(selector, { timeout: 4000 })) return;
  await waitFor(() => !$(`${selector} .loading-indicator`), { timeout });
  if (extra) await waitFor(() => $(`${selector} ${extra}`), { timeout: 6000 });
  await sleep(140);
}

const bibleWindows = () => [...document.querySelectorAll('.window.BibleWindow')];
const inBible = (selector, index = 0) => () => {
  const windowElement = bibleWindows()[index] ?? null;
  return windowElement && selector ? $(selector, windowElement) : windowElement;
};

function click(element) {
  if (!element) return;
  const windowElement = element.closest?.('.window');
  if (windowElement && !windowElement.classList.contains('focused')) {
    windowElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  }
  element.dispatchEvent(new MouseEvent('click', {
    bubbles: true, cancelable: true, view: window
  }));
}

let tourField = null;

async function typeInto(element, text, delay = 40) {
  if (!element) return;
  tourField = element;
  element.focus();
  element.value = '';
  for (const character of text) {
    element.value += character;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(delay);
  }
}

function pressKey(element, key, extra = {}) {
  element?.dispatchEvent(new KeyboardEvent('keydown', {
    key, bubbles: true, cancelable: true, ...extra
  }));
}

async function dragBy(element, totalDx, { steps = 14, stepDelay = 16 } = {}) {
  if (!element) return;
  const box = element.getBoundingClientRect();
  const startX = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  element.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, clientX: startX, clientY: y, button: 0
  }));
  for (let index = 1; index <= steps; index++) {
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, cancelable: true,
      clientX: startX + totalDx * index / steps, clientY: y
    }));
    await sleep(stepDelay);
  }
  document.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, cancelable: true, clientX: startX + totalDx, clientY: y
  }));
}

function closeAppPopovers() {
  document.querySelectorAll('[popover]:popover-open').forEach((element) => {
    if (element.classList.contains('tour-layer')) return;
    try { element.hidePopover(); } catch { /* already closed */ }
  });
}

export const TOUR_STEPS = [
  {
    id: 'welcome', placement: 'center',
    async enter() { closeAppPopovers(); }
  },
  { id: 'topbar', target: '.main-menu-container', placement: 'bottom', pad: 4 },
  {
    id: 'mainmenu', target: '#main-menu-dropdown', placement: 'right',
    async enter({ $ }) {
      click($('#main-menu-button'));
      await waitFor(() => $('#main-menu-dropdown')?.matches(':popover-open'));
      await sleep(140);
    },
    async exit() { closeAppPopovers(); }
  },
  {
    id: 'addwindow', target: '#main-menu-windows-list', placement: 'right',
    async enter({ $ }) {
      if (!$('#main-menu-dropdown')?.matches(':popover-open')) {
        click($('#main-menu-button'));
        await waitFor(() => $('#main-menu-dropdown')?.matches(':popover-open'));
      }
      await sleep(120);
    },
    async exit() { closeAppPopovers(); }
  },
  {
    id: 'reference', target: inBible('.text-nav'), placement: 'bottom',
    async enter() { closeAppPopovers(); await sleep(90); }
  },
  {
    id: 'navigator', target: '.text-navigator', placement: 'right',
    async enter() {
      const navigator = inBible('.text-nav')();
      if (!$('.text-navigator')?.matches(':popover-open')) click(navigator);
      await waitFor(() => $('.text-navigator')?.matches(':popover-open'));
      await sleep(160);
    }
  },
  {
    id: 'navigate', target: inBible('.scroller-text-wrapper'), placement: 'top',
    async enter() {
      if (!$('.text-navigator')?.matches(':popover-open')) {
        click(inBible('.text-nav')());
        await waitFor(() => $('.text-navigator')?.matches(':popover-open'));
      }
    },
    async demo() {
      click(await waitFor('.text-navigator .text-navigator-division.divisionid-GN'));
      const chapter = await waitFor('.text-navigator .text-navigator-section.section-GN1');
      await sleep(220);
      click(chapter);
      await waitFor(() => bibleWindows().every((windowElement) =>
        [...windowElement.querySelectorAll('.section')]
          .some((section) => section.getAttribute('data-id') === 'GN1')), { timeout: 15000 });
      await waitForPanel('BibleWindow');
    }
  },
  {
    id: 'versions', target: inBible('.version-cycler'), placement: 'bottom',
    async enter() { closeAppPopovers(); await sleep(90); }
  },
  {
    id: 'textchooser', target: '.text-chooser', placement: 'right',
    async enter() {
      if (!$('.text-chooser')?.matches(':popover-open')) click(inBible('.text-list')());
      await waitFor(() => $('.text-chooser')?.matches(':popover-open'));
      await sleep(200);
    },
    async demo({ $ }) { await typeInto($('.text-chooser-filter-text'), 'spanish', 34); await sleep(260); },
    async exit() { closeAppPopovers(); }
  },
  {
    id: 'versioninfo', target: inBible('.scroller-info'), placement: 'left',
    async enter() {
      closeAppPopovers();
      click(inBible('.info-button')());
      await waitFor(() => inBible('.scroller-info')()?.matches(':popover-open'));
      await sleep(240);
    },
    async exit() { closeAppPopovers(); }
  },
  {
    id: 'linked', target: inBible('.link-button'), placement: 'left', pad: 6,
    available: () => bibleWindows().length > 1
  },
  {
    id: 'layout', target: '.window-splitter', placement: 'right', pad: 3,
    available: () => $('.window-splitter') !== null,
    async demo({ $ }) {
      await dragBy($('.window-splitter'), 110);
      await sleep(240);
      await dragBy($('.window-splitter'), -110);
      await sleep(120);
    }
  },
  {
    id: 'search', target: '#main-search-box', placement: 'bottom', focus: false,
    async enter() { closeAppPopovers(); },
    async demo({ $ }) { await typeInto($('#main-search-input'), 'shepherd', 34); await sleep(260); },
    async exit({ $ }) {
      const input = $('#main-search-input');
      if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  },
  {
    id: 'searchresults', target: '.window.SearchWindow', placement: 'left',
    available: () => !isDisabledWindow('SearchWindow'),
    async enter({ $, addWindow }) {
      closeAppPopovers();
      const anchor = getApp()?.windowManager?.getWindows()
        .find((windowComponent) => windowComponent.className === 'BibleWindow') ?? null;
      const textid = anchor?.getData()?.textid ?? getConfig().newBibleWindowVersion;
      await addWindow('SearchWindow', {
        textid, searchtext: 'shepherd', divisions: 'MT,MK,LK,JN'
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
    id: 'commentary', target: '.window.CommentaryWindow', placement: 'left',
    available: () => !isDisabledWindow('CommentaryWindow'),
    async enter({ addWindow }) {
      closeAppPopovers();
      await addWindow('CommentaryWindow');
      await waitForPanel('CommentaryWindow');
    }
  },
  {
    id: 'comparison', target: '.window.TextComparisonWindow', placement: 'left',
    available: () => !isDisabledWindow('TextComparisonWindow'),
    async enter({ addWindow }) {
      await addWindow('TextComparisonWindow');
      await waitForPanel('TextComparisonWindow');
    }
  },
  {
    id: 'parallels', target: '.window.ParallelsWindow', placement: 'left',
    available: () => !isDisabledWindow('ParallelsWindow'),
    async enter({ addWindow }) {
      await addWindow('ParallelsWindow');
      await waitForPanel('ParallelsWindow');
    }
  },
  {
    id: 'statistics', target: '.window.StatisticsWindow', placement: 'left',
    available: () => !isDisabledWindow('StatisticsWindow'),
    async enter({ addWindow }) {
      await addWindow('StatisticsWindow');
      await waitForPanel('StatisticsWindow', { extra: '.word-cloud, canvas, svg' });
    }
  },
  {
    id: 'media', target: '.window.MediaWindow', placement: 'left',
    available: () => !isDisabledWindow('MediaWindow'),
    async enter({ addWindow }) {
      await addWindow('MediaWindow');
      await waitForPanel('MediaWindow', { extra: 'img' });
    }
  },
  {
    id: 'audio', target: '.window.AudioWindow', placement: 'left',
    available: () => !isDisabledWindow('AudioWindow') && getConfig().enableAudioWindow !== false,
    async enter({ addWindow }) {
      await addWindow('AudioWindow');
      await waitForPanel('AudioWindow');
    }
  },
  {
    id: 'settings', target: '#config-window', placement: 'left',
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
    id: 'theme', target: '#config-themes', placement: 'left',
    available: () => getConfig().enableThemeSelector !== false,
    async enter({ $, remember }) {
      if (!$('#config-window')?.matches(':popover-open')) $('#config-window')?.showPopover();
      await sleep(160);
      remember('theme', $('#config-themes .config-theme-toggle-selected')?.dataset.themename ?? 'default');
    },
    async demo({ $ }) { click($('#config-theme-jabbok')); await sleep(340); },
    async exit({ $, recall }) {
      const previous = recall('theme');
      if (previous) click($(`#config-theme-${previous}`));
    }
  },
  {
    id: 'deeplink', target: '#config-global-url', placement: 'left',
    available: () => getConfig().enableUrlCopier !== false,
    async enter({ $ }) {
      closeAppPopovers();
      click($('#main-menu-button'));
      await waitFor(() => $('#main-menu-dropdown')?.matches(':popover-open'));
      await waitFor(() => $('#config-global-url-input')?.value, { timeout: 5000 });
      await sleep(180);
    },
    async exit() { closeAppPopovers(); }
  },
  {
    id: 'palette', target: '.command-palette', placement: 'bottom',
    async enter({ $ }) {
      closeAppPopovers();
      await sleep(120);
      pressKey(document, 'k', { ctrlKey: true });
      await waitFor(() => $('.command-palette-backdrop.open'));
      await sleep(220);
    },
    async demo({ $ }) { await typeInto($('.command-palette-input'), '> theme', 45); await sleep(300); },
    async exit({ $ }) {
      if ($('.command-palette-backdrop.open')) pressKey(document, 'k', { ctrlKey: true });
      await sleep(150);
    }
  },
  {
    id: 'finish', placement: 'center',
    async enter() { closeAppPopovers(); await sleep(140); }
  }
];

export const tourHelpers = {
  $, sleep, waitFor, click, typeInto, dragBy, closeAppPopovers,
  prefersReducedMotion,
  getTourField: () => tourField,
  setTourField: (value) => { tourField = value; }
};

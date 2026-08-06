import { elem, onActivate } from '../../lib/helpers.esm.js';
import AppSettings from '../../common/AppSettings.js';
import { getConfig } from '../../core/config.js';
import { getWindowIcon } from '../../core/windowIcons.js';

const SETTINGS_KEY = 'guided-tour';

let menuButton = null;
let controllerPromise = null;
let api = null;
let closeAppPopovers = null;

function loadController() {
  controllerPromise ??= Promise.all([
    import('./GuidedTourController.js'),
    import('./GuidedTourSteps.js')
  ]).then(([{ GuidedTourController }, { TOUR_STEPS, tourHelpers }]) => {
    const controller = new GuidedTourController(TOUR_STEPS, tourHelpers, menuButton);
    api = controller.getApi();
    closeAppPopovers = tourHelpers.closeAppPopovers;
    return api;
  });
  return controllerPromise;
}

function shouldAutostart() {
  const requested = new URLSearchParams(window.location.search).get('tour');
  if (requested === '1') return true;
  if (requested === '0') return false;
  const seen = AppSettings.getValue(SETTINGS_KEY, { seen: false }).seen === true;
  return !seen && getConfig().enableGuidedTourAutostart === true;
}

export function GuidedTour() {
  menuButton = elem('div', {
    className: 'main-menu-item', id: 'main-menu-tour-button'
  }, elem('span', { className: 'main-menu-icon', innerHTML: getWindowIcon('tour') || '' }),
  elem('span', { className: 'i18n', dataset: { i18n: '[html]tour.launch' } }, 'Guided Tour'));
  document.querySelector('#main-menu-features')?.appendChild(menuButton);

  onActivate(menuButton, async () => {
    const loaded = await loadController();
    closeAppPopovers?.();
    loaded.start();
  });

  if (shouldAutostart()) loadController();

  return menuButton;
}

export const getGuidedTour = () => ({
  start: (options) => loadController().then((loaded) => loaded.start(options)),
  getSteps: () => loadController().then((loaded) => loaded.getSteps()),
  stop: () => api?.stop(),
  next: () => api?.next(),
  prev: () => api?.prev(),
  goTo: (index) => api?.goTo(index),
  isActive: () => api?.isActive() ?? false,
  getState: () => api?.getState(),
  get element() { return api?.element; }
});

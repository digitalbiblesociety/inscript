
import { elem, asButton, onActivate } from '../lib/helpers.esm.js';
import { mixinEventEmitter } from '../common/EventEmitter.js';
import { VERSION } from '../core/registry.js';
import { t } from '../lib/i18n.js';
export function MainMenuButton(parentNode) {
  const mainMenuLogo = elem('div', { id: 'app-logo' },
    elem('img', { src: './img/inscript_logo.svg', alt: 'Logo', width: 114, height: 22 }),
    elem('span', { className: 'app-version-pill' }, VERSION.split('.').slice(0, 2).join('.'))
  );
  const mainMenuButton = elem('div', { id: 'main-menu-button' });
  asButton(mainMenuButton, t('a11y.mainMenu'));
  mainMenuButton.setAttribute('aria-haspopup', 'menu');
  mainMenuButton.setAttribute('aria-expanded', 'false');
  const mainMenuDropDown = elem('div', { id: 'main-menu-dropdown', popover: '' },
    elem('div', { className: 'main-menu-heading i18n', dataset: { i18n: '[html]menu.labels.addwindow' } }, 'Add Window'),
    elem('div', { id: 'main-menu-windows-list', className: 'main-menu-list' }),
    elem('div', { className: 'main-menu-heading i18n', dataset: { i18n: '[html]menu.labels.options' } }),
    elem('div', { id: 'main-menu-features', className: 'main-menu-list' })
  );

  if (parentNode) {
    parentNode.appendChild(mainMenuButton);
    parentNode.appendChild(mainMenuLogo);
  }
  document.body.appendChild(mainMenuDropDown);

  // Handle popover toggle events (fires on light dismiss - click outside or Escape)
  mainMenuDropDown.addEventListener('toggle', (e) => {
    const open = e.newState !== 'closed';
    mainMenuButton.classList.toggle('active', open);
    mainMenuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  const hide = () => {
    mainMenuDropDown.hidePopover();
  };

  const mainMenuClick = () => {
    if (mainMenuDropDown.matches(':popover-open')) {
      hide();
    } else {
      mainMenuDropDown.showPopover();
    }
  };

  onActivate(mainMenuButton, mainMenuClick);
  mainMenuLogo.addEventListener('click', mainMenuClick);

  mainMenuDropDown.addEventListener('click', (e) => {
    if (e.target.closest('.main-menu-item')) hide();
  });

  const ext = {};
  mixinEventEmitter(ext);
  ext._events = {};

  return ext;
}

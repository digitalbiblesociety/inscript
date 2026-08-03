import { elem } from '../lib/helpers.esm.js';
import { getConfig } from '../core/config.js';
import { resetWindowLayout } from '../common/settingsReset.js';

export function RestoreButton() {
  const config = getConfig();

  if (!config.enableRestore) {
    return;
  }

  const buttonMenu = document.querySelector('#main-menu-windows-list');

  const restoreButton = elem('span', { className: 'window-reset i18n', textContent: 'Reset', dataset: { i18n: '[html]menu.reset' } });

  restoreButton.addEventListener('click', resetWindowLayout);

  buttonMenu?.appendChild(restoreButton);

  return restoreButton;
}

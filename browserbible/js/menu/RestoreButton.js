import { elem } from '../lib/helpers.esm.js';
import { getConfig } from '../core/config.js';

export function RestoreButton() {
  const config = getConfig();

  if (!config.enableRestore) {
    return;
  }

  const buttonMenu = document.querySelector('#main-menu-windows-list');

  const restoreButton = elem('span', { className: 'window-reset i18n', textContent: 'Reset', dataset: { i18n: '[html]menu.reset' } });

  restoreButton.addEventListener('click', () => {
    if (config.windows !== undefined) {
      const querystring = [];

      for (const [i, win] of config.windows.entries()) {
        querystring.push(`win${i + 1}=${win.type}`);

        for (const key of Object.keys(win.data ?? {})) {
          querystring.push(`${key}${i + 1}=${win.data[key]}`);
        }
      }

      window.location.href = `${window.location.pathname}?${querystring.join('&')}`;
    } else {
      window.location.reload();
    }
  });

  buttonMenu?.appendChild(restoreButton);

  return restoreButton;
}

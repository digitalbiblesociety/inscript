import { i18n } from '../lib/i18n.js';
import { MovableWindow } from '../ui/MovableWindow.js';
import { elem } from '../lib/helpers.esm.js';
import { getWindowIcon } from '../core/windowIcons.js';

export function AboutScreen() {
  const aboutButton = elem('div', { className: 'main-menu-item' },
    elem('span', { className: 'main-menu-icon', innerHTML: getWindowIcon('about') || '' }),
    elem('span', { className: 'i18n', dataset: { i18n: '[html]menu.labels.about' } })
  );
  document.querySelector('#main-menu-features')?.appendChild(aboutButton);

  let aboutWindowPromise = null;
  const getWindow = () => {
    aboutWindowPromise ??= import('../../about.html?raw').then(({ default: aboutHtml }) => {
      const win = new MovableWindow(500, 250, i18n.t('menu.labels.about'));
      const aboutDoc = new DOMParser().parseFromString(aboutHtml, 'text/html');
      const aboutContent = elem('div', { className: 'about-screen' });
      aboutContent.append(...aboutDoc.body.children);
      win.body.appendChild(aboutContent);

      const aboutTitle = win.title;
      aboutTitle.classList.add('i18n');
      aboutTitle.dataset.i18n = '[html]menu.labels.about';
      return win;
    });
    return aboutWindowPromise;
  };

  aboutButton.addEventListener('click', async () => {
    const win = await getWindow();
    if (win.isVisible()) {
      win.hide();
      return;
    }
    document.querySelector('#main-menu-dropdown[popover]')?.hidePopover();
    win
      .size(.8 * innerWidth, innerHeight)
      .show();
  });

  return aboutButton;
}
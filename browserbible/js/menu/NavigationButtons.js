import { getConfig } from '../core/config.js';
import { Reference } from '../bible/BibleReference.js';
import { TextNavigation } from '../common/TextNavigation.js';
import { elem } from '../lib/helpers.esm.js';
import { t } from '../lib/i18n.js';
import arrowRightSvg from '../../css/images/arrow-right-gray-light.svg?raw';
import arrowLeftSvg from '../../css/images/arrow-left-gray-light.svg?raw';

export function NavigationButtons(parentNode) {
  const config = getConfig();
  if (!config.enableNavigationButtons) return null;

  const backButton = elem('button', { type: 'button', id: 'main-back-button', className: 'inactive plain-button', innerHTML: arrowLeftSvg, ariaLabel: t('a11y.previousPassage') });
  const forwardButton = elem('button', { type: 'button', id: 'main-forward-button', className: 'inactive plain-button', innerHTML: arrowRightSvg, ariaLabel: t('a11y.nextPassage') });

  const compactLabel = elem('span', { id: 'compact-back-button-label' });
  const compactBackButton = elem('button', { type: 'button', id: 'compact-back-button', className: 'plain-button', ariaLabel: t('a11y.previousPassage') },
    elem('span', { className: 'compact-back-icon', innerHTML: arrowLeftSvg }),
    compactLabel
  );

  parentNode.appendChild(backButton);
  parentNode.appendChild(forwardButton);
  document.body.appendChild(compactBackButton);

  const back = () => TextNavigation.back();

  const updateButtonStates = () => {
    const locations = TextNavigation.getLocations();
    const locationIndex = TextNavigation.getLocationIndex();

    const canGoBack = locationIndex > 0;
    if (canGoBack) {
      backButton.classList.remove('inactive');

      const lastRef = Reference(locations[locationIndex - 1]);
      compactLabel.innerHTML = lastRef?.toString() ?? '';

      compactBackButton.classList.add('active');
    } else {
      backButton.classList.add('inactive');
      compactBackButton.classList.remove('active');
    }

    const canGoForward = locationIndex < locations.length - 1;
    forwardButton.classList.toggle('inactive', !canGoForward);

    backButton.setAttribute('aria-disabled', canGoBack ? 'false' : 'true');
    forwardButton.setAttribute('aria-disabled', canGoForward ? 'false' : 'true');
  };

  forwardButton.addEventListener('click', () => TextNavigation.forward());
  backButton.addEventListener('click', back);
  compactBackButton.addEventListener('click', back);

  TextNavigation.on('locationchange', updateButtonStates);

  updateButtonStates();
}

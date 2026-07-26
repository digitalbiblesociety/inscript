import { getConfig } from '../core/config.js';
import { Reference } from '../bible/BibleReference.js';
import { TextNavigation } from '../common/TextNavigation.js';
import { elem, asButton, onActivate } from '../lib/helpers.esm.js';
import { t } from '../lib/i18n.js';
import arrowRightSvg from '../../css/images/arrow-right-gray-light.svg?raw';
import arrowLeftSvg from '../../css/images/arrow-left-gray-light.svg?raw';

export function NavigationButtons(parentNode) {
  const config = getConfig();
  if (!config.enableNavigationButtons) return null;

  const backButton = elem('div', { id: 'main-back-button', className: 'inactive', innerHTML: arrowLeftSvg });
  const forwardButton = elem('div', { id: 'main-forward-button', className: 'inactive', innerHTML: arrowRightSvg });
  asButton(backButton, t('a11y.previousPassage'));
  asButton(forwardButton, t('a11y.nextPassage'));

  const compactLabel = elem('span', { id: 'compact-back-button-label' });
  const compactBackButton = elem('div', { id: 'compact-back-button' },
    elem('span', { className: 'compact-back-icon', innerHTML: arrowLeftSvg }),
    compactLabel
  );
  asButton(compactBackButton, t('a11y.previousPassage'));

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

  onActivate(forwardButton, () => TextNavigation.forward());
  onActivate(backButton, back);
  onActivate(compactBackButton, back);

  TextNavigation.on('locationchange', updateButtonStates);

  updateButtonStates();
}

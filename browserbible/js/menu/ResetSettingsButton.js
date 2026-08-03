import { elem } from '../lib/helpers.esm.js';
import { getConfig } from '../core/config.js';
import { resetAllSettings } from '../common/settingsReset.js';

let openConfirm = null;

export function promptSettingsReset() {
  if (!openConfirm) return false;

  const configWindow = document.querySelector('#config-window');
  if (configWindow && !configWindow.matches(':popover-open')) {
    configWindow.showPopover();
  }

  openConfirm();
  return true;
}

export function ResetSettingsButton() {
  const config = getConfig();

  if (config.enableSettingsReset === false) {
    return;
  }

  const body = document.querySelector('#config-tools .config-body');
  if (!body) return;

  const resetButton = elem('button', {
    type: 'button',
    id: 'config-reset-button',
    className: 'config-reset-button i18n',
    textContent: 'Reset Settings',
    dataset: { i18n: '[html]menu.config.reset' }
  });

  const confirmButton = elem('button', {
    type: 'button',
    id: 'config-reset-confirm-button',
    className: 'config-reset-action config-reset-action-confirm i18n',
    textContent: 'Reset',
    dataset: { i18n: '[html]menu.config.resetconfirm' }
  });

  const cancelButton = elem('button', {
    type: 'button',
    id: 'config-reset-cancel-button',
    className: 'config-reset-action i18n',
    textContent: 'Cancel',
    dataset: { i18n: '[html]menu.config.resetcancel' }
  });

  const confirmBox = elem('div', { className: 'config-reset-confirm', hidden: true },
    elem('p', {
      className: 'config-reset-warning i18n',
      textContent: 'Restore all settings to their defaults? Your notes and highlights are kept.',
      dataset: { i18n: '[html]menu.config.resetwarning' }
    }),
    elem('div', { className: 'config-reset-actions' }, confirmButton, cancelButton)
  );

  const row = elem('div', { className: 'config-reset-row' }, resetButton, confirmBox);
  body.appendChild(row);

  const setConfirming = (confirming) => {
    confirmBox.hidden = !confirming;
    resetButton.hidden = confirming;
    if (confirming) confirmButton.focus();
  };

  resetButton.addEventListener('click', () => setConfirming(true));
  cancelButton.addEventListener('click', () => setConfirming(false));

  confirmButton.addEventListener('click', resetAllSettings);

  confirmBox.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setConfirming(false);
      resetButton.focus();
    }
  });

  document.querySelector('#config-window')?.addEventListener('beforetoggle', (e) => {
    if (e.newState === 'closed') {
      setConfirming(false);
      return;
    }

    body.appendChild(row);
  });

  openConfirm = () => setConfirming(true);

  return row;
}

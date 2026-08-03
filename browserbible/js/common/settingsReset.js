import AppSettings from './AppSettings.js';
import { i18n } from '../lib/i18n.js';

export const WINDOW_SETTINGS_KEY = 'app-windows';

const PRESERVED_PARAMS = ['custom', 'dev'];

function defaultsUrl() {
  const current = new URLSearchParams(window.location.search);
  const kept = new URLSearchParams();

  for (const param of PRESERVED_PARAMS) {
    const value = current.get(param);
    if (value !== null) kept.set(param, value);
  }

  const query = kept.toString();
  return query ? `${window.location.pathname}?${query}` : window.location.pathname;
}

export function resetAllSettings() {
  AppSettings.clearAll();
  i18n.clearLng();
  window.location.replace(defaultsUrl());
}

export function resetWindowLayout() {
  AppSettings.removeValue(WINDOW_SETTINGS_KEY);
  window.location.replace(defaultsUrl());
}

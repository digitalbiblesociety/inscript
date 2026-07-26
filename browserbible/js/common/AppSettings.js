import { getConfig } from '../core/config.js';

class AppSettingsManager {
  constructor() {
    this.storage = this._initStorage();
  }

  _initStorage() {
    try {
      window.localStorage.setItem('1', '2');
      if (window.localStorage.getItem('1') !== '2') {
        return {};
      }
      window.localStorage.removeItem('1');
      return window.localStorage.getItem('1') !== '2' ? window.localStorage : {};
    } catch (_e) {
      return {};
    }
  }

  _getKey(key) {
    const config = getConfig();
    return `${config.settingsPrefix}${key}`;
  }

  /** The stored object is shallow-merged over `defaultValue`. */
  getValue(key, defaultValue = {}) {
    const fullKey = this._getKey(key);
    const returnValue = { ...defaultValue };

    let storedValue = this.storage[fullKey];
    if (storedValue == null) {
      return returnValue;
    }

    try {
      storedValue = JSON.parse(storedValue);
    } catch {
      return returnValue;
    }

    return { ...returnValue, ...storedValue };
  }

  setValue(key, value) {
    const fullKey = this._getKey(key);
    this.storage[fullKey] = JSON.stringify(value);
  }

  removeValue(key) {
    const fullKey = this._getKey(key);
    delete this.storage[fullKey];
  }
}

const AppSettings = new AppSettingsManager();

export { AppSettings };
export default AppSettings;

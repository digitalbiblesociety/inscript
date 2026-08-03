import { describe, it, expect, beforeEach } from 'vitest';
import { AppSettings } from '@common/AppSettings.js';
import { getConfig, updateConfig } from '@core/config.js';

describe('AppSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns the defaults when nothing is stored', () => {
    const value = AppSettings.getValue('window-1', { color: 'blue', size: 12 });
    expect(value).toEqual({ color: 'blue', size: 12 });
  });

  it('returns {} when no key, no value, no defaults', () => {
    expect(AppSettings.getValue('untouched')).toEqual({});
  });

  it('round-trips a value through localStorage', () => {
    AppSettings.setValue('w1', { ref: 'JN3_16', font: 'serif' });
    const value = AppSettings.getValue('w1', { font: 'sans' });
    expect(value).toEqual({ ref: 'JN3_16', font: 'serif' });
  });

  it('merges stored value over defaults (stored wins)', () => {
    AppSettings.setValue('w2', { font: 'serif' });
    expect(AppSettings.getValue('w2', { font: 'sans', size: 14 })).toEqual({ font: 'serif', size: 14 });
  });

  it('removeValue clears the stored entry', () => {
    AppSettings.setValue('w3', { ref: 'JN3' });
    AppSettings.removeValue('w3');
    expect(AppSettings.getValue('w3', { ref: 'GN1' })).toEqual({ ref: 'GN1' });
  });

  it('uses the configured prefix in localStorage', () => {
    AppSettings.setValue('w4', { x: 1 });
    const keys = Object.keys(window.localStorage);
    expect(keys.some(k => k.endsWith('w4'))).toBe(true);
  });

  it('returns defaults when stored value is malformed JSON', () => {
    AppSettings.setValue('w5', { ok: true });
    const fullKey = Object.keys(window.localStorage).find(k => k.endsWith('w5'));
    window.localStorage.setItem(fullKey, '{not json');
    expect(AppSettings.getValue('w5', { ok: false })).toEqual({ ok: false });
  });

  describe('clearAll', () => {
    it('removes every stored setting and reports the count', () => {
      AppSettings.setValue('config-theme', { themeName: 'jabbok' });
      AppSettings.setValue('config-font-size', { fontSize: 24 });

      expect(AppSettings.clearAll()).toBe(2);
      expect(AppSettings.getValue('config-theme', { themeName: 'default' })).toEqual({ themeName: 'default' });
      expect(AppSettings.getValue('config-font-size', { fontSize: 18 })).toEqual({ fontSize: 18 });
    });

    it('leaves notes and highlights alone', () => {
      AppSettings.setValue('config-theme', { themeName: 'shiloh' });
      window.localStorage.setItem('browserbible_notes', '{"version":1,"notes":[]}');
      window.localStorage.setItem('browserbible_highlights', '{"ENGWEB":[]}');

      AppSettings.clearAll();

      expect(window.localStorage.getItem('browserbible_notes')).toBe('{"version":1,"notes":[]}');
      expect(window.localStorage.getItem('browserbible_highlights')).toBe('{"ENGWEB":[]}');
    });

    it('refuses to run on a blank prefix rather than wiping unprefixed keys', () => {
      const config = getConfig();
      const prefix = config.settingsPrefix;
      window.localStorage.setItem('browserbible_notes', 'keep me');

      updateConfig({ settingsPrefix: '' });
      try {
        expect(AppSettings.clearAll()).toBe(0);
      } finally {
        updateConfig({ settingsPrefix: prefix });
      }

      expect(window.localStorage.getItem('browserbible_notes')).toBe('keep me');
    });
  });
});

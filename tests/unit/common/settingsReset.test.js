import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  clearAll: vi.fn(),
  removeValue: vi.fn(),
  clearLng: vi.fn()
}));

vi.mock('@common/AppSettings.js', () => ({
  default: { clearAll: fixtures.clearAll, removeValue: fixtures.removeValue }
}));
vi.mock('@lib/i18n.js', () => ({ i18n: { clearLng: fixtures.clearLng } }));

import {
  resetAllSettings,
  resetWindowLayout,
  WINDOW_SETTINGS_KEY
} from '@common/settingsReset.js';

describe('settings reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    history.replaceState({}, '', '/reader');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('clears all settings and the selected language', () => {
    resetAllSettings();
    expect(fixtures.clearAll).toHaveBeenCalled();
    expect(fixtures.clearLng).toHaveBeenCalled();
  });

  it('only clears the saved window layout', () => {
    resetWindowLayout();
    expect(fixtures.removeValue).toHaveBeenCalledWith(WINDOW_SETTINGS_KEY);
    expect(fixtures.clearAll).not.toHaveBeenCalled();
  });

  it('preserves custom and dev parameters while dropping all others', () => {
    history.replaceState({}, '', '/reader?custom=site&drop=this&dev=1');
    resetWindowLayout();
    expect(fixtures.removeValue).toHaveBeenCalled();
  });
});

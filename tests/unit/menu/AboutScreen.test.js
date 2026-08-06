import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  instances: [],
  getWindowIcon: vi.fn(() => '<svg></svg>'),
  t: vi.fn(() => 'About translated')
}));

vi.mock('@lib/i18n.js', () => ({ i18n: { t: fixtures.t } }));
vi.mock('@core/windowIcons.js', () => ({ getWindowIcon: fixtures.getWindowIcon }));
vi.mock('@ui/MovableWindow.js', () => ({
  MovableWindow: class MovableWindow {
    constructor(width, height, title) {
      this.args = [width, height, title];
      this.body = document.createElement('div');
      this.title = document.createElement('div');
      this.visible = false;
      this.size = vi.fn(() => this);
      this.show = vi.fn(() => { this.visible = true; return this; });
      this.hide = vi.fn(() => { this.visible = false; return this; });
      this.isVisible = vi.fn(() => this.visible);
      fixtures.instances.push(this);
    }
  }
}));

import { AboutScreen } from '@menu/AboutScreen.js';

const clickAndSettle = async (button) => {
  button.click();
  await vi.waitFor(() => expect(fixtures.instances.length).toBeGreaterThan(0));
};

describe('AboutScreen', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="main-menu-features"></div>' +
      '<div id="main-menu-dropdown" popover></div>';
    vi.clearAllMocks();
    fixtures.instances.length = 0;
    fixtures.getWindowIcon.mockReturnValue('<svg></svg>');
    document.querySelector('#main-menu-dropdown').hidePopover = vi.fn();
    Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(globalThis, 'innerHeight', { configurable: true, value: 700 });
  });

  it('adds the translated menu button with its icon', () => {
    const button = AboutScreen();
    expect(button.parentNode).toBe(document.querySelector('#main-menu-features'));
    expect(button.querySelector('.main-menu-icon').innerHTML).toContain('svg');
    expect(button.querySelector('[data-i18n]')).toBeTruthy();
  });

  it('lazily builds, sizes, and shows one reusable about window', async () => {
    const dropdown = document.querySelector('#main-menu-dropdown');
    dropdown.hidePopover = vi.fn();
    const button = AboutScreen();
    expect(fixtures.instances, 'window must not be built before the click').toHaveLength(0);
    await clickAndSettle(button);
    const win = fixtures.instances[0];
    expect(fixtures.instances).toHaveLength(1);
    expect(win.args).toEqual([500, 250, 'About translated']);
    expect(win.body.querySelector('.about-screen')).toBeTruthy();
    expect(win.title.classList.contains('i18n')).toBe(true);
    expect(win.title.dataset.i18n).toBe('[html]menu.labels.about');
    expect(dropdown.hidePopover).toHaveBeenCalled();
    expect(win.size).toHaveBeenCalledWith(800, 700);
    expect(win.show).toHaveBeenCalled();

    win.visible = false;
    await clickAndSettle(button);
    expect(fixtures.instances, 'the import and window are cached across clicks').toHaveLength(1);
  });

  it('hides an already visible window and does not reopen it', async () => {
    const button = AboutScreen();
    await clickAndSettle(button);
    const win = fixtures.instances[0];
    win.size.mockClear();
    win.show.mockClear();
    button.click();
    await vi.waitFor(() => expect(win.hide).toHaveBeenCalled());
    expect(win.size).not.toHaveBeenCalled();
    expect(win.show).not.toHaveBeenCalled();
  });

  it('works without optional menu containers and with no icon', () => {
    document.body.innerHTML = '';
    fixtures.getWindowIcon.mockReturnValue(null);
    const button = AboutScreen();
    expect(button.isConnected).toBe(false);
    expect(button.querySelector('.main-menu-icon').innerHTML).toBe('');
    expect(() => button.click()).not.toThrow();
  });
});

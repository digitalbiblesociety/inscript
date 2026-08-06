import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: {},
  types: [],
  app: null,
  values: new Map(),
  icon: vi.fn(type => `<svg>${type}</svg>`),
  preservePlace: vi.fn(callback => callback()),
  setValue: vi.fn(),
  getValue: vi.fn((key, fallback) => fixtures.values.get(key) ?? fallback),
  resetWindowLayout: vi.fn(),
  promptSettingsReset: vi.fn(),
  tour: null
}));

vi.mock('@common/AppSettings.js', () => ({
  default: {
    getValue: fixtures.getValue,
    setValue: fixtures.setValue
  }
}));

vi.mock('@common/PlaceKeeper.js', () => ({
  PlaceKeeper: { preservePlace: fixtures.preservePlace }
}));

vi.mock('@common/settingsReset.js', () => ({
  resetWindowLayout: fixtures.resetWindowLayout
}));

vi.mock('@core/config.js', () => ({
  getConfig: () => fixtures.config
}));

vi.mock('@core/registry.js', () => ({
  getAllWindowTypes: () => fixtures.types,
  getApp: () => fixtures.app
}));

vi.mock('@core/windowIcons.js', () => ({
  getWindowIcon: fixtures.icon
}));

vi.mock('@menu/GuidedTour/GuidedTour.js', () => ({
  getGuidedTour: () => fixtures.tour
}));

vi.mock('@menu/ResetSettingsButton.js', () => ({
  promptSettingsReset: fixtures.promptSettingsReset
}));

import { registerPaletteCommands } from '@menu/CommandPaletteCommands.js';

function makePalette() {
  const palette = {
    commands: [],
    filteredItems: [{ name: 'visible' }],
    registerCommand: vi.fn(command => palette.commands.push(command)),
    close: vi.fn(),
    renderItems: vi.fn()
  };
  return palette;
}

function command(palette, name) {
  return palette.commands.find(item => item.name === name);
}

function installConfig(overrides = {}) {
  fixtures.config = {
    settingToggleNames: ['Red Letters', 'Verse Numbers'],
    settingToggleDefaults: [true, false],
    disabledWindowTypes: ['HiddenWindow'],
    windowTypesOrder: ['AudioWindow', 'BibleWindow', 'HiddenWindow', 'MissingWindow'],
    newWindowFragmentid: 'MT2_1',
    fontFamilyStacks: { 'Source Sans': 'sans-serif', Serif: 'serif' },
    fontSizeMin: 12,
    fontSizeMax: 24,
    fontSizeStep: 3,
    fontSizeDefault: 18,
    ...overrides
  };
  fixtures.types = [
    { className: 'BibleWindow', param: 'bible', init: { textid: 'eng-kjv' } },
    { className: 'AudioWindow', param: 'audio', init: { autoplay: false } },
    { className: 'SearchWindow', param: 'search' },
    { className: 'HiddenWindow', param: 'hidden' }
  ];
}

describe('command palette command registration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    fixtures.values.clear();
    fixtures.app = null;
    fixtures.tour = null;
    fixtures.icon.mockImplementation(type => `<svg>${type}</svg>`);
    installConfig();
    vi.clearAllMocks();
    fixtures.preservePlace.mockImplementation(callback => callback());
    fixtures.getValue.mockImplementation((key, fallback) => fixtures.values.get(key) ?? fallback);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers configured themes, toggles, ordered windows, fonts, and actions', () => {
    const palette = makePalette();
    registerPaletteCommands(palette);

    expect(palette.commands.map(item => item.name)).toEqual([
      'Theme: Normal', 'Theme: Shiloh', 'Theme: Jabbok', 'Theme: Gethsemane',
      'Toggle: Red Letters', 'Toggle: Verse Numbers',
      'Add Window: Audio', 'Add Window: Bible',
      'Font: Source Sans', 'Font: Serif',
      'Font Size: Increase', 'Font Size: Decrease',
      'Toggle Fullscreen', 'Guided Tour', 'Focus Search', 'Reset Settings',
      'Restore Default Windows'
    ]);
    expect(command(palette, 'Toggle: Red Letters')).toMatchObject({
      category: 'toggle',
      stayOpen: true
    });
    expect(command(palette, 'Add Window: Audio').icon).toBe('<svg>AudioWindow</svg>');
    expect(command(palette, 'Guided Tour').icon).toBe('<svg>tour</svg>');
  });

  it('uses all window types when no explicit order is configured and nulls absent icons', () => {
    installConfig({ windowTypesOrder: [] });
    fixtures.icon.mockReturnValue('');
    const palette = makePalette();
    registerPaletteCommands(palette);

    expect(command(palette, 'Add Window: Bible').icon).toBeNull();
    expect(command(palette, 'Add Window: Audio')).toBeTruthy();
    expect(command(palette, 'Add Window: Search')).toBeTruthy();
    expect(command(palette, 'Add Window: Hidden')).toBeUndefined();
  });

  it('supports omitted optional configuration collections', () => {
    fixtures.config = {};
    fixtures.types = [];
    const palette = makePalette();

    expect(() => registerPaletteCommands(palette)).not.toThrow();
    expect(palette.commands.map(item => item.name)).toEqual([
      'Theme: Normal', 'Theme: Shiloh', 'Theme: Jabbok', 'Theme: Gethsemane',
      'Font Size: Increase', 'Font Size: Decrease',
      'Toggle Fullscreen', 'Guided Tour', 'Focus Search', 'Reset Settings',
      'Restore Default Windows'
    ]);
  });

  it.each([
    ['Theme: Normal', 'default'],
    ['Theme: Shiloh', 'shiloh'],
    ['Theme: Jabbok', 'jabbok'],
    ['Theme: Gethsemane', 'gethsemane']
  ])('applies %s and clears every prior theme', (name, themeName) => {
    const palette = makePalette();
    registerPaletteCommands(palette);
    document.body.className = 'theme-default theme-shiloh theme-jabbok theme-gethsemane';

    command(palette, name).execute();

    expect(document.body.className).toBe(`theme-${themeName}`);
    expect(fixtures.setValue).toHaveBeenCalledWith('config-theme', { themeName });
    expect(palette.close).toHaveBeenCalled();
  });

  it('reports toggle state for boolean and serialized settings', () => {
    const palette = makePalette();
    fixtures.values.set('redletters', { checked: 'true' });
    fixtures.values.set('versenumbers', { checked: false });
    registerPaletteCommands(palette);

    expect(command(palette, 'Toggle: Red Letters').state()).toBe('ON');
    expect(command(palette, 'Toggle: Verse Numbers').state()).toBe('OFF');
  });

  it('toggles settings, DOM controls, body classes, and re-renders in place', () => {
    document.body.innerHTML = '<label id="config-toggle-redletters"><input type="checkbox"></label>';
    const palette = makePalette();
    fixtures.values.set('redletters', { checked: false });
    registerPaletteCommands(palette);

    command(palette, 'Toggle: Red Letters').execute();

    const toggle = document.querySelector('#config-toggle-redletters');
    expect(fixtures.preservePlace).toHaveBeenCalled();
    expect(toggle.classList).toContain('toggle-on');
    expect(toggle.querySelector('input').checked).toBe(true);
    expect(document.body.classList).toContain('toggle-redletters-on');
    expect(document.body.classList).not.toContain('toggle-redletters-off');
    expect(fixtures.setValue).toHaveBeenCalledWith('redletters', { checked: true });
    expect(palette.renderItems).toHaveBeenCalledWith(palette.filteredItems);

    fixtures.values.set('redletters', { checked: true });
    command(palette, 'Toggle: Red Letters').execute();
    expect(toggle.querySelector('input').checked).toBe(false);
    expect(document.body.classList).toContain('toggle-redletters-off');
  });

  it('still persists a toggle when its settings control is absent', () => {
    const palette = makePalette();
    registerPaletteCommands(palette);
    expect(() => command(palette, 'Toggle: Verse Numbers').execute()).not.toThrow();
    expect(fixtures.setValue).toHaveBeenCalledWith('versenumbers', { checked: true });
  });

  it('adds a linked window at the current Bible location and preserves init data', () => {
    const add = vi.fn();
    fixtures.app = {
      windowManager: {
        getWindows: () => [
          { className: 'SearchWindow', getData: vi.fn() },
          { className: 'BibleWindow', getData: () => ({
            textid: 'spa-rvr', sectionid: 'LK2', fragmentid: 'LK2_4'
          }) }
        ],
        add
      }
    };
    const palette = makePalette();
    registerPaletteCommands(palette);

    command(palette, 'Add Window: Audio').execute();

    expect(add).toHaveBeenCalledWith('AudioWindow', {
      autoplay: false,
      fragmentid: 'LK2_4',
      sectionid: 'LK2',
      _activeBibleTextid: 'spa-rvr'
    });
    expect(fixtures.preservePlace).toHaveBeenCalled();
    expect(palette.close).toHaveBeenCalled();
  });

  it('adds Bible windows with configured fallback location when no text window exists', () => {
    const add = vi.fn();
    fixtures.app = { windowManager: { getWindows: () => [], add } };
    const palette = makePalette();
    registerPaletteCommands(palette);

    command(palette, 'Add Window: Bible').execute();

    expect(add).toHaveBeenCalledWith('BibleWindow', {
      textid: 'eng-kjv', fragmentid: 'MT2_1', sectionid: 'MT2'
    });
  });

  it('uses JN1_1 by default and safely executes without an app', () => {
    installConfig({ newWindowFragmentid: undefined });
    const palette = makePalette();
    registerPaletteCommands(palette);

    expect(() => command(palette, 'Add Window: Bible').execute()).not.toThrow();
    expect(palette.close).toHaveBeenCalled();
  });

  it('keeps unlinked window init data without adding passage fields', () => {
    installConfig({ windowTypesOrder: [] });
    const add = vi.fn();
    fixtures.app = { windowManager: { getWindows: () => [], add } };
    const palette = makePalette();
    registerPaletteCommands(palette);

    command(palette, 'Add Window: Search').execute();
    expect(add).toHaveBeenCalledWith('SearchWindow', {});
  });

  it('applies slugged font classes, checks its radio, and closes', () => {
    document.body.innerHTML = `
      <input id="config-font-family-source-sans-value" type="radio">
      <input id="config-font-family-serif-value" type="radio">`;
    document.body.className = 'config-font-family-serif';
    const palette = makePalette();
    registerPaletteCommands(palette);

    command(palette, 'Font: Source Sans').execute();

    expect(document.body.classList).toContain('config-font-family-source-sans');
    expect(document.body.classList).not.toContain('config-font-family-serif');
    expect(fixtures.setValue).toHaveBeenCalledWith('config-font-family', { fontName: 'Source Sans' });
    expect(document.querySelector('#config-font-family-source-sans-value').checked).toBe(true);
    expect(palette.close).toHaveBeenCalled();
  });

  it('applies a font even when its radio is absent', () => {
    const palette = makePalette();
    registerPaletteCommands(palette);
    expect(() => command(palette, 'Font: Serif').execute()).not.toThrow();
    expect(document.body.classList).toContain('config-font-family-serif');
  });

  it('increases, decreases, and clamps font size while syncing a slider', () => {
    document.body.innerHTML = '<input class="settings-slider" type="range">';
    document.body.className = 'config-font-size-12 config-font-size-18';
    fixtures.values.set('config-font-size', { fontSize: '23' });
    const palette = makePalette();
    registerPaletteCommands(palette);

    command(palette, 'Font Size: Increase').execute();
    expect(fixtures.setValue).toHaveBeenLastCalledWith('config-font-size', { fontSize: 24 });
    expect(document.body.classList).toContain('config-font-size-24');
    expect(document.body.classList).not.toContain('config-font-size-12');
    expect(document.querySelector('.settings-slider').value).toBe('24');

    fixtures.values.set('config-font-size', { fontSize: '12' });
    command(palette, 'Font Size: Decrease').execute();
    expect(fixtures.setValue).toHaveBeenLastCalledWith('config-font-size', { fontSize: 12 });
    expect(document.body.classList).toContain('config-font-size-12');
  });

  it('uses fallback font size for invalid stored data and tolerates no slider', () => {
    fixtures.values.set('config-font-size', { fontSize: 'not-a-number' });
    const palette = makePalette();
    registerPaletteCommands(palette);

    command(palette, 'Font Size: Increase').execute();
    expect(fixtures.setValue).toHaveBeenCalledWith('config-font-size', { fontSize: 21 });
  });

  it('handles fullscreen disabled, entry, and exit paths', async () => {
    const palette = makePalette();
    registerPaletteCommands(palette);
    const fullscreen = command(palette, 'Toggle Fullscreen');
    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
    fullscreen.execute();
    expect(palette.close).toHaveBeenCalledTimes(1);

    const request = vi.fn();
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    Object.defineProperty(document.documentElement, 'requestFullscreen', { value: request, configurable: true });
    fullscreen.execute();
    expect(request).toHaveBeenCalled();

    const exit = vi.fn();
    Object.defineProperty(document, 'fullscreenElement', { value: document.body, configurable: true });
    Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });
    fullscreen.execute();
    expect(exit).toHaveBeenCalled();
  });

  it('runs guided tour, focus, reset, and restore actions with their close semantics', () => {
    const input = document.createElement('input');
    input.id = 'main-search-input';
    document.body.appendChild(input);
    const focus = vi.spyOn(input, 'focus');
    fixtures.tour = { start: vi.fn() };
    const palette = makePalette();
    registerPaletteCommands(palette);

    command(palette, 'Guided Tour').execute();
    expect(fixtures.tour.start).toHaveBeenCalled();
    command(palette, 'Focus Search').execute();
    expect(focus).toHaveBeenCalled();
    command(palette, 'Reset Settings').execute();
    expect(fixtures.promptSettingsReset).toHaveBeenCalled();
    expect(palette.close).toHaveBeenCalledTimes(3);

    command(palette, 'Restore Default Windows').execute();
    expect(fixtures.resetWindowLayout).toHaveBeenCalled();
    expect(palette.close).toHaveBeenCalledTimes(3);
  });

  it('safely runs nullable guided-tour and focus actions', () => {
    const palette = makePalette();
    registerPaletteCommands(palette);
    expect(() => command(palette, 'Guided Tour').execute()).not.toThrow();
    expect(() => command(palette, 'Focus Search').execute()).not.toThrow();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: { newBibleWindowVersion: 'DEFAULT' },
  app: null,
  preservePlace: vi.fn(callback => callback()),
  locationChange: vi.fn(),
  validReference: true,
  Reference: vi.fn(function Reference(text) {
    return {
      text,
      isValid: () => fixtures.validReference,
      toString: () => `Reference ${text}`,
      toSection: () => text.replace(':', '_')
    };
  })
}));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));
vi.mock('@core/registry.js', () => ({ getApp: () => fixtures.app }));
vi.mock('@common/PlaceKeeper.js', () => ({ PlaceKeeper: { preservePlace: fixtures.preservePlace } }));
vi.mock('@common/TextNavigation.js', () => ({ TextNavigation: { locationChange: fixtures.locationChange } }));
vi.mock('@bible/BibleReference.js', () => ({ Reference: fixtures.Reference }));
vi.mock('@lib/i18n.js', () => ({ t: vi.fn(() => 'Search') }));

import { MainSearchBox } from '@menu/MainSearchBox.js';

function setup() {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const box = MainSearchBox(parent);
  return {
    parent, box,
    input: parent.querySelector('#main-search-input'),
    button: parent.querySelector('#main-search-button'),
    suggestions: parent.querySelector('#main-search-suggestions')
  };
}

function key(input, key) {
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('MainSearchBox', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useFakeTimers();
    fixtures.validReference = true;
    fixtures.config = { newBibleWindowVersion: 'local:DEFAULT' };
    fixtures.app = {
      windowManager: { getSettings: vi.fn(() => []), getWindows: vi.fn(() => []), add: vi.fn() }
    };
    fixtures.preservePlace.mockImplementation(callback => callback());
  });

  afterEach(() => vi.useRealTimers());

  it('builds safely with or without a parent', () => {
    const { box, suggestions } = setup();
    expect(box.id).toBe('main-search-box');
    expect(suggestions.style.display).toBe('none');
    expect(MainSearchBox(null).isConnected).toBe(false);
  });

  it('renders escaped search and navigation suggestions for valid references', () => {
    const { input, suggestions } = setup();
    input.value = '<John 3:16>';
    input.dispatchEvent(new Event('input'));
    expect(suggestions.querySelectorAll('.suggestion-item')).toHaveLength(2);
    expect(suggestions.innerHTML).toContain('&lt;John 3:16&gt;');
    expect(suggestions.textContent).toContain('DEFAULT');
    expect(suggestions.style.display).toBe('block');
  });

  it('renders only text search for invalid references and hides for empty input', () => {
    fixtures.validReference = false;
    const { input, suggestions } = setup();
    input.value = 'words';
    input.dispatchEvent(new Event('input'));
    expect(suggestions.querySelectorAll('.suggestion-item')).toHaveLength(1);
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    expect(suggestions.style.display).toBe('none');
    expect(suggestions.children).toHaveLength(0);
  });

  it('wraps keyboard selection in both directions and escapes', () => {
    const { input, suggestions } = setup();
    key(input, 'ArrowDown');
    input.value = 'JN3:16';
    input.dispatchEvent(new Event('input'));
    key(input, 'ArrowUp');
    expect(suggestions.children[1].classList.contains('selected')).toBe(true);
    key(input, 'ArrowDown');
    expect(suggestions.children[0].classList.contains('selected')).toBe(true);
    key(input, 'Escape');
    expect(suggestions.style.display).toBe('none');
  });

  it('navigates all Bible windows from the selected reference', () => {
    const first = { className: 'BibleWindow', controller: { scroller: { load: vi.fn() } } };
    const second = { className: 'BibleWindow', controller: {} };
    fixtures.app.windowManager.getWindows.mockReturnValue([first, { className: 'NotesWindow' }, second]);
    const { input, suggestions } = setup();
    input.value = 'JN3:16';
    input.dispatchEvent(new Event('input'));
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(fixtures.locationChange).toHaveBeenCalledWith('JN3_16');
    expect(first.controller.scroller.load).toHaveBeenCalledWith('text', 'JN3_16');
    expect(input.value).toBe('');
    expect(suggestions.style.display).toBe('none');
  });

  it('does not broadcast navigation when no Bible window is open', () => {
    const { input } = setup();
    input.value = 'JN3:16';
    input.dispatchEvent(new Event('input'));
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(fixtures.locationChange).not.toHaveBeenCalled();
  });

  it('searches with the first saved Bible version', () => {
    fixtures.app.windowManager.getSettings.mockReturnValue([
      { windowType: 'NotesWindow', data: {} },
      { windowType: 'BibleWindow', data: { textid: 'SAVED' } }
    ]);
    fixtures.validReference = false;
    const { input } = setup();
    input.value = 'grace';
    input.dispatchEvent(new Event('input'));
    key(input, 'Enter');
    expect(fixtures.app.windowManager.add).toHaveBeenCalledWith('SearchWindow', {
      searchtext: 'grace', textid: 'SAVED'
    });
    expect(fixtures.preservePlace).toHaveBeenCalled();
  });

  it('selects suggestions by hover and nested mousedown', () => {
    fixtures.validReference = false;
    const { input, suggestions } = setup();
    input.value = 'faith';
    input.dispatchEvent(new Event('input'));
    const item = suggestions.firstElementChild;
    item.appendChild(document.createElement('span'));
    item.lastChild.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    item.lastChild.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(fixtures.app.windowManager.add).toHaveBeenCalled();
  });

  it('uses the button for suggestions or a raw nonempty input', () => {
    fixtures.validReference = false;
    const { input, button } = setup();
    input.value = 'hope';
    button.click();
    expect(fixtures.app.windowManager.add).toHaveBeenLastCalledWith('SearchWindow', {
      searchtext: 'hope', textid: 'local:DEFAULT'
    });
    input.value = 'love';
    input.dispatchEvent(new Event('input'));
    button.click();
    expect(fixtures.app.windowManager.add).toHaveBeenLastCalledWith('SearchWindow', {
      searchtext: 'love', textid: 'local:DEFAULT'
    });
    input.value = '';
    button.click();
  });

  it('refreshes on focus and delays hiding after blur', () => {
    const { input, suggestions } = setup();
    input.value = 'word';
    input.dispatchEvent(new FocusEvent('focus'));
    expect(suggestions.style.display).toBe('block');
    input.dispatchEvent(new FocusEvent('blur'));
    vi.advanceTimersByTime(149);
    expect(suggestions.style.display).toBe('block');
    vi.advanceTimersByTime(1);
    expect(suggestions.style.display).toBe('none');
    input.value = '';
    input.dispatchEvent(new FocusEvent('focus'));
  });
});

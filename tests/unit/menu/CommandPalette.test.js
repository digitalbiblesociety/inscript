import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  app: null,
  locationChange: vi.fn(),
  register: vi.fn()
}));

vi.mock('@common/TextNavigation.js', () => ({
  TextNavigation: { locationChange: fixtures.locationChange }
}));

vi.mock('@core/registry.js', () => ({
  getApp: () => fixtures.app
}));

vi.mock('@core/windowIcons.js', () => ({
  getWindowIcon: type => type === 'BibleWindow' ? '<svg>bible</svg>' : ''
}));

vi.mock('@menu/CommandPaletteCommands.js', () => ({
  registerPaletteCommands: palette => fixtures.register(palette)
}));

import { CommandPalette } from '@menu/CommandPalette.js';

function makePalette(commands = []) {
  fixtures.register.mockImplementation(palette => {
    for (const command of commands) palette.registerCommand(command);
  });
  return new CommandPalette();
}

describe('CommandPalette', () => {
  let documentKeydown;

  beforeEach(() => {
    document.body.innerHTML = '';
    fixtures.app = null;
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', vi.fn(callback => {
      callback();
      return 1;
    }));
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true
    });
    vi.spyOn(document, 'addEventListener').mockImplementation((type, callback) => {
      if (type === 'keydown') documentKeydown = callback;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('builds the palette UI and registers configured commands', () => {
    const execute = vi.fn();
    const palette = makePalette([{ name: 'Example', keywords: ['sample'], execute }]);

    expect(fixtures.register).toHaveBeenCalledWith(palette);
    expect(palette.commands).toHaveLength(1);
    expect(document.body.contains(palette.backdrop)).toBe(true);
    expect(palette.input.placeholder).toContain('Bible reference');
    expect(palette.results.classList).toContain('command-palette-results');
  });

  it('opens once, renders help, focuses input, and resets state', () => {
    const palette = makePalette();
    const focus = vi.spyOn(palette.input, 'focus');
    palette.input.value = 'old';
    palette.selectedIndex = 9;

    palette.open();

    expect(palette.isOpen).toBe(true);
    expect(palette.input.value).toBe('');
    expect(palette.selectedIndex).toBe(0);
    expect(palette.backdrop.classList).toContain('open');
    expect(palette.results.textContent).toContain('Type a Bible reference');
    expect(focus).toHaveBeenCalled();

    focus.mockClear();
    palette.open();
    expect(focus).not.toHaveBeenCalled();
  });

  it('closes once and clears transient input and filtered state', () => {
    const palette = makePalette();
    palette.close();
    expect(palette.isOpen).toBe(false);

    palette.open();
    palette.input.value = '> theme';
    palette.filteredItems = [{ name: 'Theme' }];
    palette.close();

    expect(palette.isOpen).toBe(false);
    expect(palette.backdrop.classList).not.toContain('open');
    expect(palette.input.value).toBe('');
    expect(palette.filteredItems).toEqual([]);
  });

  it('renders no-results help and rich command rows', () => {
    const palette = makePalette();
    palette.renderItems([]);
    expect(palette.results.textContent).toBe('No results found');

    palette.selectedIndex = 1;
    palette.renderItems([
      { name: 'Plain' },
      {
        name: 'Rich',
        icon: '<svg>icon</svg>',
        state: () => 'ON',
        category: 'theme'
      }
    ]);

    const rows = palette.results.querySelectorAll('.command-palette-item');
    expect(rows).toHaveLength(2);
    expect(rows[0].classList).not.toContain('selected');
    expect(rows[0].querySelector('.command-palette-item-icon')).toBeNull();
    expect(rows[1].classList).toContain('selected');
    expect(rows[1].querySelector('.command-palette-item-icon').innerHTML).toContain('svg');
    expect(rows[1].querySelector('.command-palette-item-state').textContent).toBe('ON');
    expect(rows[1].querySelector('.command-palette-item-category').textContent).toBe('theme');
  });

  it('wraps selection in both directions and scrolls the active row', () => {
    const palette = makePalette();
    palette.filteredItems = [{ name: 'One' }, { name: 'Two' }];
    palette.renderItems(palette.filteredItems);

    palette.updateSelection(-1);
    expect(palette.selectedIndex).toBe(1);
    expect(palette.results.children[1].classList).toContain('selected');
    expect(palette.results.children[1].scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

    palette.updateSelection(2);
    expect(palette.selectedIndex).toBe(0);
    expect(palette.results.children[0].classList).toContain('selected');

    palette.filteredItems = [];
    palette.selectedIndex = 7;
    palette.updateSelection(0);
    expect(palette.selectedIndex).toBe(7);
  });

  it('filters commands case-insensitively by name and keyword', () => {
    const palette = makePalette([
      { name: 'Theme: Shiloh', keywords: ['color', 'dark'] },
      { name: 'Focus Search', keywords: ['find'] },
      { name: 'No Keywords' }
    ]);

    expect(palette.filterCommands('THEME').map(item => item.name)).toEqual(['Theme: Shiloh']);
    expect(palette.filterCommands('dark').map(item => item.name)).toEqual(['Theme: Shiloh']);
    expect(palette.filterCommands('missing')).toEqual([]);
  });

  it('returns no navigation command for an invalid reference', () => {
    const palette = makePalette();
    expect(palette.getNavigationItems('not a reference')).toEqual([]);
  });

  it('navigates every Bible window and ignores other window types', () => {
    const loadOne = vi.fn();
    const loadTwo = vi.fn();
    fixtures.app = {
      windowManager: {
        getWindows: () => [
          { className: 'BibleWindow', controller: { scroller: { load: loadOne } } },
          { className: 'SearchWindow', controller: { scroller: { load: vi.fn() } } },
          { className: 'BibleWindow', controller: { scroller: { load: loadTwo } } }
        ]
      }
    };
    const palette = makePalette();
    palette.open();
    const [item] = palette.getNavigationItems('John 3:16');

    expect(item).toMatchObject({
      name: 'Go to John 3:16',
      category: 'navigate',
      icon: '<svg>bible</svg>'
    });
    item.execute();

    expect(fixtures.locationChange).toHaveBeenCalledWith('JN3_16');
    expect(loadOne).toHaveBeenCalledWith('text', 'JN3_16');
    expect(loadTwo).toHaveBeenCalledWith('text', 'JN3_16');
    expect(palette.isOpen).toBe(false);
  });

  it('safely closes navigation commands without an app or Bible windows', () => {
    const palette = makePalette();
    const close = vi.spyOn(palette, 'close');
    palette.getNavigationItems('Genesis 1')[0].execute();
    expect(fixtures.locationChange).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();

    fixtures.app = { windowManager: { getWindows: () => [{ className: 'SearchWindow' }] } };
    palette.getNavigationItems('Genesis 1')[0].execute();
    expect(fixtures.locationChange).not.toHaveBeenCalled();
  });

  it('tolerates Bible windows without a loaded scroller', () => {
    fixtures.app = {
      windowManager: {
        getWindows: () => [{ className: 'BibleWindow', controller: null }]
      }
    };
    const palette = makePalette();
    expect(() => palette.getNavigationItems('Genesis 1')[0].execute()).not.toThrow();
    expect(fixtures.locationChange).toHaveBeenCalledWith('GN1');
  });

  it('shows help for empty input and filters command-mode input', () => {
    const palette = makePalette([
      { name: 'Theme: Shiloh', keywords: ['dark'] },
      { name: 'Focus Search', keywords: ['find'] }
    ]);
    palette.selectedIndex = 4;
    palette.input.value = '';
    palette.handleInput();
    expect(palette.filteredItems).toEqual([]);
    expect(palette.selectedIndex).toBe(0);
    expect(palette.results.textContent).toContain('Type a Bible reference');

    palette.input.value = '>';
    palette.handleInput();
    expect(palette.filteredItems).toHaveLength(2);

    palette.input.value = '> dark';
    palette.handleInput();
    expect(palette.filteredItems.map(item => item.name)).toEqual(['Theme: Shiloh']);
    expect(palette.results.textContent).toContain('Theme: Shiloh');
  });

  it('renders valid and invalid navigation input', () => {
    const palette = makePalette();
    palette.input.value = 'John 3';
    palette.handleInput();
    expect(palette.filteredItems[0].name).toBe('Go to John 3');

    palette.input.value = 'nonsense';
    palette.handleInput();
    expect(palette.filteredItems).toEqual([]);
    expect(palette.results.textContent).toBe('No results found');
  });

  it('executes the selected command and safely ignores an empty selection', () => {
    const execute = vi.fn();
    const palette = makePalette();
    palette.filteredItems = [{ execute }];
    palette.executeSelected();
    expect(execute).toHaveBeenCalled();

    palette.filteredItems = [];
    expect(() => palette.executeSelected()).not.toThrow();
  });

  it.each([
    ['Escape', 'close'],
    ['ArrowDown', 'down'],
    ['ArrowUp', 'up'],
    ['Enter', 'execute']
  ])('handles the %s input key', (key, action) => {
    const execute = vi.fn();
    const palette = makePalette();
    palette.filteredItems = [{ execute }, { execute: vi.fn() }];
    palette.renderItems(palette.filteredItems);
    palette.open();
    const event = { key, preventDefault: vi.fn() };

    palette.handleInputKeydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    if (action === 'close') expect(palette.isOpen).toBe(false);
    if (action === 'down') expect(palette.selectedIndex).toBe(1);
    if (action === 'up') expect(palette.selectedIndex).toBe(1);
    if (action === 'execute') expect(execute).toHaveBeenCalled();
  });

  it('ignores unsupported input keys', () => {
    const palette = makePalette();
    const event = { key: 'Tab', preventDefault: vi.fn() };
    palette.handleInputKeydown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('responds to native input, keyboard, backdrop, and result events', () => {
    const first = vi.fn();
    const second = vi.fn();
    const palette = makePalette([
      { name: 'First', keywords: ['one'], execute: first },
      { name: 'Second', keywords: ['two'], execute: second }
    ]);
    palette.open();
    palette.input.value = '>';
    palette.input.dispatchEvent(new Event('input'));
    expect(palette.filteredItems).toHaveLength(2);

    palette.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(palette.selectedIndex).toBe(1);

    const secondLabel = palette.results.children[1].querySelector('.command-palette-item-label');
    secondLabel.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(palette.selectedIndex).toBe(1);
    secondLabel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(second).toHaveBeenCalled();

    palette.open();
    palette.backdrop.firstElementChild.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(palette.isOpen).toBe(true);
    palette.backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(palette.isOpen).toBe(false);
  });

  it('ignores result events outside rows', () => {
    const palette = makePalette();
    expect(() => palette.handleResultEvent({ target: document.body }, true)).not.toThrow();
  });

  it('toggles from the global Ctrl/Cmd+K shortcut and ignores other keys', () => {
    const palette = makePalette();
    const ignored = { key: 'k', ctrlKey: false, metaKey: false, preventDefault: vi.fn() };
    documentKeydown(ignored);
    expect(ignored.preventDefault).not.toHaveBeenCalled();

    const wrongKey = { key: 'x', ctrlKey: true, metaKey: false, preventDefault: vi.fn() };
    documentKeydown(wrongKey);
    expect(wrongKey.preventDefault).not.toHaveBeenCalled();

    const ctrl = { key: 'K', ctrlKey: true, metaKey: false, preventDefault: vi.fn() };
    documentKeydown(ctrl);
    expect(ctrl.preventDefault).toHaveBeenCalled();
    expect(palette.isOpen).toBe(true);

    const meta = { key: 'k', ctrlKey: false, metaKey: true, preventDefault: vi.fn() };
    documentKeydown(meta);
    expect(palette.isOpen).toBe(false);
  });
});

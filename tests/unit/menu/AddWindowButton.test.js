import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  config: {},
  windowTypes: [],
  app: null,
  getWindowIcon: vi.fn(),
  preservePlace: vi.fn(callback => callback())
}));

vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));
vi.mock('@core/registry.js', () => ({
  getAllWindowTypes: () => fixtures.windowTypes,
  getApp: () => fixtures.app
}));
vi.mock('@common/PlaceKeeper.js', () => ({
  PlaceKeeper: { preservePlace: fixtures.preservePlace }
}));
vi.mock('@core/windowIcons.js', () => ({ getWindowIcon: fixtures.getWindowIcon }));

import { AddWindowButton } from '@menu/AddWindowButton.js';

function types() {
  return [
    { className: 'BibleWindow', param: 'bible', init: { textid: 'WEB' } },
    { className: 'CommentaryWindow', param: 'commentary' },
    { className: 'AudioWindow', param: 'audio', init: {} },
    { className: 'NotesWindow', param: 'notes', init: { pinned: true } }
  ];
}

describe('AddWindowButton', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="main-menu-windows-list"></div>';
    vi.clearAllMocks();
    fixtures.config = {};
    fixtures.windowTypes = types();
    fixtures.app = { windowManager: { getWindows: vi.fn(() => []), add: vi.fn() } };
    fixtures.getWindowIcon.mockImplementation(type => type === 'BibleWindow' ? '<svg></svg>' : '');
    fixtures.preservePlace.mockImplementation(callback => callback());
  });

  it('orders enabled window types, skips missing names, and returns the last button', () => {
    fixtures.config.windowTypesOrder = ['NotesWindow', 'Missing', 'BibleWindow', 'AudioWindow'];
    fixtures.config.disabledWindowTypes = ['AudioWindow'];
    const last = AddWindowButton();
    const buttons = [...document.querySelectorAll('.window-add')];
    expect(buttons.map(button => button.id)).toEqual(['add-NotesWindow', 'add-BibleWindow']);
    expect(last).toBe(buttons[1]);
    expect(buttons[1].querySelector('.main-menu-icon').innerHTML).toContain('svg');
    expect(buttons[0].querySelector('.main-menu-icon')).toBeNull();
  });

  it('uses registration order and safely constructs without a menu container', () => {
    expect(AddWindowButton().id).toBe('add-NotesWindow');
    document.body.innerHTML = '';
    expect(AddWindowButton().id).toBe('add-NotesWindow');
  });

  it('ignores clicks that are not registered add-window buttons', () => {
    AddWindowButton();
    document.querySelector('#main-menu-windows-list').click();
    expect(fixtures.app.windowManager.add).not.toHaveBeenCalled();
  });

  it('copies the current Bible location when opening a Bible or commentary window', () => {
    const current = { fragmentid: 'JN3_16', sectionid: 'JN3', textid: 'ENGWEB' };
    fixtures.app.windowManager.getWindows.mockReturnValue([
      { className: 'OtherWindow' }, { className: 'CommentaryWindow', getData: () => current }
    ]);
    AddWindowButton();
    document.querySelector('#add-BibleWindow span').click();
    expect(fixtures.preservePlace).toHaveBeenCalled();
    expect(fixtures.app.windowManager.add).toHaveBeenCalledWith('BibleWindow', {
      textid: 'WEB', fragmentid: 'JN3_16', sectionid: 'JN3'
    });
  });

  it('also supplies the active text id when opening audio', () => {
    fixtures.app.windowManager.getWindows.mockReturnValue([
      { className: 'BibleWindow', getData: () => ({ fragmentid: 'GN1_1', sectionid: 'GN1', textid: 'WEB' }) }
    ]);
    AddWindowButton();
    document.querySelector('#add-AudioWindow').click();
    expect(fixtures.app.windowManager.add).toHaveBeenCalledWith('AudioWindow', {
      fragmentid: 'GN1_1', sectionid: 'GN1', _activeBibleTextid: 'WEB'
    });
  });

  it('uses the configured or default location when no readable window exists', () => {
    fixtures.config.newWindowFragmentid = 'EX2_3';
    fixtures.app.windowManager.getWindows.mockReturnValue([
      { className: 'BibleWindow', getData: () => null }
    ]);
    AddWindowButton();
    document.querySelector('#add-CommentaryWindow').click();
    expect(fixtures.app.windowManager.add).toHaveBeenLastCalledWith('CommentaryWindow', {
      fragmentid: 'EX2_3', sectionid: 'EX2'
    });

    fixtures.config.newWindowFragmentid = undefined;
    document.querySelector('#add-AudioWindow').click();
    expect(fixtures.app.windowManager.add).toHaveBeenLastCalledWith('AudioWindow', {
      fragmentid: 'JN1_1', sectionid: 'JN1'
    });
  });

  it('opens unrelated windows unchanged and tolerates an absent app', () => {
    AddWindowButton();
    document.querySelector('#add-NotesWindow').click();
    expect(fixtures.app.windowManager.add).toHaveBeenCalledWith('NotesWindow', { pinned: true });
    fixtures.app = null;
    expect(() => document.querySelector('#add-BibleWindow').click()).not.toThrow();
  });
});

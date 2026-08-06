import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  enabled: true,
  popup: null,
  infoWindow: vi.fn(() => fixtures.popup),
  clickHandler: vi.fn(),
  mouseoverHandler: vi.fn(),
  mouseoutHandler: vi.fn(),
  getClickHandler: vi.fn(() => fixtures.clickHandler),
  getMouseoverHandler: vi.fn(() => fixtures.mouseoverHandler),
  getMouseoutHandler: vi.fn(() => fixtures.mouseoutHandler)
}));

vi.mock('@core/config.js', () => ({
  getConfig: () => ({ enableNotesPopupPlugin: fixtures.enabled })
}));
vi.mock('@ui/InfoWindow.js', () => ({ InfoWindow: fixtures.infoWindow }));
vi.mock('@plugins/CrossReferencePopupPlugin.js', () => ({
  getBibleRefClickHandler: fixtures.getClickHandler,
  getBibleRefMouseoverHandler: fixtures.getMouseoverHandler,
  getBibleRefMouseoutHandler: fixtures.getMouseoutHandler
}));

import { NotesPopupPlugin } from '@plugins/NotesPopupPlugin.js';

function makePopup() {
  const callbacks = {};
  const container = document.createElement('div');
  container.matches = vi.fn(() => false);
  return {
    callbacks,
    container,
    body: document.createElement('div'),
    on: vi.fn((event, callback) => { callbacks[event] = callback; }),
    show: vi.fn(),
    hide: vi.fn(),
    position: vi.fn(),
    currentWord: null
  };
}

function note({ content = '<span class="text"><b>Note body</b></span>' } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'note';
  wrapper.innerHTML = `<a class="key">1</a>${content}`;
  return { wrapper, key: wrapper.querySelector('.key') };
}

describe('NotesPopupPlugin', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="windows-main"></div>';
    vi.clearAllMocks();
    fixtures.enabled = true;
    fixtures.popup = makePopup();
    fixtures.getClickHandler.mockImplementation(() => fixtures.clickHandler);
    fixtures.getMouseoverHandler.mockImplementation(() => fixtures.mouseoverHandler);
    fixtures.getMouseoutHandler.mockImplementation(() => fixtures.mouseoutHandler);
  });

  it('returns an inert object while disabled', () => {
    fixtures.enabled = false;
    expect(NotesPopupPlugin()).toEqual({});
    expect(fixtures.infoWindow).not.toHaveBeenCalled();
  });

  it('creates an event-emitting extension and clears the current key when hidden', () => {
    const extension = NotesPopupPlugin();
    expect(fixtures.infoWindow).toHaveBeenCalledWith('NotesPopup');
    expect(extension.getData()).toBeNull();
    expect(extension.on).toBeTypeOf('function');
    fixtures.popup.currentWord = document.createElement('span');
    fixtures.popup.callbacks.hide();
    expect(fixtures.popup.currentWord).toBeNull();
  });

  it('shows a cloned note body and positions it at the key', () => {
    NotesPopupPlugin();
    const item = note();
    document.querySelector('.windows-main').appendChild(item.wrapper);
    item.key.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(fixtures.popup.currentWord).toBe(item.key);
    expect(fixtures.popup.body.innerHTML).toBe('<span class="text"><b>Note body</b></span>');
    expect(fixtures.popup.show).toHaveBeenCalled();
    expect(fixtures.popup.position).toHaveBeenCalledWith(item.key);
  });

  it('shows an empty popup when the note has no text node', () => {
    NotesPopupPlugin();
    fixtures.popup.body.innerHTML = '<i>old</i>';
    const item = note({ content: '' });
    document.querySelector('.windows-main').appendChild(item.wrapper);
    item.key.click();
    expect(fixtures.popup.body.innerHTML).toBe('');
    expect(fixtures.popup.show).toHaveBeenCalled();
  });

  it('toggles off the currently open note and ignores unrelated clicks', () => {
    NotesPopupPlugin();
    const item = note();
    document.querySelector('.windows-main').appendChild(item.wrapper);
    fixtures.popup.currentWord = item.key;
    fixtures.popup.container.matches.mockReturnValue(true);
    item.key.click();
    expect(fixtures.popup.hide).toHaveBeenCalled();
    expect(fixtures.popup.currentWord).toBeNull();
    fixtures.popup.show.mockClear();
    document.querySelector('.windows-main').click();
    expect(fixtures.popup.show).not.toHaveBeenCalled();
  });

  it('routes Bible-reference clicks inside the popup and then hides it', () => {
    NotesPopupPlugin();
    fixtures.popup.body.innerHTML = '<a class="bibleref"><span>John 3:16</span></a>';
    const target = fixtures.popup.body.querySelector('.bibleref');
    target.firstChild.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fixtures.clickHandler.mock.instances[0]).toBe(target);
    expect(fixtures.popup.hide).toHaveBeenCalled();
  });

  it('still hides for a reference when no cross-reference handler is installed', () => {
    fixtures.getClickHandler.mockReturnValue(null);
    NotesPopupPlugin();
    fixtures.popup.body.innerHTML = '<a class="xt">xref</a>';
    fixtures.popup.body.firstChild.click();
    expect(fixtures.popup.hide).toHaveBeenCalled();
    fixtures.popup.hide.mockClear();
    fixtures.popup.body.innerHTML = '<span>plain</span>';
    fixtures.popup.body.firstChild.click();
    expect(fixtures.popup.hide).not.toHaveBeenCalled();
  });

  it('constructs safely without the main windows container', () => {
    document.body.innerHTML = '';
    expect(() => NotesPopupPlugin()).not.toThrow();
  });

  it('routes desktop hover handlers with the source text id', async () => {
    let owner = document;
    while (owner && !Object.prototype.hasOwnProperty.call(owner, 'ontouchend')) {
      owner = Object.getPrototypeOf(owner);
    }
    const descriptor = owner && Object.getOwnPropertyDescriptor(owner, 'ontouchend');
    if (owner) delete owner.ontouchend;
    vi.resetModules();
    try {
      const desktop = await import('@plugins/NotesPopupPlugin.js');
      desktop.NotesPopupPlugin();
      const section = document.createElement('div');
      section.className = 'section';
      section.dataset.textid = 'ENGWEB';
      const key = document.createElement('span');
      section.appendChild(key);
      fixtures.popup.currentWord = key;
      fixtures.popup.body.innerHTML = '<a class="bibleref"><span>x</span></a>';
      const child = fixtures.popup.body.querySelector('span');
      child.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(fixtures.mouseoverHandler).toHaveBeenCalledWith(expect.any(MouseEvent), 'ENGWEB');
      child.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      expect(fixtures.mouseoutHandler).toHaveBeenCalled();

      fixtures.getMouseoverHandler.mockReturnValue(null);
      fixtures.getMouseoutHandler.mockReturnValue(null);
      child.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      child.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    } finally {
      if (owner && descriptor) Object.defineProperty(owner, 'ontouchend', descriptor);
      vi.resetModules();
    }
  });
});

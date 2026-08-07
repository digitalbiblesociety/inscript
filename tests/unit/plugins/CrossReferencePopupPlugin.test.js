import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  enabled: true,
  popup: null,
  infoWindow: vi.fn(() => fixtures.popup),
  getFirstLocation: vi.fn(),
  locationChange: vi.fn(),
  getText: vi.fn(),
  loadSection: vi.fn(),
  Reference: vi.fn(function Reference(text) {
    if (!text || text === 'invalid') return {};
    return { toSection: () => text.replace(':', '_') };
  })
}));

vi.mock('@core/config.js', () => ({
  getConfig: () => ({ enableCrossReferencePopupPlugin: fixtures.enabled })
}));
vi.mock('@ui/InfoWindow.js', () => ({ InfoWindow: fixtures.infoWindow }));
vi.mock('@common/PlaceKeeper.js', () => ({
  PlaceKeeper: { getFirstLocation: fixtures.getFirstLocation }
}));
vi.mock('@common/TextNavigation.js', () => ({
  TextNavigation: { locationChange: fixtures.locationChange }
}));
vi.mock('@texts/TextLoader.js', () => ({
  getText: fixtures.getText,
  loadSection: fixtures.loadSection
}));
vi.mock('@bible/BibleReference.js', () => ({ Reference: fixtures.Reference }));

import {
  CrossReferencePopupPlugin,
  getBibleRefClickHandler,
  getBibleRefMouseoutHandler,
  getBibleRefMouseoverHandler
} from '@plugins/CrossReferencePopupPlugin.js';

function makePopup() {
  return {
    container: document.createElement('div'),
    body: document.createElement('div'),
    show: vi.fn(),
    hide: vi.fn(),
    position: vi.fn()
  };
}

function link(attrs = {}) {
  const el = document.createElement('a');
  el.className = 'bibleref';
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'html') el.innerHTML = value;
    else el.setAttribute(name, value);
  }
  return el;
}

describe('CrossReferencePopupPlugin', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="windows-main"></div>';
    vi.clearAllMocks();
    fixtures.enabled = true;
    fixtures.popup = makePopup();
    fixtures.getFirstLocation.mockReturnValue(null);
    fixtures.getText.mockImplementation((_id, callback) => callback({ id: 'WEB' }));
    fixtures.loadSection.mockImplementation((_info, _section, callback) => callback(
      '<div><span class="JN3_16">First<i class="note">note</i></span>' +
      '<span class="JN3_16">Second</span></div>'
    ));
  });

  it('returns an inert object while disabled', () => {
    fixtures.enabled = false;
    expect(CrossReferencePopupPlugin()).toEqual({});
    expect(fixtures.infoWindow).not.toHaveBeenCalled();
  });

  it('creates an elevated popup and event-emitting extension', () => {
    const extension = CrossReferencePopupPlugin();
    expect(fixtures.infoWindow).toHaveBeenCalledWith('CrossReferencePopup');
    expect(fixtures.popup.container.classList).toContain('info-window-elevated');
    expect(extension.on).toBeTypeOf('function');
  });

  it('navigates from link data and broadcasts the selected reference', () => {
    const extension = CrossReferencePopupPlugin();
    extension.trigger = vi.fn();
    fixtures.getFirstLocation.mockReturnValue({ fragmentid: 'GN1_1' });
    const target = link({ 'data-id': 'JN3:16; JN3:17' });
    getBibleRefClickHandler().call(target, new MouseEvent('click'));
    expect(fixtures.locationChange.mock.calls).toEqual([['GN1_1'], ['JN3_16']]);
    expect(extension.trigger).toHaveBeenCalledWith('globalmessage', expect.objectContaining({
      target,
      data: expect.objectContaining({
        messagetype: 'nav',
        locationInfo: { fragmentid: 'JN3_16', sectionid: 'JN3', offset: 0 }
      })
    }));
  });

  it('uses title and inner HTML fallbacks and ignores invalid references', () => {
    CrossReferencePopupPlugin();
    const titled = link({ title: 'GN1:2' });
    getBibleRefClickHandler().call(titled, {});
    expect(fixtures.locationChange).toHaveBeenCalledWith('GN1_2');
    fixtures.locationChange.mockClear();
    const html = link({ html: 'EX2:3' });
    getBibleRefClickHandler().call(html, {});
    expect(fixtures.locationChange).toHaveBeenCalledWith('EX2_3');
    fixtures.locationChange.mockClear();
    getBibleRefClickHandler().call(link({ 'data-id': 'invalid' }), {});
    expect(fixtures.locationChange).not.toHaveBeenCalled();
  });

  it('loads, sanitizes, displays, and positions reference content', () => {
    CrossReferencePopupPlugin();
    const target = link({ 'data-id': 'JN3:16' });
    getBibleRefMouseoverHandler().call(target, {}, 'ENGWEB');
    expect(fixtures.getText).toHaveBeenCalledWith('ENGWEB', expect.any(Function));
    expect(fixtures.loadSection).toHaveBeenCalledWith(
      { id: 'WEB' }, 'JN3', expect.any(Function)
    );
    expect(fixtures.popup.body.textContent).toBe('FirstSecond');
    expect(fixtures.popup.body.querySelector('.note')).toBeNull();
    expect(fixtures.popup.show).toHaveBeenCalled();
    expect(fixtures.popup.position).toHaveBeenCalledWith(target);
  });

  it('derives text ids from regular and commentary sections', () => {
    document.body.innerHTML = `
      <div class="windows-main"></div>
      <div class="BibleWindow"><div class="section" data-textid="BIBLE"></div></div>
      <div class="section" data-textid="REGULAR"><a class="bibleref" data-id="JN3:16"></a></div>
      <div class="section commentary"><a class="bibleref" data-id="JN3:16"></a></div>`;
    CrossReferencePopupPlugin();
    const links = document.querySelectorAll('a');
    getBibleRefMouseoverHandler().call(links[0], {});
    expect(fixtures.getText).toHaveBeenLastCalledWith('REGULAR', expect.any(Function));
    getBibleRefMouseoverHandler().call(links[1], {});
    expect(fixtures.getText).toHaveBeenLastCalledWith('BIBLE', expect.any(Function));
  });

  it('stops cleanly for invalid references, missing text ids, and missing content', () => {
    CrossReferencePopupPlugin();
    getBibleRefMouseoverHandler().call(link({ 'data-id': 'invalid' }), {});
    getBibleRefMouseoverHandler().call(link({ 'data-id': 'JN3:16' }), {});
    expect(fixtures.getText).not.toHaveBeenCalled();

    const target = link({ 'data-id': 'JN3:16' });
    fixtures.getText.mockImplementationOnce((_id, callback) => callback(null));
    getBibleRefMouseoverHandler().call(target, {}, 'WEB');
    fixtures.loadSection.mockImplementationOnce((_info, _section, callback) => callback({}));
    getBibleRefMouseoverHandler().call(target, {}, 'WEB');
    fixtures.loadSection.mockImplementationOnce((_info, _section, callback) => callback('<div></div>'));
    getBibleRefMouseoverHandler().call(target, {}, 'WEB');
    expect(fixtures.popup.show).not.toHaveBeenCalled();
  });

  it('ignores stale loads after another reference is hovered or the pointer leaves', () => {
    CrossReferencePopupPlugin();
    const callbacks = [];
    fixtures.loadSection.mockImplementation((_info, _section, callback) => callbacks.push(callback));
    const first = link({ 'data-id': 'JN3:16' });
    const second = link({ 'data-id': 'GN1:1' });

    getBibleRefMouseoverHandler().call(first, {}, 'ENGWEB');
    getBibleRefMouseoverHandler().call(second, {}, 'ENGWEB');
    callbacks[0]('<div><span class="JN3_16">stale</span></div>');
    expect(fixtures.popup.show).not.toHaveBeenCalled();
    callbacks[1]('<div><span class="GN1_1">current</span></div>');
    expect(fixtures.popup.body.textContent).toBe('current');

    fixtures.popup.show.mockClear();
    getBibleRefMouseoverHandler().call(first, {}, 'ENGWEB');
    getBibleRefMouseoutHandler().call(first, {});
    callbacks[2]('<div><span class="JN3_16">late</span></div>');
    expect(fixtures.popup.show).not.toHaveBeenCalled();
  });

  it('hides on mouseout and routes delegated window clicks', () => {
    const extension = CrossReferencePopupPlugin();
    extension.trigger = vi.fn();
    getBibleRefMouseoutHandler().call(link(), {});
    expect(fixtures.popup.hide).toHaveBeenCalled();

    const target = link({ 'data-id': 'GN1:1' });
    const child = document.createElement('span');
    target.appendChild(child);
    document.querySelector('.windows-main').appendChild(target);
    child.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fixtures.locationChange).toHaveBeenCalledWith('GN1_1');
  });

  it('constructs safely without a windows container', () => {
    document.body.innerHTML = '';
    expect(() => CrossReferencePopupPlugin()).not.toThrow();
  });

  it('delegates desktop hover events when touch support is absent', async () => {
    let owner = document;
    while (owner && !Object.hasOwn(owner, 'ontouchend')) {
      owner = Object.getPrototypeOf(owner);
    }
    const descriptor = owner && Object.getOwnPropertyDescriptor(owner, 'ontouchend');
    if (owner) delete owner.ontouchend;
    vi.resetModules();
    try {
      const desktop = await import('@plugins/CrossReferencePopupPlugin.js');
      desktop.CrossReferencePopupPlugin();
      const target = link({ 'data-id': 'JN3:16' });
      const child = document.createElement('span');
      target.appendChild(child);
      const section = document.createElement('div');
      section.className = 'section';
      section.dataset.textid = 'ENGWEB';
      section.appendChild(target);
      document.querySelector('.windows-main').appendChild(section);
      child.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(fixtures.getText).toHaveBeenCalled();
      child.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      expect(fixtures.popup.hide).toHaveBeenCalled();
    } finally {
      if (owner && descriptor) Object.defineProperty(owner, 'ontouchend', descriptor);
      vi.resetModules();
    }
  });
});

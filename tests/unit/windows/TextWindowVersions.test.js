import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  getText: vi.fn(),
  loadTexts: vi.fn(),
  displayAbbr: vi.fn(info => `abbr:${info?.id}`),
  versionHasSection: vi.fn(() => true),
  probeOrder: vi.fn()
}));

vi.mock('@texts/TextLoader.js', () => ({
  getText: fixtures.getText,
  loadTexts: fixtures.loadTexts,
  displayAbbr: fixtures.displayAbbr
}));

vi.mock('@windows/versionCycle.js', () => ({
  versionHasSection: fixtures.versionHasSection,
  probeOrder: fixtures.probeOrder
}));

import {
  changeText,
  cycleVersion,
  getLanguageSiblings,
  setVersionSiblings,
  updateVersionCycler
} from '@windows/TextWindowVersions.js';

function makeComponent() {
  const wrapper = document.createElement('div');
  const versionCycler = document.createElement('div');
  return {
    state: {
      currentTextInfo: null,
      currentLocationInfo: null,
      textType: 'bible'
    },
    refs: { wrapper, versionCycler },
    textNavigator: { setTextInfo: vi.fn() },
    textChooser: { setTextInfo: vi.fn() },
    audioController: { setTextInfo: vi.fn() },
    scroller: {
      getLocationInfo: vi.fn(() => null),
      setTextInfo: vi.fn(),
      load: vi.fn()
    },
    setTextInfoUI: vi.fn(),
    updateTabLabel: vi.fn(),
    updateVersionCycler: vi.fn(),
    setVersionSiblings: vi.fn(),
    changeText: vi.fn(),
    _cycleToken: 0,
    _cycleTargetId: null,
    _versionSiblings: []
  };
}

const text = (id, overrides = {}) => ({
  id, name: id, langNameEnglish: 'English', sections: ['GN1'], ...overrides
});

describe('TextWindowVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.displayAbbr.mockImplementation(info => `abbr:${info?.id}`);
    fixtures.versionHasSection.mockReturnValue(true);
    fixtures.probeOrder.mockImplementation((length, start, direction) =>
      Array.from({ length }, (_, i) => (start + direction * (i + 1) + length) % length));
    fixtures.getText.mockImplementation((id, callback) => callback(text(id)));
    fixtures.loadTexts.mockImplementation(callback => callback([]));
  });

  it('ignores an empty text change', () => {
    const component = makeComponent();
    changeText(component, null);
    expect(component.setTextInfoUI).not.toHaveBeenCalled();
  });

  it('updates shared UI but does not reload the current version', () => {
    const component = makeComponent();
    const current = text('ENG');
    component.state.currentTextInfo = current;
    changeText(component, { ...current, name: 'Fresh metadata' });
    expect(component.setTextInfoUI).toHaveBeenCalled();
    expect(component.updateTabLabel).toHaveBeenCalledWith('abbr:ENG');
    expect(component.textNavigator.setTextInfo).toHaveBeenCalled();
    expect(component.audioController.setTextInfo).toHaveBeenCalled();
    expect(component.scroller.load).not.toHaveBeenCalled();
  });

  it('loads a new version at the scroller location and resets cycling state', () => {
    const component = makeComponent();
    component.state.currentTextInfo = text('OLD');
    component._cycleToken = 4;
    component._cycleTargetId = 'TARGET';
    component.refs.wrapper.innerHTML = '<span>old</span>';
    component.scroller.getLocationInfo.mockReturnValue({ sectionid: 'JN3', fragmentid: 'JN3_16' });
    const next = text('NEW', { sections: ['GN1'] });
    changeText(component, next);
    expect(component.state.currentTextInfo).toBe(next);
    expect(component._cycleToken).toBe(5);
    expect(component._cycleTargetId).toBeNull();
    expect(component.refs.wrapper.innerHTML).toBe('');
    expect(component.scroller.setTextInfo).toHaveBeenCalledWith(next);
    expect(component.scroller.load).toHaveBeenCalledWith('text', 'JN3', 'JN3_16');
    expect(component.updateVersionCycler).toHaveBeenCalled();
  });

  it('falls back through saved location, first section, and optional audio controller', () => {
    const component = makeComponent();
    component.audioController = null;
    component.state.currentLocationInfo = { sectionid: 'EX2', fragmentid: 'EX2_4' };
    const first = text('FIRST', { sections: ['GN1'] });
    changeText(component, first);
    expect(component.scroller.load).toHaveBeenLastCalledWith('text', 'EX2', 'EX2_4');

    component.scroller.getLocationInfo.mockReturnValue(null);
    component.state.currentLocationInfo = null;
    const second = text('SECOND', { sections: ['PS1'] });
    changeText(component, second);
    expect(component.scroller.load).toHaveBeenLastCalledWith('text', 'PS1', undefined);
  });

  it('guards version cycling without siblings or current text', () => {
    const component = makeComponent();
    cycleVersion(component, 1);
    component.state.currentTextInfo = text('ONE');
    component._versionSiblings = [component.state.currentTextInfo];
    cycleVersion(component, 1);
    expect(fixtures.probeOrder).not.toHaveBeenCalled();
  });

  it('cycles from an anchored target and adopts the first compatible candidate', () => {
    const component = makeComponent();
    const one = text('ONE');
    const two = text('TWO');
    const three = text('THREE');
    component.state.currentTextInfo = one;
    component._versionSiblings = [one, two, three];
    component._cycleTargetId = 'TWO';
    component.scroller.getLocationInfo.mockReturnValue({ sectionid: 'JN3' });
    fixtures.probeOrder.mockReturnValue([2, 0, 1]);
    fixtures.getText.mockImplementation((_id, callback) => callback(three));
    cycleVersion(component, 1);
    expect(fixtures.probeOrder).toHaveBeenCalledWith(3, 1, 1);
    expect(component._cycleTargetId).toBe('THREE');
    expect(fixtures.versionHasSection).toHaveBeenCalledWith(three, 'JN3');
    expect(component.textChooser.setTextInfo).toHaveBeenCalledWith(three);
    expect(component.changeText).toHaveBeenCalledWith(three);
  });

  it('falls back from a missing anchor to current index or index zero', () => {
    const component = makeComponent();
    const one = text('ONE');
    const two = text('TWO');
    component.state.currentTextInfo = one;
    component._versionSiblings = [one, two];
    component._cycleTargetId = 'MISSING';
    fixtures.probeOrder.mockReturnValue([]);
    cycleVersion(component, -1);
    expect(fixtures.probeOrder).toHaveBeenCalledWith(2, 0, -1);
    expect(component._cycleTargetId).toBeNull();

    component.state.currentTextInfo = text('OUTSIDE');
    cycleVersion(component, 1);
    expect(fixtures.probeOrder).toHaveBeenLastCalledWith(2, 0, 1);
  });

  it('skips empty/current/incompatible candidates and clears the target at exhaustion', () => {
    const component = makeComponent();
    const one = text('ONE');
    const two = text('TWO');
    component.state.currentTextInfo = one;
    component.state.currentLocationInfo = { sectionid: 'GN1' };
    component._versionSiblings = [one, undefined, two];
    fixtures.probeOrder.mockReturnValue([1, 0, 2]);
    fixtures.versionHasSection.mockReturnValue(false);
    fixtures.getText.mockImplementation((_id, callback) => callback(two));
    cycleVersion(component, 1);
    expect(fixtures.getText).toHaveBeenCalledWith('TWO', expect.any(Function));
    expect(component.changeText).not.toHaveBeenCalled();
    expect(component._cycleTargetId).toBeNull();
  });

  it('ignores stale text callbacks and does not clear a newer cycle target', () => {
    const component = makeComponent();
    const one = text('ONE');
    const two = text('TWO');
    component.state.currentTextInfo = one;
    component._versionSiblings = [one, two];
    fixtures.probeOrder.mockReturnValue([1]);
    let callback;
    fixtures.getText.mockImplementation((_id, cb) => { callback = cb; });
    cycleVersion(component, 1);
    component._cycleToken++;
    component._cycleTargetId = 'NEWER';
    callback(two);
    expect(component.changeText).not.toHaveBeenCalled();
    expect(component._cycleTargetId).toBe('NEWER');
  });

  it('clears siblings when the current text or cycler is absent', () => {
    const component = makeComponent();
    updateVersionCycler(component);
    expect(component.setVersionSiblings).toHaveBeenCalledWith([]);
    component.state.currentTextInfo = text('ONE');
    component.refs.versionCycler = null;
    updateVersionCycler(component);
    expect(component.setVersionSiblings).toHaveBeenCalledTimes(2);
    expect(fixtures.loadTexts).not.toHaveBeenCalled();
  });

  it('loads language siblings only while the same current object remains', () => {
    const component = makeComponent();
    const current = text('ONE');
    component.state.currentTextInfo = current;
    fixtures.loadTexts.mockImplementationOnce(callback => callback([current]));
    updateVersionCycler(component);
    expect(component.setVersionSiblings).toHaveBeenCalledWith([current]);

    component.setVersionSiblings.mockClear();
    fixtures.loadTexts.mockImplementation(callback => {
      component.state.currentTextInfo = text('OTHER');
      callback([current]);
    });
    updateVersionCycler(component);
    expect(component.setVersionSiblings).not.toHaveBeenCalled();
  });

  it('filters and sorts readable same-language siblings of the current text type', () => {
    const component = makeComponent();
    component.state.textType = 'bible';
    const current = text('CURRENT', { langNameEnglish: '', langName: 'Spanish' });
    const data = [
      text('B', { name: 'Beta', langNameEnglish: '', langName: 'Spanish' }),
      text('A', { name: 'Alpha', langNameEnglish: '', langName: 'Spanish', type: undefined }),
      text('NO_TEXT', { name: 'No', langNameEnglish: '', langName: 'Spanish', hasText: false }),
      text('COMMENT', { name: 'Comment', langNameEnglish: '', langName: 'Spanish', type: 'commentary' }),
      text('ENGLISH', { name: 'English', langNameEnglish: 'English' }),
      current
    ];
    expect(getLanguageSiblings(component, data, current).map(item => item.id))
      .toEqual(['A', 'B', 'CURRENT']);

    const outside = text('OUTSIDE', { langNameEnglish: '', langName: 'Spanish' });
    expect(getLanguageSiblings(component, data, outside).map(item => item.id))
      .toEqual(['A', 'B', 'CURRENT']);
  });

  it('stores siblings and toggles cycler visibility when present', () => {
    const component = makeComponent();
    setVersionSiblings(component, [text('ONE')]);
    expect(component.refs.versionCycler.classList).not.toContain('has-versions');
    const siblings = [text('ONE'), text('TWO')];
    setVersionSiblings(component, siblings);
    expect(component._versionSiblings).toBe(siblings);
    expect(component.refs.versionCycler.classList).toContain('has-versions');
    component.refs.versionCycler = null;
    expect(() => setVersionSiblings(component, [])).not.toThrow();
  });
});

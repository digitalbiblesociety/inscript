import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  chooser: null,
  navigator: null,
  scroller: null,
  audio: null,
  Scroller: vi.fn(),
  AudioController: vi.fn(),
  Reference: vi.fn(),
  getText: vi.fn(),
  loadTexts: vi.fn(),
  displayAbbr: vi.fn(info => `abbr:${info?.id}`),
  locationChange: vi.fn(),
  changeWindowText: vi.fn(),
  cycleWindowVersion: vi.fn(),
  getLanguageSiblings: vi.fn(() => []),
  setVersionSiblings: vi.fn(),
  updateVersionCycler: vi.fn(),
  updateTextInfoUI: vi.fn(),
  toggleTextInfo: vi.fn(() => Promise.resolve()),
  translate: vi.fn(key => key)
}));

vi.mock('@windows/Scroller.js', () => ({ Scroller: fixtures.Scroller }));
vi.mock('@windows/AudioController.js', () => ({ AudioController: fixtures.AudioController }));
vi.mock('@ui/TextChooser.js', () => ({ getGlobalTextChooser: () => fixtures.chooser }));
vi.mock('@ui/TextNavigator.js', () => ({ getGlobalTextNavigator: () => fixtures.navigator }));
vi.mock('@bible/BibleReference.js', () => ({ Reference: fixtures.Reference }));
vi.mock('@texts/TextLoader.js', () => ({
  getText: fixtures.getText,
  loadTexts: fixtures.loadTexts,
  displayAbbr: fixtures.displayAbbr
}));
vi.mock('@common/TextNavigation.js', () => ({
  TextNavigation: { locationChange: fixtures.locationChange }
}));
vi.mock('@windows/TextWindowVersions.js', () => ({
  changeText: fixtures.changeWindowText,
  cycleVersion: fixtures.cycleWindowVersion,
  getLanguageSiblings: fixtures.getLanguageSiblings,
  setVersionSiblings: fixtures.setVersionSiblings,
  updateVersionCycler: fixtures.updateVersionCycler
}));
vi.mock('@windows/TextWindowInfo.js', () => ({
  setTextInfoUI: fixtures.updateTextInfoUI,
  toggleTextInfo: fixtures.toggleTextInfo
}));
vi.mock('@lib/i18n.js', () => ({ t: fixtures.translate }));

import { BibleWindow, CommentaryWindow, TextWindowComponent } from '@windows/TextWindow.js';

function makeChooser() {
  return {
    on: vi.fn(), off: vi.fn(), getTarget: vi.fn(() => null), hide: vi.fn(),
    toggle: vi.fn(), setTarget: vi.fn(), setTextInfo: vi.fn(), show: vi.fn(), size: vi.fn()
  };
}

function makeNavigator() {
  return {
    on: vi.fn(), off: vi.fn(), getTarget: vi.fn(() => null), hide: vi.fn(),
    toggle: vi.fn(), setTarget: vi.fn(), setTextInfo: vi.fn(), show: vi.fn(), size: vi.fn()
  };
}

function makeScroller() {
  return {
    on: vi.fn(), close: vi.fn(), getLocationInfo: vi.fn(() => null),
    setTextInfo: vi.fn(), load: vi.fn(), scrollTo: vi.fn(), broadcastCurrentContent: vi.fn()
  };
}

function makeAudio() {
  return { close: vi.fn(), setTextInfo: vi.fn() };
}

function ref(input, { valid = true, section = String(input) } = {}) {
  return {
    isValid: () => valid,
    toSection: () => section,
    toString: () => `formatted:${input}`
  };
}

async function makeWindow(tag = 'bible-window') {
  const component = document.createElement(tag);
  await component.render();
  component.cacheRefs();
  component.refs.info.hidePopover = vi.fn();
  component.refs.info.showPopover = vi.fn();
  component.refs.info.matches = vi.fn(() => false);
  return component;
}

function listener(listeners, target, event) {
  return listeners.find(entry => entry.target === target && entry.event === event)?.handler;
}

describe('TextWindow lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fixtures.chooser = makeChooser();
    fixtures.navigator = makeNavigator();
    fixtures.scroller = makeScroller();
    fixtures.audio = makeAudio();
    fixtures.Scroller.mockImplementation(() => fixtures.scroller);
    fixtures.AudioController.mockImplementation(() => fixtures.audio);
    fixtures.Reference.mockImplementation(input => ref(input));
    fixtures.getText.mockImplementation((id, success) => success({
      id, providerid: `local:${id}`, abbr: id, type: 'bible', sections: ['GN1']
    }));
    fixtures.loadTexts.mockImplementation(callback => callback([]));
    fixtures.displayAbbr.mockImplementation(info => `abbr:${info?.id}`);
    fixtures.getLanguageSiblings.mockReturnValue([]);
    fixtures.toggleTextInfo.mockResolvedValue();
    fixtures.translate.mockImplementation(key => key);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('initializes base text state, collaborators, and cycling fields', () => {
    const component = document.createElement('bible-window');
    expect(component).toBeInstanceOf(TextWindowComponent);
    expect(component.state).toMatchObject({
      currentTextInfo: null, currentLocationInfo: null, hasFocus: false, textType: 'bible'
    });
    expect(component.scroller).toBeNull();
    expect(component.audioController).toBeNull();
    expect(component.textChooser).toBe(fixtures.chooser);
    expect(component.textNavigator).toBe(fixtures.navigator);
    expect(component._versionSiblings).toBeNull();
    expect(component._cycleToken).toBe(0);
    expect(component._cycleTargetId).toBeNull();
    expect(component._lastNav).toBeNull();
    expect(document.createElement('commentary-window')).toBeInstanceOf(CommentaryWindow);
  });

  it('renders translated chrome, audio icon, and parent-height loading placeholder', async () => {
    const parent = document.createElement('div');
    Object.defineProperty(parent, 'offsetHeight', { value: 720 });
    const component = document.createElement('bible-window');
    parent.appendChild(component);
    await component.render();
    expect(component.querySelector('.loading-indicator').style.height).toBe('720px');
    expect(component.querySelector('.audio-button').innerHTML).not.toBe('');
    expect(component.querySelector('.text-nav').getAttribute('aria-label')).toBe('windows.bible.gotopassage');

    const detached = document.createElement('bible-window');
    await detached.render();
    expect(detached.querySelector('.loading-indicator').style.height).toBe('600px');
  });

  it('caches all text, navigation, info, audio, and cycling references', async () => {
    const component = await makeWindow();
    expect(component.refs.container).toBe(component.querySelector('.scroller-container'));
    expect(component.refs.wrapper).toBe(component.querySelector('.scroller-text-wrapper'));
    expect(component.refs.infoContent).toBe(component.querySelector('.scroller-info-content'));
    expect(component.refs.navui).toBe(component.querySelector('.text-nav'));
    expect(component.refs.audioui).toBe(component.querySelector('.audio-button'));
    expect(component.refs.versionPrev).toBe(component.querySelector('.version-prev'));
  });

  it('wires DOM, global chooser/navigator, focus, blur, and message events', async () => {
    const component = await makeWindow();
    const listeners = [];
    component.addListener = vi.fn((target, event, handler) => listeners.push({ target, event, handler }));
    component.bindHandler = vi.fn((_name, handler) => handler.bind(component));
    component.on = vi.fn();
    component.handleInfoClose = vi.fn();
    component.handleInfoToggle = vi.fn();
    component.handleTextListClick = vi.fn();
    component.cycleVersion = vi.fn();
    component.handleNavClick = vi.fn();
    component.handleNavKeydown = vi.fn();
    component.handleTextChooserChange = vi.fn();
    component.handleTextNavigatorChange = vi.fn();
    component.handleMessage = vi.fn();
    component.attachEventListeners();
    listener(listeners, component.refs.infoCloseBtn, 'click')();
    listener(listeners, component.refs.infoBtn, 'click')();
    listener(listeners, component.refs.textlistui, 'click')();
    listener(listeners, component.refs.versionPrev, 'click')();
    listener(listeners, component.refs.versionNext, 'click')();
    listener(listeners, component.refs.navui, 'click')({});
    listener(listeners, component.refs.navui, 'keydown')({ key: 'Enter' });
    expect(component.handleInfoClose).toHaveBeenCalled();
    expect(component.handleInfoToggle).toHaveBeenCalled();
    expect(component.cycleVersion).toHaveBeenNthCalledWith(1, -1);
    expect(component.cycleVersion).toHaveBeenNthCalledWith(2, 1);
    component._textChooserHandler({ data: 1 });
    component._textNavigatorHandler({ data: 2 });
    expect(component.handleTextChooserChange).toHaveBeenCalledWith({ data: 1 });
    expect(component.handleTextNavigatorChange).toHaveBeenCalledWith({ data: 2 });

    const eventHandlers = Object.fromEntries(component.on.mock.calls.map(([name, handler]) => [name, handler]));
    component._lastNav = {};
    eventHandlers.focus();
    expect(component.state.hasFocus).toBe(true);
    expect(component._lastNav).toBeNull();
    eventHandlers.blur();
    expect(component.state.hasFocus).toBe(false);
    eventHandlers.message({ data: 3 });
    expect(component.handleMessage).toHaveBeenCalledWith({ data: 3 });
  });

  it('initializes type, scroller/controller, event bridges, and initial text', async () => {
    const component = await makeWindow();
    component.getParam = vi.fn(() => 'commentary');
    component.createScroller = vi.fn(() => fixtures.scroller);
    component.createAudioController = vi.fn(() => fixtures.audio);
    component.updateTextnav = vi.fn();
    component.trigger = vi.fn();
    component.loadInitialText = vi.fn().mockResolvedValue();
    await component.init();
    expect(component.state.textType).toBe('commentary');
    expect(component.refs.navui.value).toBe('windows.bible.reference');
    expect(component.refs.textlistui.innerHTML).toBe('windows.bible.version');
    expect(fixtures.scroller.on).toHaveBeenCalledTimes(4);
    const handlers = Object.fromEntries(fixtures.scroller.on.mock.calls);
    handlers.scroll();
    handlers.locationchange({ data: { sectionid: 'GN1' } });
    handlers.load();
    expect(component.updateTextnav).toHaveBeenNthCalledWith(2, { sectionid: 'GN1' });

    component.state.hasFocus = false;
    handlers.globalmessage({ type: 'globalmessage', data: { messagetype: 'nav' } });
    expect(component.trigger).not.toHaveBeenCalled();
    handlers.globalmessage({ type: 'globalmessage', data: { messagetype: 'other' } });
    component.state.hasFocus = true;
    handlers.globalmessage({ type: 'globalmessage', data: { messagetype: 'nav' } });
    expect(component.trigger).toHaveBeenCalledTimes(2);
    expect(component.loadInitialText).toHaveBeenCalled();
  });

  it('creates the production scroller and audio controller with expected arguments', async () => {
    const component = await makeWindow();
    component.windowId = 'w1';
    expect(component.createScroller()).toBe(fixtures.scroller);
    expect(fixtures.Scroller).toHaveBeenCalledWith(component.refs.main);
    component.scroller = fixtures.scroller;
    expect(component.createAudioController()).toBe(fixtures.audio);
    expect(fixtures.AudioController).toHaveBeenCalledWith(
      'w1', component.refs.container, component.refs.audioui, fixtures.scroller
    );
  });

  it('cleans bindings, owned popovers, scroller, and audio resources', async () => {
    const component = await makeWindow();
    component._textChooserHandler = vi.fn();
    component._textNavigatorHandler = vi.fn();
    component.scroller = fixtures.scroller;
    component.audioController = fixtures.audio;
    fixtures.chooser.getTarget.mockReturnValue(component.refs.textlistui);
    fixtures.navigator.getTarget.mockReturnValue(component.refs.navui);
    component.cleanup();
    expect(fixtures.chooser.off).toHaveBeenCalledWith('change', component._textChooserHandler);
    expect(fixtures.navigator.off).toHaveBeenCalledWith('change', component._textNavigatorHandler);
    expect(fixtures.chooser.hide).toHaveBeenCalled();
    expect(fixtures.navigator.hide).toHaveBeenCalled();
    expect(fixtures.scroller.close).toHaveBeenCalled();
    expect(fixtures.audio.close).toHaveBeenCalled();

    const idle = await makeWindow();
    fixtures.chooser.getTarget.mockReturnValue(document.body);
    fixtures.navigator.getTarget.mockReturnValue(document.body);
    fixtures.chooser.hide.mockClear();
    fixtures.navigator.hide.mockClear();
    expect(() => idle.cleanup()).not.toThrow();
    expect(fixtures.chooser.hide).not.toHaveBeenCalled();
    expect(fixtures.navigator.hide).not.toHaveBeenCalled();
  });

  it('closes and toggles version info', async () => {
    const component = await makeWindow();
    component.handleInfoClose();
    expect(component.refs.info.hidePopover).toHaveBeenCalled();
    await component.handleInfoToggle();
    expect(fixtures.toggleTextInfo).toHaveBeenCalledWith(component);
  });

  it('closes info and toggles or opens the text chooser', async () => {
    const component = await makeWindow();
    component.state.currentTextInfo = { id: 'ENG' };
    component.refs.info.matches.mockReturnValue(true);
    fixtures.chooser.getTarget.mockReturnValue(component.refs.textlistui);
    component.handleTextListClick();
    expect(component.refs.info.hidePopover).toHaveBeenCalled();
    expect(fixtures.chooser.toggle).toHaveBeenCalled();
    fixtures.chooser.getTarget.mockReturnValue(null);
    component.handleTextListClick();
    expect(fixtures.chooser.setTarget).toHaveBeenCalledWith(
      component.refs.container, component.refs.textlistui, 'bible'
    );
    expect(fixtures.chooser.setTextInfo).toHaveBeenCalledWith(component.state.currentTextInfo);
    expect(fixtures.chooser.show).toHaveBeenCalled();
  });

  it('closes info and toggles or opens the text navigator', async () => {
    const component = await makeWindow();
    component.state.currentTextInfo = { id: 'ENG' };
    component.refs.info.matches.mockReturnValue(true);
    fixtures.navigator.getTarget.mockReturnValue(component.refs.navui);
    component.handleNavClick({});
    expect(component.refs.info.hidePopover).toHaveBeenCalled();
    expect(fixtures.navigator.toggle).toHaveBeenCalled();
    fixtures.navigator.getTarget.mockReturnValue(null);
    component.handleNavClick({});
    expect(fixtures.navigator.setTarget).toHaveBeenCalledWith(component.refs.container, component.refs.navui);
    expect(fixtures.navigator.setTextInfo).toHaveBeenCalledWith(component.state.currentTextInfo);
    expect(fixtures.navigator.show).toHaveBeenCalled();
  });

  it('blurs navigation on touch environments', async () => {
    if (!('ontouchend' in document)) return;
    const component = await makeWindow();
    const blur = vi.spyOn(component.refs.navui, 'blur');
    component.handleNavClick({});
    expect(blur).toHaveBeenCalled();
  });

  it('accepts valid Enter navigation and rejects invalid keys/references/sections', async () => {
    const component = await makeWindow();
    component.scroller = fixtures.scroller;
    component.broadcastNav = vi.fn();
    component.refs.navui.value = 'JN3_16';
    component.handleNavKeydown({ key: 'x' });
    fixtures.Reference.mockReturnValueOnce(ref('bad', { valid: false }));
    component.handleNavKeydown({ key: 'Enter' });
    fixtures.Reference.mockReturnValueOnce(ref('bad', { section: 'invalid' }));
    component.handleNavKeydown({ key: 'Enter' });
    fixtures.Reference.mockReturnValueOnce(ref('bad', { section: '' }));
    component.handleNavKeydown({ key: 'Enter' });
    fixtures.Reference.mockReturnValueOnce(ref('JN3_16'));
    component.handleNavKeydown({ key: 'Enter' });
    expect(fixtures.locationChange).toHaveBeenCalledWith('JN3_16');
    expect(fixtures.scroller.load).toHaveBeenCalledWith('text', 'JN3', 'JN3_16');
    expect(component.broadcastNav).toHaveBeenCalledWith('JN3', 'JN3_16');
    expect(fixtures.navigator.hide).toHaveBeenCalled();
    expect(component.refs.navui.value).toBe('formatted:JN3_16');
  });

  it('renders a manually entered reference with the text numbering system', async () => {
    const component = await makeWindow();
    component.scroller = fixtures.scroller;
    component.broadcastNav = vi.fn();
    component.state.currentTextInfo = { lang: 'arb' };
    component.refs.navui.value = 'John ٣:١٦';
    fixtures.Reference.mockReturnValueOnce({
      isValid: () => true,
      toSection: () => 'JN3_16',
      toString: () => 'John 3:16'
    });

    component.handleNavKeydown({ key: 'Enter' });
    expect(fixtures.Reference).toHaveBeenCalledWith('John ٣:١٦');
    expect(fixtures.scroller.load).toHaveBeenCalledWith('text', 'JN3', 'JN3_16');
    expect(component.refs.navui.value).toBe('John ٣:١٦');
  });

  it('routes direct/wrapped navigator and chooser changes to this window only', async () => {
    const component = await makeWindow();
    component.scroller = fixtures.scroller;
    component.broadcastNav = vi.fn();
    component.changeText = vi.fn();
    component.handleTextNavigatorChange({ data: { target: document.body } });
    component.handleTextNavigatorChange({ data: {
      target: component.refs.navui, sectionid: 'GN1', fragmentid: ''
    } });
    component.handleTextNavigatorChange({ data: {
      target: [component.refs.navui], sectionid: 'JN3', fragmentid: 'JN3_16'
    } });
    expect(fixtures.locationChange).toHaveBeenNthCalledWith(1, 'GN1');
    expect(fixtures.locationChange).toHaveBeenNthCalledWith(2, 'JN3_16');
    expect(fixtures.scroller.load).toHaveBeenNthCalledWith(1, 'text', 'GN1', '');

    component.handleTextChooserChange({ data: { target: document.body, textInfo: { id: 'NO' } } });
    component.handleTextChooserChange({ data: {
      target: [component.refs.textlistui], textInfo: { id: 'ENG' }
    } });
    expect(component.changeText).toHaveBeenCalledWith({ id: 'ENG' });
  });

  it('broadcasts navigation with text type and a default verse fragment', async () => {
    const component = await makeWindow();
    component.trigger = vi.fn();
    component.state.currentTextInfo = { type: 'Commentary' };
    component.broadcastNav('GN1', '');
    expect(component.trigger).toHaveBeenCalledWith('globalmessage', {
      type: 'globalmessage', target: component,
      data: {
        messagetype: 'nav', type: 'commentary',
        locationInfo: { fragmentid: 'GN1_1', sectionid: 'GN1', offset: 0 }
      }
    });
    component.state.currentTextInfo = null;
    component.broadcastNav('JN3', 'JN3_16');
    expect(component.trigger.mock.calls[1][1].data.type).toBe('bible');
  });

  it('delegates text/version/info helper methods', () => {
    const component = document.createElement('bible-window');
    const info = { id: 'ENG' };
    component.changeText(info);
    component.cycleVersion(-1);
    component.updateVersionCycler();
    expect(component.getLanguageSiblings(['data'], info)).toEqual([]);
    component.setVersionSiblings([info]);
    component.setTextInfoUI(info);
    expect(fixtures.changeWindowText).toHaveBeenCalledWith(component, info);
    expect(fixtures.cycleWindowVersion).toHaveBeenCalledWith(component, -1);
    expect(fixtures.updateVersionCycler).toHaveBeenCalledWith(component);
    expect(fixtures.getLanguageSiblings).toHaveBeenCalledWith(component, ['data'], info);
    expect(fixtures.setVersionSiblings).toHaveBeenCalledWith(component, [info]);
    expect(fixtures.updateTextInfoUI).toHaveBeenCalledWith(component, info);
  });

  it('handles navigable messages and current-content map requests only', () => {
    const component = document.createElement('bible-window');
    component.scroller = fixtures.scroller;
    component.handleMessage({ data: {
      messagetype: 'nav', type: 'bible', locationInfo: { fragmentid: 'GN1_1', offset: 2 }
    } });
    component.handleMessage({ data: {
      messagetype: 'nav', type: 'commentary', locationInfo: { fragmentid: 'GN1_2', offset: 0 }
    } });
    component.handleMessage({ data: { messagetype: 'nav', type: 'map', locationInfo: {} } });
    component.handleMessage({ data: { messagetype: 'nav', type: 'bible', locationInfo: null } });
    component.handleMessage({ data: { messagetype: 'maprequest', requesttype: 'other' } });
    component.handleMessage({ data: { messagetype: 'maprequest', requesttype: 'currentcontent' } });
    expect(fixtures.scroller.scrollTo).toHaveBeenCalledTimes(2);
    expect(fixtures.scroller.broadcastCurrentContent).toHaveBeenCalledOnce();
  });

  it('returns type-specific default text IDs', () => {
    const component = document.createElement('bible-window');
    component.config.newBibleWindowVersion = 'BIBLE';
    component.config.newCommentaryWindowTextId = 'COMMENT';
    component.config.deafBibleWindowDefaultBibleVersion = 'DEAF';
    component.state.textType = 'commentary';
    expect(component.getDefaultTextId()).toBe('COMMENT');
    component.state.textType = 'deafbible';
    expect(component.getDefaultTextId()).toBe('DEAF');
    component.state.textType = 'bible';
    expect(component.getDefaultTextId()).toBe('BIBLE');
  });

  it('loads the configured initial text and falls back from an empty parameter', async () => {
    const component = await makeWindow();
    component.getParam = vi.fn().mockReturnValueOnce('').mockReturnValue(null);
    component.getDefaultTextId = vi.fn(() => 'DEFAULT');
    component.startup = vi.fn().mockResolvedValue();
    await component.loadInitialText();
    expect(fixtures.getText).toHaveBeenCalledWith('DEFAULT', expect.any(Function), expect.any(Function));
    expect(component.state.currentTextInfo.id).toBe('DEFAULT');
    expect(component.startup).toHaveBeenCalled();
  });

  it('reports an empty catalog after initial load failure', async () => {
    const component = await makeWindow();
    component.getParam = vi.fn(() => 'MISSING');
    fixtures.getText.mockImplementation((_id, _success, error) => error(new Error('missing')));
    fixtures.loadTexts.mockImplementation(callback => callback([]));
    component.showError = vi.fn();
    await component.loadInitialText();
    expect(component.showError).toHaveBeenCalledWith('No texts available to load');
    fixtures.loadTexts.mockImplementation(callback => callback(null));
    await component.loadInitialText();
    expect(component.showError).toHaveBeenCalledTimes(2);
  });

  it('retries the requested text after loading manifests', async () => {
    const component = await makeWindow();
    component.getParam = vi.fn(() => 'ONLINE');
    const loaded = { id: 'ONLINE' };
    fixtures.getText
      .mockImplementationOnce((_id, _success, error) => error(new Error('not ready')))
      .mockImplementationOnce((_id, success) => success(loaded));
    fixtures.loadTexts.mockImplementation(callback => callback([loaded]));
    component.startup = vi.fn().mockResolvedValue();
    await component.loadInitialText();
    expect(component.state.currentTextInfo).toBe(loaded);
    expect(component.startup).toHaveBeenCalledOnce();
  });

  it('falls back to the first readable matching type or first catalog entry', async () => {
    const component = await makeWindow();
    component.state.textType = 'commentary';
    component.getParam = vi.fn(() => 'MISSING');
    const entries = [
      { id: 'NO_TEXT', type: 'commentary', hasText: false },
      { id: 'BIBLE', type: undefined },
      { id: 'COMMENT', type: 'commentary' }
    ];
    fixtures.getText
      .mockImplementationOnce((_id, _success, error) => error(new Error('missing')))
      .mockImplementationOnce((_id, _success, error) => error(new Error('still missing')))
      .mockImplementationOnce((id, success) => success({ id }));
    fixtures.loadTexts.mockImplementation(callback => callback(entries));
    component.startup = vi.fn().mockResolvedValue();
    await component.loadInitialText();
    expect(component.state.currentTextInfo).toEqual({ id: 'COMMENT' });

    const first = await makeWindow();
    first.state.textType = 'deafbible';
    first.getParam = vi.fn(() => 'MISSING');
    fixtures.getText
      .mockImplementationOnce((_id, _success, error) => error(new Error('missing')))
      .mockImplementationOnce((_id, _success, error) => error(new Error('still missing')))
      .mockImplementationOnce((id, success) => success({ id }));
    fixtures.loadTexts.mockImplementation(callback => callback([{ id: 'FIRST', type: 'bible' }]));
    first.startup = vi.fn().mockResolvedValue();
    await first.loadInitialText();
    expect(first.state.currentTextInfo).toEqual({ id: 'FIRST' });
  });

  it('reports failure when the final fallback cannot load', async () => {
    const component = await makeWindow();
    component.getParam = vi.fn(() => 'MISSING');
    fixtures.getText.mockImplementation((_id, _success, error) => error(new Error('missing')));
    fixtures.loadTexts.mockImplementation(callback => callback([{ id: 'FALLBACK' }]));
    component.showError = vi.fn();
    await component.loadInitialText();
    expect(component.showError).toHaveBeenCalledWith('Unable to load text');
  });

  it('starts UI collaborators and derives Deaf Bible/default section locations', async () => {
    const component = await makeWindow();
    const info = { id: 'DEAF', abbr: 'ASL' };
    component.state.currentTextInfo = info;
    component.state.textType = 'deafbible';
    component.scroller = fixtures.scroller;
    component.audioController = fixtures.audio;
    component.setTextInfoUI = vi.fn();
    component.updateTabLabel = vi.fn();
    component.updateVersionCycler = vi.fn();
    component.config.deafBibleWindowDefaultBibleFragmentid = 'GN1_1';
    component.getParam = vi.fn(() => null);
    await component.startup();
    expect(fixtures.chooser.setTextInfo).toHaveBeenCalledWith(info);
    expect(component.setTextInfoUI).toHaveBeenCalledWith(info);
    expect(component.updateTabLabel).toHaveBeenCalledWith('abbr:DEAF');
    expect(fixtures.navigator.setTextInfo).toHaveBeenCalledWith(info);
    expect(fixtures.audio.setTextInfo).toHaveBeenCalledWith(info);
    expect(fixtures.scroller.setTextInfo).toHaveBeenCalledWith(info);
    expect(fixtures.scroller.load).toHaveBeenCalledWith('text', 'GN1', 'GN1_1');

    component.state.textType = 'bible';
    component.getParam = vi.fn(key => key === 'sectionid' ? 'EX2' : 'EX2_4');
    await component.startup();
    expect(fixtures.scroller.load).toHaveBeenLastCalledWith('text', 'EX2', 'EX2_4');
  });

  it('updates nav from event or scroller state and suppresses duplicate announcements', async () => {
    const component = await makeWindow();
    component.scroller = fixtures.scroller;
    component.trigger = vi.fn();
    component.getData = vi.fn(() => ({ params: {} }));
    component.updateTextnav();
    expect(component.trigger).not.toHaveBeenCalled();
    const first = { label: 'Genesis 1', fragmentid: 'GN1_1', sectionid: 'GN1' };
    fixtures.scroller.getLocationInfo.mockReturnValue(first);
    component.state.currentTextInfo = { id: 'ENG' };
    component.updateTextnav();
    component.updateTextnav(first);
    expect(component.state.currentLocationInfo).toBe(first);
    expect(component.refs.navui.value).toBe('Genesis 1');
    expect(component.refs.navui.dataset.fragmentid).toBe('GN1_1');
    expect(component.trigger).toHaveBeenCalledOnce();
    component.state.currentTextInfo = { id: 'SPA' };
    component.updateTextnav(first);
    expect(component.trigger).toHaveBeenCalledTimes(2);
  });

  it('sizes content and global popovers beneath the header', async () => {
    const component = await makeWindow();
    Object.defineProperty(component.refs.header, 'offsetHeight', { value: 40 });
    component.size(800, 600);
    expect(component.refs.container.style).toMatchObject({ width: '800px', height: '600px' });
    expect(component.refs.main.style).toMatchObject({ width: '800px', height: '560px' });
    expect(fixtures.chooser.size).toHaveBeenCalledWith(800, 600);
    expect(fixtures.navigator.size).toHaveBeenCalledWith(800, 600);
  });

  it('serializes current or scroller location and returns null for incomplete state', async () => {
    const component = await makeWindow();
    component.scroller = fixtures.scroller;
    expect(component.getData()).toBeNull();
    const info = { id: 'ENG', providerid: 'local:ENG', abbr: 'WEB' };
    const location = {
      sectionid: 'JN3', fragmentid: 'JN3_16', label: 'John 3', labelLong: 'John 3:16'
    };
    component.state.currentTextInfo = info;
    fixtures.scroller.getLocationInfo.mockReturnValue(null);
    expect(component.getData()).toBeNull();
    fixtures.scroller.getLocationInfo.mockReturnValue(location);
    component.state.hasFocus = true;
    expect(component.getData()).toEqual({
      textid: 'local:ENG', abbr: 'WEB', sectionid: 'JN3', fragmentid: 'JN3_16',
      label: 'John 3', labelTab: 'abbr:ENG', labelLong: 'John 3:16', hasFocus: true,
      params: { win: 'bible', textid: 'local:ENG', fragmentid: 'JN3_16' }
    });
    component.state.currentLocationInfo = location;
    fixtures.scroller.getLocationInfo.mockReturnValue({ sectionid: 'OTHER' });
    expect(component.getData().sectionid).toBe('JN3');
  });
});

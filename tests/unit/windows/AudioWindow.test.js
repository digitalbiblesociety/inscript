import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  chooser: null,
  navigator: null,
  controller: null,
  texts: [],
  AudioController: vi.fn(),
  Reference: vi.fn(),
  getText: vi.fn(),
  getTextInfoData: vi.fn(),
  displayAbbr: vi.fn(info => `abbr:${info?.id}`),
  hasLinkedAudio: vi.fn(() => false),
  loadAudioAssociations: vi.fn(() => Promise.resolve()),
  translate: vi.fn(key => key)
}));

vi.mock('@windows/AudioController.js', () => ({ AudioController: fixtures.AudioController }));
vi.mock('@ui/TextChooser.js', () => ({ getGlobalTextChooser: () => fixtures.chooser }));
vi.mock('@ui/TextNavigator.js', () => ({ getGlobalTextNavigator: () => fixtures.navigator }));

vi.mock('@texts/TextLoader.js', () => ({
  getText: fixtures.getText,
  getTextInfoData: fixtures.getTextInfoData,
  displayAbbr: fixtures.displayAbbr
}));

vi.mock('@/data/biblebrainDuplicates.js', () => ({
  bibleBrainExcludeIds: [],
  hasLinkedAudio: fixtures.hasLinkedAudio,
  loadAudioAssociations: fixtures.loadAudioAssociations
}));

vi.mock('@bible/BibleReference.js', () => ({ Reference: fixtures.Reference }));
vi.mock('@lib/i18n.js', () => ({ t: fixtures.translate }));

import { AudioWindow } from '@windows/AudioWindow.js';

function makeChooser() {
  return {
    on: vi.fn(), off: vi.fn(), getTarget: vi.fn(() => null), toggle: vi.fn(),
    setTarget: vi.fn(), setTextInfo: vi.fn(), show: vi.fn(), hide: vi.fn(),
    getTextInfo: vi.fn(() => null)
  };
}

function makeNavigator() {
  return {
    on: vi.fn(), off: vi.fn(), getTarget: vi.fn(() => null), toggle: vi.fn(),
    setTarget: vi.fn(), setTextInfo: vi.fn(), show: vi.fn(), hide: vi.fn()
  };
}

function makeController() {
  return { on: vi.fn(), close: vi.fn(), setTextInfo: vi.fn() };
}

function bibleRef(input) {
  return {
    input,
    toSection: () => String(input),
    toString: () => `formatted:${input}`
  };
}

async function makeWindow() {
  const component = document.createElement('audio-window');
  await component.render();
  component.cacheRefs();
  return component;
}

function listener(listeners, target, event) {
  return listeners.find(entry => entry.target === target && entry.event === event)?.handler;
}

describe('AudioWindow', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fixtures.chooser = makeChooser();
    fixtures.navigator = makeNavigator();
    fixtures.controller = makeController();
    fixtures.texts = [];
    fixtures.AudioController.mockImplementation(() => fixtures.controller);
    fixtures.Reference.mockImplementation(input => bibleRef(input));
    fixtures.getText.mockImplementation((id, callback) => callback({
      id, providerid: `local:${id}`, abbr: id, lang: 'eng'
    }));
    fixtures.getTextInfoData.mockImplementation(() => fixtures.texts);
    fixtures.displayAbbr.mockImplementation(info => `abbr:${info?.id}`);
    fixtures.hasLinkedAudio.mockReturnValue(false);
    fixtures.loadAudioAssociations.mockResolvedValue();
    fixtures.translate.mockImplementation(key => key);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('initializes audio state and shared UI collaborators', () => {
    const component = document.createElement('audio-window');
    expect(component.state).toMatchObject({
      currentTextInfo: null, currentLocationInfo: null, textType: 'audio'
    });
    expect(component.audioController).toBeNull();
    expect(component.scrollerMimic).toBeNull();
    expect(component.textChooser).toBe(fixtures.chooser);
    expect(component.textNavigator).toBe(fixtures.navigator);
  });

  it('renders translated audio chrome and caches all references', async () => {
    const component = await makeWindow();
    expect(component.refs.navui.getAttribute('aria-label')).toBe('windows.bible.gotopassage');
    expect(component.refs.errorPanel.textContent).toContain('windows.audio.noaudiotitle');
    expect(component.refs.container).toBe(component.querySelector('.audio-window-container'));
    expect(component.refs.main).toBe(component.querySelector('.audio-window-main'));
    expect(component.refs.textlistui).toBe(component.querySelector('.text-list'));
  });

  it('wires navigation, chooser, and message listeners', async () => {
    const component = await makeWindow();
    const listeners = [];
    component.addListener = vi.fn((target, event, handler) => listeners.push({ target, event, handler }));
    component.bindHandler = vi.fn((_name, handler) => handler);
    component.on = vi.fn();
    component.handleNavClick = vi.fn();
    component.handleNavKeypress = vi.fn();
    component.handleTextListClick = vi.fn();
    component.handleTextNavigatorChange = vi.fn();
    component.handleTextChooserChange = vi.fn();
    component.handleMessage = vi.fn();
    component.attachEventListeners();
    listener(listeners, component.refs.navui, 'click')({ id: 1 });
    listener(listeners, component.refs.navui, 'keypress')({ id: 2 });
    listener(listeners, component.refs.textlistui, 'click')();
    component._textNavigatorHandler({ data: 3 });
    component._textChooserHandler({ data: 4 });
    component.on.mock.calls[0][1]({ data: 5 });
    expect(component.handleNavClick).toHaveBeenCalledWith({ id: 1 });
    expect(component.handleNavKeypress).toHaveBeenCalledWith({ id: 2 });
    expect(component.handleTextListClick).toHaveBeenCalled();
    expect(component.handleTextNavigatorChange).toHaveBeenCalledWith({ data: 3 });
    expect(component.handleTextChooserChange).toHaveBeenCalledWith({ data: 4 });
    expect(component.handleMessage).toHaveBeenCalledWith({ data: 5 });
  });

  it('creates the controller/scroller bridge and toggles audio availability', async () => {
    const component = await makeWindow();
    component.windowId = 'audio-1';
    component.loadInitialText = vi.fn().mockResolvedValue();
    await component.init();
    expect(component.refs.navui.value).toBe('Reference');
    expect(component.refs.textlistui.innerHTML).toBe('Version');
    expect(component.scrollerMimic.on).toBeTypeOf('function');
    component.state.currentLocationInfo = { sectionid: 'GN1' };
    expect(component.scrollerMimic.getLocationInfo()).toEqual({ sectionid: 'GN1' });
    expect(fixtures.AudioController).toHaveBeenCalledWith(
      'audio-1', component.refs.main, null, component.scrollerMimic
    );
    expect(fixtures.controller.on).toHaveBeenCalledWith('audioavailable', expect.any(Function));
    const available = fixtures.controller.on.mock.calls[0][1];
    available({ data: { hasAudio: false } });
    expect(component.refs.errorPanel.style.display).toBe('');
    expect(component.refs.main.style.display).toBe('none');
    available({ data: { hasAudio: true } });
    expect(component.refs.errorPanel.style.display).toBe('none');
    expect(component.refs.main.style.display).toBe('');
    expect(component.loadInitialText).toHaveBeenCalled();
  });

  it('cleans UI bindings, controller, and scroller listeners', async () => {
    const component = await makeWindow();
    component._textNavigatorHandler = vi.fn();
    component._textChooserHandler = vi.fn();
    component.audioController = fixtures.controller;
    component.scrollerMimic = { clearListeners: vi.fn() };
    component.cleanup();
    expect(fixtures.navigator.off).toHaveBeenCalledWith('change', component._textNavigatorHandler);
    expect(fixtures.chooser.off).toHaveBeenCalledWith('change', component._textChooserHandler);
    expect(fixtures.chooser.hide).toHaveBeenCalled();
    expect(fixtures.navigator.hide).toHaveBeenCalled();
    expect(fixtures.controller.close).toHaveBeenCalled();
    expect(component.scrollerMimic.clearListeners).toHaveBeenCalled();

    const idle = await makeWindow();
    idle.textNavigator = { ...fixtures.navigator, off: vi.fn(), hide: vi.fn() };
    idle.textChooser = { ...fixtures.chooser, off: vi.fn(), hide: vi.fn() };
    expect(() => idle.cleanup()).not.toThrow();
    expect(idle.textNavigator.off).not.toHaveBeenCalled();
    expect(idle.textChooser.off).not.toHaveBeenCalled();
  });

  it('toggles an existing navigator target or configures a new one', async () => {
    const component = await makeWindow();
    component.state.currentTextInfo = { id: 'ENG' };
    fixtures.navigator.getTarget.mockReturnValue(component.refs.navui);
    component.handleNavClick({});
    expect(fixtures.navigator.toggle).toHaveBeenCalled();

    fixtures.navigator.getTarget.mockReturnValue(null);
    component.handleNavClick({});
    expect(fixtures.navigator.setTarget).toHaveBeenCalledWith(component.refs.container, component.refs.navui);
    expect(fixtures.navigator.setTextInfo).toHaveBeenCalledWith(component.state.currentTextInfo);
    expect(fixtures.navigator.show).toHaveBeenCalled();
  });

  it('blurs the nav field on touch environments', async () => {
    if (!('ontouchend' in document)) return;
    const component = await makeWindow();
    const blur = vi.spyOn(component.refs.navui, 'blur');
    component.handleNavClick({});
    expect(blur).toHaveBeenCalled();
  });

  it('changes location for Enter key variants and ignores other or invalid input', async () => {
    const component = await makeWindow();
    component.changeLocation = vi.fn();
    component.refs.navui.value = 'JN3_16';
    component.handleNavKeypress({ keyCode: 12, key: 'x' });
    expect(component.changeLocation).not.toHaveBeenCalled();
    component.handleNavKeypress({ keyCode: 13, key: '' });
    expect(component.changeLocation).toHaveBeenCalledWith('JN3_16');
    component.changeLocation.mockClear();
    component.handleNavKeypress({ keyCode: 0, key: 'Enter' });
    expect(component.changeLocation).toHaveBeenCalledWith('JN3_16');
    fixtures.Reference.mockReturnValueOnce(null);
    component.changeLocation.mockClear();
    component.handleNavKeypress({ keyCode: 13, key: 'Enter' });
    expect(component.changeLocation).not.toHaveBeenCalled();
  });

  it('toggles an existing chooser target or opens a configured audio chooser', async () => {
    const component = await makeWindow();
    component.state.currentTextInfo = { id: 'ENG' };
    fixtures.chooser.getTarget.mockReturnValue(component.refs.textlistui);
    component.handleTextListClick();
    expect(fixtures.chooser.toggle).toHaveBeenCalled();
    fixtures.chooser.getTarget.mockReturnValue(null);
    component.handleTextListClick();
    expect(fixtures.chooser.setTarget).toHaveBeenCalledWith(
      component.refs.container, component.refs.textlistui, 'audio'
    );
    expect(fixtures.chooser.setTextInfo).toHaveBeenCalledWith(component.state.currentTextInfo);
    expect(fixtures.chooser.show).toHaveBeenCalled();
  });

  it('routes direct and wrapped navigator and chooser targets', async () => {
    const component = await makeWindow();
    component.changeLocation = vi.fn();
    component.updateText = vi.fn();
    component.handleTextNavigatorChange({ data: { target: document.body, sectionid: 'GN1' } });
    component.handleTextNavigatorChange({ data: { target: component.refs.navui, sectionid: 'GN1' } });
    component.handleTextNavigatorChange({ data: { target: [component.refs.navui], sectionid: 'GN2' } });
    expect(component.changeLocation).toHaveBeenNthCalledWith(1, 'GN1');
    expect(component.changeLocation).toHaveBeenNthCalledWith(2, 'GN2');

    component.handleTextChooserChange({ data: { target: document.body, textInfo: { id: 'NO' } } });
    component.handleTextChooserChange({ data: { target: component.refs.textlistui, textInfo: { id: 'ENG' } } });
    component.handleTextChooserChange({ data: { target: [component.refs.textlistui], textInfo: { id: 'SPA' } } });
    expect(component.updateText).toHaveBeenNthCalledWith(1, { id: 'ENG' });
    expect(component.updateText).toHaveBeenNthCalledWith(2, { id: 'SPA' });
    expect(() => component.handleMessage({ data: {} })).not.toThrow();
  });

  it('updates location state, emits both bridges, hides navigation, and formats input', async () => {
    const component = await makeWindow();
    component.scrollerMimic = { trigger: vi.fn() };
    component.trigger = vi.fn();
    component.getData = vi.fn(() => ({ params: {} }));
    const blur = vi.spyOn(component.refs.navui, 'blur');
    component.changeLocation('JN3_16');
    expect(component.state.currentLocationInfo).toEqual({ fragmentid: 'JN3_16', sectionid: 'JN3' });
    expect(component.scrollerMimic.trigger).toHaveBeenCalledWith('locationchange', {
      type: 'locationchange', target: component,
      data: { fragmentid: 'JN3_16', sectionid: 'JN3' }
    });
    expect(component.trigger).toHaveBeenCalledWith('settingschange', {
      type: 'settingschange', target: component, data: { params: {} }
    });
    expect(fixtures.navigator.hide).toHaveBeenCalled();
    expect(component.refs.navui.value).toBe('formatted:JN3_16');
    expect(component.refs.navui.dataset.fragmentid).toBe('JN3_16');
    expect(blur).toHaveBeenCalled();

    component.scrollerMimic = null;
    component.textNavigator = null;
    expect(() => component.changeLocation('GN1')).not.toThrow();
  });

  it('renders its reference input with the text numbering system', async () => {
    const component = await makeWindow();
    component.scrollerMimic = { trigger: vi.fn() };
    component.trigger = vi.fn();
    component.getData = vi.fn(() => ({}));
    component.state.currentTextInfo = { lang: 'arb' };
    fixtures.Reference.mockReturnValueOnce({
      toSection: () => 'JN3_16',
      toString: () => 'John 3:16'
    });

    component.changeLocation('JN3_16');
    expect(component.refs.navui.value).toBe('John ٣:١٦');
    expect(component.refs.navui.dataset.fragmentid).toBe('JN3_16');
  });

  it('updates UI and audio collaborators only for valid text info', async () => {
    const component = await makeWindow();
    component.updateTabLabel = vi.fn();
    component.audioController = fixtures.controller;
    component.updateText(null);
    expect(component.state.currentTextInfo).toBeNull();
    const info = { id: 'ENG', abbr: 'WEB' };
    component.updateText(info);
    expect(component.refs.textlistui.innerHTML).toBe('abbr:ENG');
    expect(component.updateTabLabel).toHaveBeenCalledWith('abbr:ENG');
    expect(fixtures.navigator.setTextInfo).toHaveBeenCalledWith(info);
    expect(fixtures.controller.setTextInfo).toHaveBeenCalledWith(info);
    expect(component.state.currentTextInfo).toBe(info);

    component.textNavigator = null;
    component.audioController = null;
    expect(() => component.updateText({ id: 'SPA' })).not.toThrow();
  });

  it('loads associations, initial location, and an explicit initial text', async () => {
    const component = await makeWindow();
    component.initData = { fragmentid: 'JN3_16', textid: 'ENG' };
    component.changeLocation = vi.fn();
    component.updateText = vi.fn();
    await component.loadInitialText();
    expect(fixtures.loadAudioAssociations).toHaveBeenCalled();
    expect(component.changeLocation).toHaveBeenCalledWith('JN3_16');
    expect(fixtures.getText).toHaveBeenCalledWith('ENG', expect.any(Function));
    expect(component.updateText).toHaveBeenCalledWith(expect.objectContaining({ id: 'ENG' }));
  });

  it('uses configured/default locations and auto-selects or skips an audio Bible', async () => {
    const component = await makeWindow();
    component.initData = null;
    component.config.newWindowFragmentid = 'GN1_1';
    component.changeLocation = vi.fn();
    component._findBestAudioBible = vi.fn().mockReturnValueOnce('AUTO').mockReturnValueOnce(null);
    component.updateText = vi.fn();
    await component.loadInitialText();
    expect(component.changeLocation).toHaveBeenCalledWith('GN1_1');
    expect(component._findBestAudioBible).toHaveBeenCalledWith(undefined);
    expect(fixtures.getText).toHaveBeenCalledWith('AUTO', expect.any(Function));

    fixtures.getText.mockClear();
    component.initData = { fragmentid: '', textid: '', _activeBibleTextid: 'local:ENG' };
    component.config.newWindowFragmentid = '';
    await component.loadInitialText();
    expect(fixtures.getText).not.toHaveBeenCalled();
  });

  it('logs initial text loading failures', async () => {
    const component = await makeWindow();
    component.initData = { textid: 'MISSING' };
    component.changeLocation = vi.fn();
    fixtures.getText.mockImplementation(() => { throw new Error('offline'); });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await component.loadInitialText();
    expect(consoleError).toHaveBeenCalledWith('Error loading text:', 'MISSING', expect.any(Error));
  });

  it('finds exact, same-language, English, and first available audio Bibles', () => {
    const component = document.createElement('audio-window');
    const local = { id: 'LOCAL', abbr: 'LOC', providerid: 'p:LOCAL', lang: 'spa', hasAudio: true };
    const active = { id: 'ACTIVE', abbr: 'ACT', lang: 'spa' };
    const english = { id: 'ENGLISH', lang: 'eng', audioDirectory: 'audio' };
    const french = { id: 'FRENCH', lang: 'fra', fcbh_audio_ot: 'ot' };
    fixtures.texts = [active, local, english, french];
    expect(component._findBestAudioBible('provider:LOCAL')).toBe('p:LOCAL');
    expect(component._findBestAudioBible('ACTIVE')).toBe('p:LOCAL');
    expect(component._findBestAudioBible('MISSING')).toBe('ENGLISH');

    fixtures.texts = [french];
    expect(component._findBestAudioBible()).toBe('FRENCH');
    expect(component._findBestAudioBible('provider:FRENCH')).toBe('FRENCH');
  });

  it('recognizes Bible Brain, linked, and NT audio and rejects an audio-free catalog', () => {
    const component = document.createElement('audio-window');
    const brain = { id: 'BRAIN', lang: 'deu', biblebrain: { audioFilesets: [{}] } };
    const nt = { id: 'NT', lang: 'fra', fcbh_audio_nt: 'nt' };
    const linked = { id: 'LINKED', lang: 'ita' };
    fixtures.hasLinkedAudio.mockImplementation(text => text === linked);
    fixtures.texts = [brain, nt, linked];
    expect(component._findBestAudioBible('BRAIN')).toBe('BRAIN');
    expect(component._findBestAudioBible('NT')).toBe('NT');
    expect(component._findBestAudioBible('LINKED')).toBe('LINKED');
    fixtures.texts = [{ id: 'SILENT', lang: 'eng' }];
    expect(component._findBestAudioBible()).toBeNull();
    fixtures.getTextInfoData.mockReturnValueOnce(null);
    expect(component._findBestAudioBible()).toBeNull();
  });

  it('sizes the container and returns null without complete state', async () => {
    const component = await makeWindow();
    component.size(640, 480);
    expect(component.refs.container.style.width).toBe('640px');
    expect(component.refs.container.style.height).toBe('480px');
    expect(component.getData()).toBeNull();
    fixtures.chooser.getTextInfo.mockReturnValue({ id: 'ENG' });
    component.scrollerMimic = { getLocationInfo: () => null };
    expect(component.getData()).toBeNull();
  });

  it('serializes state or chooser/scroller fallbacks', async () => {
    const component = await makeWindow();
    const info = { id: 'ENG', providerid: 'local:ENG', abbr: 'WEB' };
    const location = {
      sectionid: 'JN3', fragmentid: 'JN3_16', label: 'John 3', labelLong: 'John 3:16'
    };
    component.state.currentTextInfo = info;
    component.state.currentLocationInfo = location;
    expect(component.getData()).toEqual({
      textid: 'local:ENG', abbr: 'WEB', sectionid: 'JN3', fragmentid: 'JN3_16',
      label: 'John 3', labelTab: 'abbr:ENG', labelLong: 'John 3:16',
      params: { win: 'audio', textid: 'local:ENG', fragmentid: 'JN3_16' }
    });

    component.state.currentTextInfo = null;
    component.state.currentLocationInfo = null;
    fixtures.chooser.getTextInfo.mockReturnValue(info);
    component.scrollerMimic = { getLocationInfo: () => location };
    expect(component.getData()).toMatchObject({ textid: 'local:ENG', fragmentid: 'JN3_16' });
  });
});

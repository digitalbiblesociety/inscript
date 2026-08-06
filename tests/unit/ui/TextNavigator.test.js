import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  offset: vi.fn(() => ({ top: 20, left: 30 })),
  toBcp47Lang: vi.fn(lang => `bcp:${lang}`),
  addNames: vi.fn(),
  Reference: vi.fn(),
  handleDivisionClick: vi.fn(),
  renderDivisions: vi.fn(),
  renderSections: vi.fn(),
  applyFilter: vi.fn(),
  ensurePericopes: vi.fn(),
  filterBooks: vi.fn(),
  highlightCurrentPassage: vi.fn(),
  hasPericopeTranslation: vi.fn(() => true),
  renderActiveBookPassages: vi.fn(),
  renderSearchResults: vi.fn(() => ['results']),
  setActiveBook: vi.fn()
}));

vi.mock('@lib/helpers.esm.js', async (importOriginal) => ({
  ...(await importOriginal()), offset: fixtures.offset
}));
vi.mock('@lib/bcp47.js', () => ({ toBcp47Lang: fixtures.toBcp47Lang }));
vi.mock('@bible/BibleData.js', () => ({ addNames: fixtures.addNames }));
vi.mock('@bible/BibleReference.js', () => ({ Reference: fixtures.Reference }));
vi.mock('@ui/TextNavigatorBooks.js', () => ({
  handleDivisionClick: fixtures.handleDivisionClick,
  renderDivisions: fixtures.renderDivisions,
  renderSections: fixtures.renderSections
}));
vi.mock('@ui/TextNavigatorPericopes.js', () => ({
  applyFilter: fixtures.applyFilter,
  ensurePericopes: fixtures.ensurePericopes,
  filterBooks: fixtures.filterBooks,
  highlightCurrentPassage: fixtures.highlightCurrentPassage,
  hasPericopeTranslation: fixtures.hasPericopeTranslation,
  renderActiveBookPassages: fixtures.renderActiveBookPassages,
  renderSearchResults: fixtures.renderSearchResults,
  setActiveBook: fixtures.setActiveBook
}));

import { getGlobalTextNavigator, TextNavigator } from '@ui/TextNavigator.js';

function makeNavigator() {
  const navigator = TextNavigator();
  navigator.refs.changer.showPopover = vi.fn();
  navigator.refs.changer.hidePopover = vi.fn();
  navigator.refs.changer.matches = vi.fn(() => false);
  return navigator;
}

describe('TextNavigator', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fixtures.offset.mockReturnValue({ top: 20, left: 30 });
    fixtures.hasPericopeTranslation.mockReturnValue(true);
    fixtures.renderSearchResults.mockReturnValue(['results']);
    fixtures.Reference.mockImplementation(input => ({ toSection: () => input }));
  });

  it('initializes navigation state, UI, and event emitter behavior', () => {
    const navigator = makeNavigator();
    expect(navigator).toMatchObject({
      container: null, target: null, isFull: false, textInfo: null,
      fullBookMode: false, activeBookId: null, lastFragmentid: null
    });
    expect(navigator.refs.changer.parentNode).toBe(document.body);
    expect(navigator.refs.filter.placeholder).toBe('Filter books…');
    expect(navigator.on).toBeTypeOf('function');
  });

  it('routes filter, pericope, division, and section DOM events', () => {
    const navigator = makeNavigator();
    navigator.applyFilter = vi.fn();
    navigator.handleFilterKeydown = vi.fn();
    navigator.navigateToPericope = vi.fn();
    navigator.handleDivisionClick = vi.fn();
    navigator.navigateToSection = vi.fn();
    navigator.refs.filter.dispatchEvent(new Event('input'));
    navigator.refs.filter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    navigator.refs.periList.innerHTML = '<div class="peri-item"><span></span></div><button></button>';
    navigator.refs.periList.querySelector('span').click();
    navigator.refs.periList.querySelector('button').click();
    navigator.refs.changer.innerHTML += `
      <div class="text-navigator-division"><span class="division-child"></span></div>
      <div class="text-navigator-section"><span class="section-child"></span></div>`;
    navigator.refs.changer.querySelector('.division-child').click();
    navigator.refs.changer.querySelector('.section-child').click();
    expect(navigator.applyFilter).toHaveBeenCalled();
    expect(navigator.handleFilterKeydown).toHaveBeenCalled();
    expect(navigator.navigateToPericope).toHaveBeenCalledWith(expect.any(Element));
    expect(navigator.handleDivisionClick).toHaveBeenCalledWith(expect.any(Element));
    expect(navigator.navigateToSection).toHaveBeenCalledWith(expect.any(Element));
  });

  it('delegates pericope and book behavior', () => {
    const navigator = makeNavigator();
    expect(navigator.hasPericopeTranslation()).toBe(true);
    navigator.renderActiveBookPassages('GN');
    expect(navigator.renderSearchResults('love')).toEqual(['results']);
    navigator.filterBooks('gen');
    navigator.applyFilter();
    navigator.highlightCurrentPassage('GN1_1');
    navigator.setActiveBook('GN', 'GN1_1');
    expect(fixtures.renderActiveBookPassages).toHaveBeenCalledWith(navigator, 'GN');
    expect(fixtures.renderSearchResults).toHaveBeenCalledWith(navigator, 'love');
    expect(fixtures.filterBooks).toHaveBeenCalledWith(navigator, 'gen');
    expect(fixtures.applyFilter).toHaveBeenCalledWith(navigator);
    expect(fixtures.highlightCurrentPassage).toHaveBeenCalledWith(navigator, 'GN1_1');
    expect(fixtures.setActiveBook).toHaveBeenCalledWith(navigator, 'GN', 'GN1_1');
  });

  it('uses Enter to navigate to a translated pericope search result', () => {
    const navigator = makeNavigator();
    navigator.refs.filter.value = 'creation';
    navigator.refs.periList.innerHTML = '<div class="peri-item" data-section="GN1"></div>';
    navigator.navigateToPericope = vi.fn();
    const event = { key: 'Enter', preventDefault: vi.fn() };
    navigator.handleFilterKeydown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(navigator.navigateToPericope).toHaveBeenCalledWith(
      navigator.refs.periList.querySelector('.peri-item')
    );
  });

  it('uses Enter to click the first visible unselected division', () => {
    const navigator = makeNavigator();
    navigator.refs.filter.value = '';
    navigator.refs.divisions.innerHTML = `
      <button class="text-navigator-division" style="display:none"></button>
      <button class="text-navigator-division selected"></button>
      <button class="text-navigator-division" id="visible"></button>`;
    const selectedClick = vi.spyOn(navigator.refs.divisions.children[1], 'click');
    const visibleClick = vi.spyOn(navigator.refs.divisions.children[2], 'click');
    navigator.handleFilterKeydown({ key: 'x', preventDefault: vi.fn() });
    navigator.handleFilterKeydown({ key: 'Enter', preventDefault: vi.fn() });
    expect(selectedClick).not.toHaveBeenCalled();
    expect(visibleClick).not.toHaveBeenCalled();

    navigator.refs.divisions.children[1].classList.remove('selected');
    navigator.handleFilterKeydown({ key: 'Enter', preventDefault: vi.fn() });
    expect(selectedClick).toHaveBeenCalled();
  });

  it('emits pericope and section changes and hides the popover', () => {
    const navigator = makeNavigator();
    navigator.target = document.createElement('input');
    const changed = vi.fn();
    navigator.on('change', changed);
    navigator.navigateToPericope(null);
    expect(changed).not.toHaveBeenCalled();
    const item = document.createElement('div');
    item.dataset.section = 'GN1';
    item.dataset.fragment = 'GN1_1';
    navigator.navigateToPericope(item);
    expect(changed).toHaveBeenCalledWith({
      type: 'change', target: item,
      data: { sectionid: 'GN1', fragmentid: 'GN1_1', target: navigator.target }
    });
    const section = document.createElement('div');
    section.dataset.id = 'JN3';
    navigator.navigateToSection(section);
    expect(section.classList).toContain('selected');
    expect(changed).toHaveBeenLastCalledWith({
      type: 'change', target: section,
      data: { sectionid: 'JN3', target: navigator.target }
    });
    expect(navigator.refs.changer.hidePopover).toHaveBeenCalledTimes(2);
  });

  it('toggles by visibility and closes through hide', () => {
    const navigator = makeNavigator();
    navigator.show = vi.fn();
    navigator.refs.changer.matches.mockReturnValueOnce(false).mockReturnValueOnce(true);
    navigator.toggle();
    expect(navigator.show).toHaveBeenCalled();
    navigator.toggle();
    expect(navigator.refs.changer.hidePopover).toHaveBeenCalled();
    navigator.close();
    expect(navigator.refs.changer.hidePopover).toHaveBeenCalledTimes(2);
  });

  it('applies text direction and BCP-47 language attributes when available', () => {
    const navigator = makeNavigator();
    navigator.textInfo = { dir: 'rtl', lang: 'arb' };
    navigator.refs.divisions.style.display = 'none';
    navigator.applyDivisionAttrs();
    expect(navigator.refs.divisions.style.display).toBe('');
    expect(navigator.refs.divisions.getAttribute('dir')).toBe('rtl');
    expect(navigator.refs.divisions.getAttribute('lang')).toBe('bcp:arb');
    expect(navigator.refs.pericopes.getAttribute('dir')).toBe('rtl');
    expect(navigator.refs.pericopes.getAttribute('lang')).toBe('bcp:arb');

    navigator.textInfo = {};
    navigator.refs.divisions.removeAttribute('dir');
    navigator.refs.divisions.removeAttribute('lang');
    navigator.applyDivisionAttrs();
    expect(navigator.refs.divisions.hasAttribute('dir')).toBe(false);
  });

  it('selects the current division, section, and active passage', () => {
    const navigator = makeNavigator();
    navigator.renderSections = vi.fn();
    navigator.setActiveBook = vi.fn();
    navigator.selectCurrentReference(null);
    navigator.refs.changer.innerHTML += `
      <div class="divisionid-GN"><button class="section-GN1"></button></div>`;
    navigator.selectCurrentReference('EX1_1');
    expect(navigator.renderSections).not.toHaveBeenCalled();
    navigator.selectCurrentReference('GN1_1');
    const division = navigator.refs.changer.querySelector('.divisionid-GN');
    expect(division.classList).toContain('selected');
    expect(division.querySelector('.section-GN1').classList).toContain('selected');
    expect(navigator.renderSections).toHaveBeenCalledWith(false);
    expect(navigator.setActiveBook).toHaveBeenCalledWith('GN', 'GN1_1');
  });

  it('renders Bible navigation from a valid target reference or no selection', () => {
    const navigator = makeNavigator();
    navigator.target = document.createElement('input');
    navigator.target.value = 'John 3:16';
    navigator.renderDivisions = vi.fn();
    navigator.applyDivisionAttrs = vi.fn();
    navigator.selectCurrentReference = vi.fn();
    navigator.showBibleNav();
    expect(navigator.selectCurrentReference).toHaveBeenCalledWith('John 3:16');
    navigator.target.dataset.fragmentid = 'JN4_2';
    navigator.showBibleNav();
    expect(navigator.selectCurrentReference).toHaveBeenLastCalledWith('JN4_2');
    expect(fixtures.Reference).toHaveBeenCalledOnce();
    delete navigator.target.dataset.fragmentid;
    fixtures.Reference.mockReturnValueOnce(null);
    navigator.showBibleNav();
    expect(navigator.selectCurrentReference).toHaveBeenLastCalledWith(null);
  });

  it('prepares translated pericopes and refreshes only while still open in the same language', () => {
    const navigator = makeNavigator();
    navigator.textInfo = { lang: 'eng' };
    navigator.refs.changer.matches.mockReturnValue(true);
    navigator.refs.filter.value = 'love';
    navigator.applyFilter = vi.fn();
    navigator.setActiveBook = vi.fn();
    navigator.preparePericopes();
    expect(navigator.refs.changer.classList).toContain('text-navigator-2col');
    expect(navigator.refs.pericopes.style.display).toBe('');
    expect(navigator.refs.filter.placeholder).toBe('Filter books or passages…');
    expect(fixtures.ensurePericopes.mock.calls[0][0]).toBe('eng');
    const callback = fixtures.ensurePericopes.mock.calls[0][1];
    callback();
    expect(navigator.applyFilter).toHaveBeenCalled();

    navigator.refs.filter.value = '';
    navigator.activeBookId = 'GN';
    navigator.lastFragmentid = 'GN1_1';
    callback();
    expect(navigator.setActiveBook).toHaveBeenCalledWith('GN', 'GN1_1');
    navigator.refs.changer.matches.mockReturnValue(false);
    callback();
    fixtures.hasPericopeTranslation.mockReturnValue(false);
    navigator.refs.changer.matches.mockReturnValue(true);
    callback();
    expect(navigator.setActiveBook).toHaveBeenCalledOnce();
  });

  it('prepares a one-column navigator for an unsupported language', () => {
    fixtures.hasPericopeTranslation.mockReturnValue(false);
    const navigator = makeNavigator();
    navigator.refs.periHeader.textContent = 'old';
    navigator.refs.periList.innerHTML = '<span>old</span>';
    navigator.preparePericopes();
    expect(fixtures.ensurePericopes).not.toHaveBeenCalled();
    expect(navigator.refs.changer.classList).not.toContain('text-navigator-2col');
    expect(navigator.refs.pericopes.style.display).toBe('none');
    expect(navigator.refs.filter.placeholder).toBe('Filter books…');
    expect(navigator.refs.periHeader.textContent).toBe('');
    expect(navigator.refs.periList.innerHTML).toBe('');
  });

  it('shows Bible or book navigation and resets selected/scroll state', () => {
    const navigator = makeNavigator();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    navigator.show();
    expect(consoleWarn).toHaveBeenCalledWith('navigator has no textInfo!');
    navigator.textInfo = { type: 'bible' };
    navigator.preparePericopes = vi.fn();
    navigator.size = vi.fn();
    navigator.showBibleNav = vi.fn();
    navigator.refs.changer.innerHTML += '<span class="selected"></span>';
    navigator.refs.divisions.scrollTop = 40;
    navigator.show();
    expect(navigator.refs.filter.value).toBe('');
    expect(navigator.activeBookId).toBeNull();
    expect(navigator.size).toHaveBeenCalledTimes(2);
    expect(navigator.refs.changer.showPopover).toHaveBeenCalled();
    expect(navigator.refs.changer.querySelector('.selected')).toBeNull();
    expect(navigator.refs.divisions.scrollTop).toBe(0);
    expect(navigator.showBibleNav).toHaveBeenCalled();

    navigator.textInfo = { type: 'BOOK' };
    navigator.renderSections = vi.fn();
    navigator.show();
    expect(navigator.renderSections).toHaveBeenCalled();
    expect(navigator.refs.divisions.style.display).toBe('none');

    navigator.textInfo = { type: 'unknown' };
    expect(() => navigator.show()).not.toThrow();
  });

  it('delegates book render and click methods', () => {
    const navigator = makeNavigator();
    const division = document.createElement('div');
    navigator.renderDivisions();
    navigator.renderSections(true);
    navigator.handleDivisionClick(division);
    expect(fixtures.renderDivisions).toHaveBeenCalledWith(navigator);
    expect(fixtures.renderSections).toHaveBeenCalledWith(navigator, true);
    expect(fixtures.handleDivisionClick).toHaveBeenCalledWith(navigator, division);
  });

  it('sizes a full navigator using explicit or container dimensions', () => {
    const navigator = makeNavigator();
    const container = document.createElement('div');
    Object.defineProperties(container, {
      offsetWidth: { value: 500 }, offsetHeight: { value: 400 }
    });
    navigator.container = container;
    navigator.isFull = true;
    fixtures.offset.mockReturnValue({ top: 10, left: 15 });
    navigator.size();
    expect(navigator.refs.changer.style).toMatchObject({
      width: '500px', height: '400px', top: '10px', left: '15px'
    });
    navigator.size(600, 450);
    expect(navigator.refs.changer.style.width).toBe('600px');
  });

  it('sizes an anchored navigator and clamps horizontal overflow', () => {
    const navigator = makeNavigator();
    navigator.size();
    expect(fixtures.offset).not.toHaveBeenCalled();
    const target = document.createElement('button');
    Object.defineProperty(target, 'offsetHeight', { value: 25 });
    Object.defineProperty(navigator.refs.changer, 'offsetWidth', { value: 300 });
    Object.defineProperty(navigator.refs.header, 'offsetHeight', { value: 40 });
    navigator.target = target;
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 1000 },
      innerHeight: { configurable: true, value: 800 }
    });
    navigator.size();
    expect(navigator.refs.changer.style).toMatchObject({ height: '705px', top: '55px', left: '30px' });
    expect(navigator.refs.body.style.height).toBe('665px');
    expect(navigator.refs.changer.style.getPropertyValue('--arrow-left')).toBe('20px');

    fixtures.offset.mockReturnValue({ top: 20, left: 900 });
    navigator.size();
    expect(navigator.refs.changer.style.left).toBe('700px');
    expect(navigator.refs.changer.style.getPropertyValue('--arrow-left')).toBe('220px');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 200 });
    navigator.size();
    expect(navigator.refs.changer.style.left).toBe('0px');
  });

  it('sets text metadata, pericopes, and localized division names', () => {
    const navigator = makeNavigator();
    navigator.setTextInfo(null);
    expect(fixtures.ensurePericopes).not.toHaveBeenCalled();
    const english = {
      lang: 'eng', divisions: ['GN'], divisionNames: ['Genesis']
    };
    navigator.setTextInfo(english);
    expect(navigator.textInfo).toBe(english);
    expect(fixtures.ensurePericopes).toHaveBeenCalled();
    expect(fixtures.addNames).toHaveBeenCalledWith('eng', ['GN'], ['Genesis']);

    fixtures.hasPericopeTranslation.mockReturnValue(false);
    navigator.setTextInfo({ lang: 'swh' });
    expect(fixtures.ensurePericopes).toHaveBeenCalledOnce();
    expect(fixtures.addNames).toHaveBeenCalledOnce();
  });

  it('reports visibility, target state, node, and destroys its DOM', () => {
    const navigator = makeNavigator();
    navigator.refs.changer.matches.mockReturnValue(true);
    expect(navigator.isVisible()).toBe(true);
    expect(navigator.node()).toBe(navigator.refs.changer);
    const container = document.createElement('div');
    const target = document.createElement('button');
    navigator.setTarget(container, target);
    expect(navigator.container).toBe(container);
    expect(navigator.getTarget()).toBe(target);
    navigator.destroy();
    expect(navigator.refs.changer.parentNode).toBeNull();
  });

  it('returns a stable global navigator singleton', () => {
    expect(getGlobalTextNavigator()).toBe(getGlobalTextNavigator());
  });
});

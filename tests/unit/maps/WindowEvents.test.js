import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachMapWindowListeners } from '@windows/MapWindow/WindowEvents.js';

function makeElement(tag = 'div', className = '') {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

function nestedTarget(className, attributes = {}) {
  const parent = makeElement('div', className);
  for (const [name, value] of Object.entries(attributes)) {
    if (name.startsWith('data-')) parent.setAttribute(name, value);
    else parent.dataset[name] = value;
  }
  const child = document.createElement('span');
  parent.appendChild(child);
  return { parent, child };
}

function makeComponent({ windowsMain = true } = {}) {
  document.body.innerHTML = windowsMain ? '<main class="windows-main"></main>' : '';
  const refs = {
    mapSearchInput: makeElement('input'),
    searchSuggestions: makeElement(),
    modeToggle: makeElement(),
    journeyList: makeElement('button'),
    journeyMenu: makeElement(),
    header: makeElement(),
    eraFilter: makeElement(),
    emptyExploreBtn: makeElement('button'),
    detailBack: makeElement('button'),
    main: makeElement(),
    mapContainer: makeElement(),
    detail: makeElement(),
    detailContent: makeElement()
  };
  refs.detail.classList.add('hidden');
  const listeners = [];
  const subscriptions = [];
  const journey = { id: 'paul', stops: [{ name: 'Antioch' }] };
  const location = { name: 'Jerusalem', verses: ['JN3_16'] };
  const mapPanel = {
    locationData: [location],
    locationDataByVerse: { JN3_16: [location] },
    getActiveJourneyIds: vi.fn(() => []),
    getJourney: vi.fn(() => journey),
    setExploreEra: vi.fn(),
    resetMarkerOpacity: vi.fn(),
    openLocation: vi.fn(),
    openStop: vi.fn(),
    filterBySection: vi.fn()
  };
  const component = {
    refs,
    state: {
      currentSuggestions: [],
      referenceSuggestion: null,
      selectedSuggestionIndex: -1
    },
    mapPanel,
    setMode: vi.fn(),
    selectJourney: vi.fn(),
    showJourneyStops: vi.fn(),
    toggleJourneyMenu: vi.fn(),
    hideDetail: vi.fn(() => refs.detail.classList.add('hidden')),
    trigger: vi.fn(),
    handleMessage: vi.fn(),
    handleGlobalMessage: vi.fn(),
    updateEmptyState: vi.fn(),
    escapeHtml: value => String(value),
    addListener: vi.fn((target, type, callback, options) => {
      listeners.push({ target, type, callback, options });
    }),
    on: vi.fn((type, callback) => subscriptions.push({ type, callback }))
  };
  attachMapWindowListeners(component);
  return { component, listeners, subscriptions, journey, location };
}

function callback(listeners, target, type) {
  return listeners.find(listener => listener.target === target && listener.type === type).callback;
}

function eventFor(target, extra = {}) {
  return {
    target,
    preventDefault: vi.fn(),
    ...extra
  };
}

describe('MapWindow DOM listeners', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('wires all chrome listeners, delegated location clicks, and messages', () => {
    const { component, listeners, subscriptions } = makeComponent();

    expect(component.addListener).toHaveBeenCalledTimes(19);
    expect(listeners.at(-1).target).toBe(document.querySelector('.windows-main'));
    expect(subscriptions.map(({ type }) => type)).toEqual(['message', 'globalmessage']);

    subscriptions[0].callback({ data: 1 });
    subscriptions[1].callback({ data: 2 });
    expect(component.handleMessage).toHaveBeenCalledWith({ data: 1 });
    expect(component.handleGlobalMessage).toHaveBeenCalledWith({ data: 2 });
  });

  it('omits delegated location wiring when the workspace is absent', () => {
    const { component, listeners } = makeComponent({ windowsMain: false });
    expect(component.addListener).toHaveBeenCalledTimes(18);
    expect(listeners.some(({ target }) => target?.classList?.contains('windows-main'))).toBe(false);
  });

  it('searches on input, handles keyboard selection, and hides after blur', () => {
    const { component, listeners } = makeComponent();
    const input = callback(listeners, component.refs.mapSearchInput, 'input');
    const keydown = callback(listeners, component.refs.mapSearchInput, 'keydown');
    const blur = callback(listeners, component.refs.mapSearchInput, 'blur');
    component.refs.mapSearchInput.value = 'Jerusalem';

    input();
    expect(component.state.currentSuggestions).toHaveLength(1);
    expect(component.refs.searchSuggestions.style.display).toBe('block');

    const down = eventFor(component.refs.mapSearchInput, { key: 'ArrowDown' });
    keydown(down);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(component.state.selectedSuggestionIndex).toBe(0);

    blur();
    expect(component.refs.searchSuggestions.style.display).toBe('block');
    vi.advanceTimersByTime(150);
    expect(component.refs.searchSuggestions.style.display).toBe('none');
  });

  it('switches ordinary modes and ignores clicks outside a mode button', () => {
    const { component, listeners } = makeComponent();
    const click = callback(listeners, component.refs.modeToggle, 'click');
    click(eventFor(document.createElement('span')));
    expect(component.setMode).not.toHaveBeenCalled();

    const { child } = nestedTarget('map-mode-btn', { mode: 'explore' });
    click(eventFor(child));
    expect(component.setMode).toHaveBeenCalledWith('explore');
    expect(component.mapPanel.getActiveJourneyIds).not.toHaveBeenCalled();
  });

  it('selects the first journey on initial entry and tolerates an empty menu', () => {
    const { component, listeners } = makeComponent();
    const click = callback(listeners, component.refs.modeToggle, 'click');
    const first = makeElement('button', 'map-journey-menu-item');
    first.dataset.journeyId = 'first';
    component.refs.journeyMenu.appendChild(first);
    const { child } = nestedTarget('map-mode-btn', { mode: 'journeys' });

    click(eventFor(child));
    expect(component.setMode).toHaveBeenCalledWith('journeys');
    expect(component.selectJourney).toHaveBeenCalledWith('first');

    component.selectJourney.mockClear();
    first.remove();
    click(eventFor(child));
    expect(component.selectJourney).not.toHaveBeenCalled();

    component.mapPanel = null;
    expect(() => click(eventFor(child))).not.toThrow();
  });

  it('restores the active journey stop list on re-entry', () => {
    const { component, listeners, journey } = makeComponent();
    const click = callback(listeners, component.refs.modeToggle, 'click');
    component.mapPanel.getActiveJourneyIds.mockReturnValue(['paul']);
    const { child } = nestedTarget('map-mode-btn', { mode: 'journeys' });

    click(eventFor(child));

    expect(component.mapPanel.getJourney).toHaveBeenCalledWith('paul');
    expect(component.showJourneyStops).toHaveBeenCalledWith(journey);
  });

  it('opens a journey from its menu and toggles the menu trigger', () => {
    const { component, listeners } = makeComponent();
    const trigger = callback(listeners, component.refs.journeyList, 'click');
    const menuClick = callback(listeners, component.refs.journeyMenu, 'click');

    trigger();
    expect(component.toggleJourneyMenu).toHaveBeenCalledWith();

    menuClick(eventFor(document.createElement('span')));
    expect(component.selectJourney).not.toHaveBeenCalled();
    const { child } = nestedTarget('map-journey-menu-item', { journeyId: 'paul' });
    menuClick(eventFor(child));
    expect(component.selectJourney).toHaveBeenCalledWith('paul');
  });

  it('dismisses an open journey menu on outside click but not inside click', () => {
    const { component, listeners } = makeComponent();
    const documentClick = callback(listeners, document, 'click');
    documentClick(eventFor(document.body));
    expect(component.toggleJourneyMenu).not.toHaveBeenCalled();

    component.refs.journeyMenu.style.display = 'block';
    const { child } = nestedTarget('map-journey-list');
    documentClick(eventFor(child));
    expect(component.toggleJourneyMenu).not.toHaveBeenCalled();

    documentClick(eventFor(document.body));
    expect(component.toggleJourneyMenu).toHaveBeenCalledWith(false);
  });

  it('closes the journey menu with Escape and restores trigger focus', () => {
    const { component, listeners } = makeComponent();
    const keydown = callback(listeners, component.refs.header, 'keydown');
    const focus = vi.spyOn(component.refs.journeyList, 'focus');
    const ignored = eventFor(component.refs.header, { key: 'Enter' });
    keydown(ignored);
    expect(ignored.preventDefault).not.toHaveBeenCalled();

    component.refs.journeyMenu.style.display = 'block';
    const escape = eventFor(component.refs.header, { key: 'Escape' });
    keydown(escape);
    expect(escape.preventDefault).toHaveBeenCalled();
    expect(component.toggleJourneyMenu).toHaveBeenCalledWith(false);
    expect(focus).toHaveBeenCalled();
  });

  it('marks one era active and filters the map', () => {
    const { component, listeners } = makeComponent();
    const click = callback(listeners, component.refs.eraFilter, 'click');
    const oldButton = makeElement('button', 'map-era-btn active');
    const newButton = makeElement('button', 'map-era-btn');
    newButton.dataset.era = 'nt';
    component.refs.eraFilter.append(oldButton, newButton);

    click(eventFor(document.createElement('span')));
    expect(component.mapPanel.setExploreEra).not.toHaveBeenCalled();
    click(eventFor(newButton));

    expect(oldButton.classList).not.toContain('active');
    expect(oldButton.getAttribute('aria-pressed')).toBe('false');
    expect(newButton.classList).toContain('active');
    expect(newButton.getAttribute('aria-pressed')).toBe('true');
    expect(component.mapPanel.setExploreEra).toHaveBeenCalledWith('nt');

    component.mapPanel = null;
    expect(() => click(eventFor(newButton))).not.toThrow();
  });

  it('switches from the empty-state action to explore mode', () => {
    const { component, listeners } = makeComponent();
    callback(listeners, component.refs.emptyExploreBtn, 'click')();
    expect(component.setMode).toHaveBeenCalledWith('explore');
  });

  it('returns from journey detail to its stop list, otherwise hides detail', () => {
    const { component, listeners, journey } = makeComponent();
    const back = callback(listeners, component.refs.detailBack, 'click');
    component._detailFromJourney = true;
    component._journeyListJourney = journey;

    back();
    expect(component.showJourneyStops).toHaveBeenCalledWith(journey);
    expect(component.mapPanel.resetMarkerOpacity).toHaveBeenCalled();
    expect(component.hideDetail).not.toHaveBeenCalled();

    component._detailFromJourney = false;
    back();
    expect(component.hideDetail).toHaveBeenCalled();

    component.hideDetail.mockClear();
    component._detailFromJourney = true;
    component.mapPanel = null;
    expect(() => back()).not.toThrow();
  });

  it('closes visible detail with Escape and ignores other states', () => {
    const { component, listeners } = makeComponent();
    const keydown = callback(listeners, component.refs.main, 'keydown');
    const hidden = eventFor(component.refs.main, { key: 'Escape' });
    keydown(hidden);
    expect(hidden.preventDefault).not.toHaveBeenCalled();

    component.refs.detail.classList.remove('hidden');
    const enter = eventFor(component.refs.main, { key: 'Enter' });
    keydown(enter);
    expect(component.hideDetail).not.toHaveBeenCalled();

    const escape = eventFor(component.refs.main, { key: 'Escape' });
    keydown(escape);
    expect(escape.preventDefault).toHaveBeenCalled();
    expect(component.hideDetail).toHaveBeenCalled();
  });

  it('records pointer-down and closes detail only for a background click without a drag', () => {
    const { component, listeners } = makeComponent();
    const down = callback(listeners, component.refs.mapContainer, 'mousedown');
    const click = callback(listeners, component.refs.mapContainer, 'click');

    click(eventFor(component.refs.mapContainer, { clientX: 1, clientY: 1 }));
    expect(component.hideDetail).not.toHaveBeenCalled();

    component.refs.detail.classList.remove('hidden');
    click(eventFor(nestedTarget('map-marker').child, { clientX: 1, clientY: 1 }));
    expect(component.hideDetail).not.toHaveBeenCalled();

    down(eventFor(component.refs.mapContainer, { clientX: 10, clientY: 20 }));
    expect(component._pointerDown).toEqual({ x: 10, y: 20 });
    click(eventFor(component.refs.mapContainer, { clientX: 20, clientY: 30 }));
    expect(component.hideDetail).not.toHaveBeenCalled();

    click(eventFor(component.refs.mapContainer, { clientX: 12, clientY: 22 }));
    expect(component.hideDetail).toHaveBeenCalled();

    component.hideDetail.mockClear();
    component.refs.detail.classList.remove('hidden');
    component._pointerDown = null;
    click(eventFor(component.refs.mapContainer, { clientX: 99, clientY: 99 }));
    expect(component.hideDetail).toHaveBeenCalled();
  });

  it('opens co-located detail rows and ignores missing entries', () => {
    const { component, listeners, location } = makeComponent();
    const click = callback(listeners, component.refs.detailContent, 'click');
    component.refs.detail._colocatedLocations = [location];
    const { parent, child } = nestedTarget('map-detail-colocated-item', { 'data-index': '0' });
    click(eventFor(child));
    expect(component.mapPanel.openLocation).toHaveBeenCalledWith(location);

    parent.setAttribute('data-index', '5');
    click(eventFor(child));
    expect(component.mapPanel.openLocation).toHaveBeenCalledTimes(1);

    component.mapPanel = null;
    parent.setAttribute('data-index', '0');
    expect(() => click(eventFor(child))).not.toThrow();
  });

  it('broadcasts Bible navigation from a detail verse', () => {
    const { component, listeners } = makeComponent();
    const click = callback(listeners, component.refs.detailContent, 'click');
    const { parent, child } = nestedTarget('verse');
    parent.setAttribute('data-sectionid', 'JN3');
    parent.setAttribute('data-fragmentid', 'JN3_16');

    click(eventFor(child));

    expect(component.trigger).toHaveBeenCalledWith('globalmessage', expect.objectContaining({
      type: 'globalmessage',
      target: component,
      data: {
        messagetype: 'nav',
        type: 'bible',
        locationInfo: { sectionid: 'JN3', fragmentid: 'JN3_16' }
      }
    }));
  });

  it('opens journey stop rows and ignores absent stops or journey context', () => {
    const { component, listeners, journey } = makeComponent();
    const click = callback(listeners, component.refs.detailContent, 'click');
    const { parent, child } = nestedTarget('map-journey-stop-row', { 'data-stop-index': '0' });

    click(eventFor(child));
    expect(component.mapPanel.openStop).not.toHaveBeenCalled();
    component._journeyListJourney = journey;
    click(eventFor(child));
    expect(component.mapPanel.openStop).toHaveBeenCalledWith(journey.stops[0]);

    parent.setAttribute('data-stop-index', '9');
    click(eventFor(child));
    expect(component.mapPanel.openStop).toHaveBeenCalledTimes(1);

    component.mapPanel = null;
    parent.setAttribute('data-stop-index', '0');
    expect(() => click(eventFor(child))).not.toThrow();
  });

  it('handles reference, more-results, location, and empty suggestion clicks', () => {
    const { component, listeners, location } = makeComponent();
    const click = callback(listeners, component.refs.searchSuggestions, 'click');
    component.state.referenceSuggestion = { sectionid: 'JN3', count: 1 };
    click(eventFor(nestedTarget('map-suggestion-reference').child));
    expect(component.mapPanel.filterBySection).toHaveBeenCalledWith('JN3');

    component.refs.mapSearchInput.value = 'Jerusalem';
    component.state.currentSuggestions = [{ location, altName: null }];
    click(eventFor(nestedTarget('map-suggestion-more').child));
    expect(component.state.currentSuggestions).toHaveLength(1);

    const item = nestedTarget('map-suggestion-item', { 'data-index': '0' });
    click(eventFor(item.child));
    expect(component.mapPanel.openLocation).toHaveBeenCalledWith(location);
    expect(component.refs.mapSearchInput.value).toBe('Jerusalem');
    expect(component.state.currentSuggestions).toEqual([]);

    item.parent.setAttribute('data-index', '9');
    click(eventFor(item.child));
    click(eventFor(document.createElement('span')));
    expect(component.mapPanel.openLocation).toHaveBeenCalledTimes(1);

    component.state.currentSuggestions = [{ location, altName: null }];
    item.parent.setAttribute('data-index', '0');
    component.mapPanel = null;
    expect(() => click(eventFor(item.child))).not.toThrow();
  });

  it('keeps input focus on suggestion mousedown and selects hovered items', () => {
    const { component, listeners, location } = makeComponent();
    const down = callback(listeners, component.refs.searchSuggestions, 'mousedown');
    const enter = callback(listeners, component.refs.searchSuggestions, 'mouseenter');
    const downEvent = eventFor(component.refs.searchSuggestions);
    down(downEvent);
    expect(downEvent.preventDefault).toHaveBeenCalled();

    component.state.currentSuggestions = [{ location, altName: null }];
    component.refs.searchSuggestions.innerHTML = '<div class="map-suggestion-item" data-index="0"></div>';
    enter(eventFor(document.createElement('span')));
    expect(component.state.selectedSuggestionIndex).toBe(-1);

    enter(eventFor(component.refs.searchSuggestions.firstElementChild));
    expect(component.state.selectedSuggestionIndex).toBe(0);
  });

  it('opens a linked location using verse-specific data before the global list', () => {
    const { component, listeners, location } = makeComponent();
    const workspace = document.querySelector('.windows-main');
    const click = callback(listeners, workspace, 'click');
    const verse = makeElement('div', 'verse');
    verse.setAttribute('data-id', 'JN3_16');
    const span = makeElement('span', 'linked-location');
    span.setAttribute('data-location-name', 'Jerusalem');
    verse.appendChild(span);
    workspace.appendChild(verse);

    click(eventFor(span));
    expect(component.mapPanel.openLocation).toHaveBeenCalledWith(location);

    component.mapPanel.openLocation.mockClear();
    click(eventFor(document.createElement('span')));
    expect(component.mapPanel.openLocation).not.toHaveBeenCalled();
    component.mapPanel.locationData = null;
    click(eventFor(span));
    expect(component.mapPanel.openLocation).not.toHaveBeenCalled();
  });

  it('falls back to text and the global location list for linked places', () => {
    const { component, listeners, location } = makeComponent();
    const workspace = document.querySelector('.windows-main');
    const click = callback(listeners, workspace, 'click');
    const span = makeElement('span', 'linked-location');
    span.textContent = 'Jerusalem';
    workspace.appendChild(span);

    click(eventFor(span));
    expect(component.mapPanel.openLocation).toHaveBeenCalledWith(location);

    component.mapPanel.openLocation.mockClear();
    span.textContent = 'Nowhere';
    click(eventFor(span));
    expect(component.mapPanel.openLocation).not.toHaveBeenCalled();
  });
});

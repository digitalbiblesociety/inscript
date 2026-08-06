import { describe, expect, it, vi } from 'vitest';
import { handleClusterClick, wireDetailPanel } from '@windows/MapWindow/PanelEvents.js';
import { SVG_HEIGHT, SVG_WIDTH } from '@windows/MapWindow/constants.js';

function makePanel({ offsetWidth = 800 } = {}) {
  const detailPanel = document.createElement('details');
  const container = document.createElement('div');
  const markersOverlay = document.createElement('div');
  const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const listeners = [];
  container.getBoundingClientRect = vi.fn(() => ({
    width: 800,
    height: 600,
    left: 0,
    top: 0,
    right: 800,
    bottom: 600
  }));
  Object.defineProperty(container, 'offsetWidth', { value: offsetWidth, configurable: true });

  const panel = {
    detailPanel,
    container,
    refs: { mapContainer: container },
    markersOverlay,
    svgElement,
    state: { currentCenter: {} },
    viewBox: { x: 0, y: 0, width: SVG_WIDTH, height: SVG_HEIGHT },
    _openLocation: vi.fn(),
    _onVerseClick: vi.fn(),
    updateMarkerScales: vi.fn(),
    triggerSettingsChange: vi.fn(),
    addListener: vi.fn((target, type, callback) => {
      listeners.push({ target, type, callback });
    })
  };
  wireDetailPanel(panel);
  return { panel, listeners };
}

function callback(listeners, target, type) {
  return listeners.find(listener => listener.target === target && listener.type === type).callback;
}

function eventFor(target, extra = {}) {
  return {
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...extra
  };
}

function clusterData(members) {
  return { members };
}

function member(x, y, locationData) {
  return { _svgX: x, _svgY: y, locationData };
}

describe('MapPanel event wiring', () => {
  it('wires detail and container mouse and keyboard handlers', () => {
    const { panel, listeners } = makePanel();

    expect(panel.addListener).toHaveBeenCalledTimes(4);
    expect(listeners.map(({ target, type }) => [target, type])).toEqual([
      [panel.detailPanel, 'click'],
      [panel.detailPanel, 'toggle'],
      [panel.container, 'click'],
      [panel.container, 'keydown']
    ]);
  });

  it('opens a selected co-located place from the detail panel', () => {
    const { panel, listeners } = makePanel();
    const click = callback(listeners, panel.detailPanel, 'click');
    const location = { name: 'Antioch' };
    panel.detailPanel._colocatedLocations = [location];
    const row = document.createElement('button');
    row.className = 'map-detail-colocated-item';
    row.setAttribute('data-index', '0');
    const child = document.createElement('span');
    row.appendChild(child);

    click(eventFor(child));
    expect(panel._openLocation).toHaveBeenCalledWith(location);

    row.setAttribute('data-index', '99');
    click(eventFor(child));
    expect(panel._openLocation).toHaveBeenCalledTimes(1);
    expect(panel._onVerseClick).not.toHaveBeenCalled();
  });

  it('routes verse links and ignores unrelated detail clicks', () => {
    const { panel, listeners } = makePanel();
    const click = callback(listeners, panel.detailPanel, 'click');
    const verse = document.createElement('a');
    verse.className = 'verse';
    verse.setAttribute('data-sectionid', 'JN3');
    verse.setAttribute('data-fragmentid', 'JN3_16');

    click(eventFor(document.createElement('span')));
    expect(panel._onVerseClick).not.toHaveBeenCalled();

    click(eventFor(verse));
    expect(panel._onVerseClick).toHaveBeenCalledWith('JN3', 'JN3_16');

    panel._onVerseClick = null;
    expect(() => click(eventFor(verse))).not.toThrow();
  });

  it('restores faded marker opacity only when details close', () => {
    const { panel, listeners } = makePanel();
    const toggle = callback(listeners, panel.detailPanel, 'toggle');
    const marker = document.createElement('div');
    marker.className = 'map-marker faded';
    panel.markersOverlay.appendChild(marker);

    toggle({ newState: 'open' });
    expect(marker.classList).toContain('faded');

    toggle({ newState: 'closed' });
    expect(marker.classList).not.toContain('faded');

    panel.markersOverlay = null;
    expect(() => toggle({ newState: 'closed' })).not.toThrow();
  });

  it('activates a rendered cluster by click', () => {
    const { panel, listeners } = makePanel();
    const click = callback(listeners, panel.container, 'click');
    const cluster = document.createElement('button');
    cluster.className = 'map-cluster';
    const location = { name: 'Jerusalem', coordinates: [35.23, 31.78] };
    cluster._clusterData = clusterData([
      member(100, 100, location),
      member(100.1, 100.1, location)
    ]);
    const child = document.createElement('span');
    cluster.appendChild(child);
    const event = eventFor(child);

    click(event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(panel._openLocation).toHaveBeenCalledWith(location);
  });

  it('ignores container clicks outside a populated cluster', () => {
    const { panel, listeners } = makePanel();
    const click = callback(listeners, panel.container, 'click');
    const plain = eventFor(document.createElement('div'));
    click(plain);

    const emptyCluster = document.createElement('div');
    emptyCluster.className = 'map-cluster';
    click(eventFor(emptyCluster));

    expect(plain.stopPropagation).not.toHaveBeenCalled();
    expect(panel._openLocation).not.toHaveBeenCalled();
  });

  it.each(['Enter', ' '])('activates a populated cluster with the %j key', (key) => {
    const { panel, listeners } = makePanel();
    const keydown = callback(listeners, panel.container, 'keydown');
    const cluster = document.createElement('button');
    cluster.className = 'map-cluster';
    const location = { name: 'Jerusalem', coordinates: [35.23, 31.78] };
    cluster._clusterData = clusterData([
      member(10, 10, location),
      member(10.1, 10.1, location)
    ]);
    const event = eventFor(cluster, { key });

    keydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(panel._openLocation).toHaveBeenCalledWith(location);
  });

  it('ignores unsupported keys, non-clusters, and clusters without data', () => {
    const { panel, listeners } = makePanel();
    const keydown = callback(listeners, panel.container, 'keydown');
    const cluster = document.createElement('div');
    cluster.className = 'map-cluster';
    const unsupported = eventFor(cluster, { key: 'Escape' });
    const noData = eventFor(cluster, { key: 'Enter' });
    const noClosest = eventFor({}, { key: 'Enter' });

    keydown(unsupported);
    keydown(noData);
    keydown(noClosest);

    expect(unsupported.preventDefault).not.toHaveBeenCalled();
    expect(noData.preventDefault).not.toHaveBeenCalled();
    expect(noClosest.preventDefault).not.toHaveBeenCalled();
  });
});

describe('handleClusterClick', () => {
  it('ignores a cluster whose members have no location data', () => {
    const { panel } = makePanel();

    handleClusterClick(panel, clusterData([member(1, 1, null)]));

    expect(panel._openLocation).not.toHaveBeenCalled();
    expect(panel.updateMarkerScales).not.toHaveBeenCalled();
  });

  it('opens the first location when all members are co-located', () => {
    const { panel } = makePanel();
    const first = { name: 'Antioch', coordinates: [35, 33] };
    const second = { name: 'Antioch label', coordinates: [35, 33] };

    handleClusterClick(panel, clusterData([
      member(undefined, undefined, first),
      member(0.2, 0.2, second)
    ]));

    expect(panel._openLocation).toHaveBeenCalledWith(first);
    expect(panel.updateMarkerScales).not.toHaveBeenCalled();
  });

  it('centers on separated locations without over-zooming when they already split', () => {
    const { panel } = makePanel();
    const places = [
      { name: 'West', coordinates: [11, 27] },
      { name: 'East', coordinates: [49, 43] }
    ];

    handleClusterClick(panel, clusterData([
      member(0, 0, places[0]),
      member(1000, 500, places[1])
    ]));

    expect(panel.updateMarkerScales).toHaveBeenCalledOnce();
    expect(panel.triggerSettingsChange).not.toHaveBeenCalled();
    expect(panel.svgElement.getAttribute('viewBox')).toBeTruthy();
    expect(panel.state.currentCenter).toEqual(expect.objectContaining({
      lat: expect.any(Number),
      lon: expect.any(Number)
    }));
  });

  it('zooms farther when centered members would remain clustered', () => {
    const { panel } = makePanel({ offsetWidth: 0 });
    const places = [
      { name: 'West', coordinates: [11, 27] },
      { name: 'East', coordinates: [49, 43] }
    ];

    handleClusterClick(panel, clusterData([
      member(100, 100, places[0]),
      member(101, 100, places[1])
    ]));

    expect(panel.updateMarkerScales).toHaveBeenCalledTimes(2);
    expect(panel.triggerSettingsChange).toHaveBeenCalledOnce();
    expect(panel.viewBox.width).toBeLessThan(SVG_WIDTH);
    expect(panel.viewBox.x).toBeGreaterThanOrEqual(0);
    expect(panel.viewBox.y).toBeGreaterThanOrEqual(0);
    expect(panel.viewBox.x + panel.viewBox.width).toBeLessThanOrEqual(SVG_WIDTH);
    expect(panel.viewBox.y + panel.viewBox.height).toBeLessThanOrEqual(SVG_HEIGHT);
  });

  it('uses the minimum cluster-breaking width for a very narrow container', () => {
    const { panel } = makePanel({ offsetWidth: 1 });
    const places = [
      { name: 'West', coordinates: [11, 27] },
      { name: 'East', coordinates: [49, 43] }
    ];

    handleClusterClick(panel, clusterData([
      member(100, 100, places[0]),
      member(101, 100, places[1])
    ]));

    expect(panel.viewBox.width).toBe(30);
    expect(panel.triggerSettingsChange).toHaveBeenCalledOnce();
  });
});

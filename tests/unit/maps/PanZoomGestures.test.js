import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPanZoom } from '@windows/MapWindow/PanZoomGestures.js';
import { SVG_HEIGHT, SVG_WIDTH } from '@windows/MapWindow/constants.js';

const rect = {
  width: 800,
  height: 600,
  left: 10,
  top: 20,
  right: 810,
  bottom: 620
};

function makeComponent() {
  const mapContainer = document.createElement('div');
  mapContainer.getBoundingClientRect = vi.fn(() => ({ ...rect }));
  const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const listeners = [];
  const component = {
    refs: { mapContainer },
    state: { isPanning: false },
    viewBox: { x: 300, y: 150, width: 400, height: 300 },
    panStart: { x: 0, y: 0 },
    svgElement,
    updateMarkerScales: vi.fn(),
    triggerSettingsChange: vi.fn(),
    panMarkersBy: vi.fn(),
    resetView: vi.fn(),
    addListener: vi.fn((target, type, callback, options) => {
      listeners.push({ target, type, callback, options });
    })
  };
  setupPanZoom(component);
  return { component, listeners };
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

function interactiveTarget(className) {
  const wrapper = document.createElement('div');
  wrapper.className = className.replace(/^\./, '');
  const child = document.createElement('span');
  wrapper.appendChild(child);
  return child;
}

describe('MapWindow pan and zoom gestures', () => {
  let rafCallbacks;

  beforeEach(() => {
    vi.useFakeTimers();
    rafCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn(callback => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('wires every gesture with the intended passive option', () => {
    const { component, listeners } = makeComponent();

    expect(component.addListener).toHaveBeenCalledTimes(9);
    expect(listeners.map(({ type }) => type)).toEqual([
      'wheel', 'dblclick', 'mousedown', 'mousemove', 'mouseup',
      'touchstart', 'touchmove', 'touchend', 'keydown'
    ]);
    expect(listeners.find(({ type }) => type === 'wheel').options).toEqual({ passive: false });
    expect(listeners.find(({ type }) => type === 'touchstart').options).toEqual({ passive: true });
    expect(listeners.find(({ type }) => type === 'touchmove').options).toEqual({ passive: false });
    expect(listeners.find(({ type }) => type === 'touchend').options).toEqual({ passive: true });
  });

  it('batches wheel input into one animation frame and settles once', () => {
    const { component, listeners } = makeComponent();
    const wheel = callback(listeners, component.refs.mapContainer, 'wheel');
    const first = eventFor(component.refs.mapContainer, { deltaY: 1, clientX: 100, clientY: 120 });
    const second = eventFor(component.refs.mapContainer, { deltaY: -1, clientX: 160, clientY: 180 });
    const originalWidth = component.viewBox.width;

    wheel(first);
    wheel(second);

    expect(first.preventDefault).toHaveBeenCalled();
    expect(second.preventDefault).toHaveBeenCalled();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(component.refs.mapContainer.getBoundingClientRect).not.toHaveBeenCalled();

    rafCallbacks[0]();
    expect(component.refs.mapContainer.getBoundingClientRect).toHaveBeenCalledTimes(2);
    expect(component.viewBox.width).toBeCloseTo(originalWidth);
    expect(component.updateMarkerScales).toHaveBeenCalledWith({ defer: true });
    expect(component.triggerSettingsChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(component.triggerSettingsChange).toHaveBeenCalledOnce();
  });

  it('uses the latest wheel coordinates and zooms out for positive delta', () => {
    const { component, listeners } = makeComponent();
    const wheel = callback(listeners, component.refs.mapContainer, 'wheel');
    const originalWidth = component.viewBox.width;

    wheel(eventFor(component.refs.mapContainer, { deltaY: 10, clientX: 200, clientY: 210 }));
    rafCallbacks[0]();

    expect(component.viewBox.width).toBeGreaterThan(originalWidth);
  });

  it.each([
    '.map-marker',
    '.map-cluster',
    '.map-zoom-controls',
    '.journey-stop',
    '.map-empty-state'
  ])('ignores double-clicks on interactive target %s', (className) => {
    const { component, listeners } = makeComponent();
    const dblclick = callback(listeners, component.refs.mapContainer, 'dblclick');
    const event = eventFor(interactiveTarget(className), { clientX: 200, clientY: 210 });

    dblclick(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(component.updateMarkerScales).not.toHaveBeenCalled();
  });

  it('zooms on a map-background double-click and persists after settling', () => {
    const { component, listeners } = makeComponent();
    const dblclick = callback(listeners, component.refs.mapContainer, 'dblclick');
    const event = eventFor(component.refs.mapContainer, { clientX: 210, clientY: 220 });
    const originalWidth = component.viewBox.width;

    dblclick(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.viewBox.width).toBeLessThan(originalWidth);
    vi.advanceTimersByTime(400);
    expect(component.triggerSettingsChange).toHaveBeenCalledOnce();
  });

  it('starts, advances, and ends a left-button mouse pan', () => {
    const { component, listeners } = makeComponent();
    const down = callback(listeners, component.refs.mapContainer, 'mousedown');
    const move = callback(listeners, document, 'mousemove');
    const up = callback(listeners, document, 'mouseup');
    const original = { x: component.viewBox.x, y: component.viewBox.y };

    move(eventFor(component.refs.mapContainer, { clientX: 1, clientY: 1 }));
    expect(component.panMarkersBy).not.toHaveBeenCalled();

    down(eventFor(component.refs.mapContainer, { button: 2, clientX: 100, clientY: 100 }));
    down(eventFor(interactiveTarget('.map-marker'), { button: 0, clientX: 100, clientY: 100 }));
    expect(component.state.isPanning).toBe(false);

    down(eventFor(component.refs.mapContainer, { button: 0, clientX: 100, clientY: 120 }));
    expect(component.state.isPanning).toBe(true);
    expect(component.panStart).toEqual({ x: 100, y: 120 });
    expect(component.refs.mapContainer.classList).toContain('panning');

    move(eventFor(component.refs.mapContainer, { clientX: 140, clientY: 150 }));
    expect(component.viewBox.x).toBeLessThan(original.x);
    expect(component.viewBox.y).toBeLessThan(original.y);
    expect(component.panStart).toEqual({ x: 140, y: 150 });
    expect(component.panMarkersBy).toHaveBeenCalled();
    expect(component.svgElement.getAttribute('viewBox')).toBeTruthy();

    up();
    expect(component.state.isPanning).toBe(false);
    expect(component.refs.mapContainer.classList).not.toContain('panning');
    expect(component.updateMarkerScales).toHaveBeenCalled();
    expect(component.triggerSettingsChange).toHaveBeenCalled();

    component.updateMarkerScales.mockClear();
    up();
    expect(component.updateMarkerScales).not.toHaveBeenCalled();
  });

  it('falls back to a fresh rect when a mouse pan lacks cached geometry', () => {
    const { component, listeners } = makeComponent();
    const move = callback(listeners, document, 'mousemove');
    component.state.isPanning = true;
    component.panStart = { x: 100, y: 100 };
    component._gestureRect = null;

    move(eventFor(component.refs.mapContainer, { clientX: 110, clientY: 110 }));

    expect(component.refs.mapContainer.getBoundingClientRect).toHaveBeenCalled();
    expect(component.panMarkersBy).toHaveBeenCalled();
  });

  it('handles one-finger panning and two-finger pinch zoom', () => {
    const { component, listeners } = makeComponent();
    const start = callback(listeners, component.refs.mapContainer, 'touchstart');
    const move = callback(listeners, component.refs.mapContainer, 'touchmove');
    const end = callback(listeners, component.refs.mapContainer, 'touchend');

    start(eventFor(interactiveTarget('.map-empty-state'), {
      touches: [{ clientX: 10, clientY: 10 }]
    }));
    expect(component.state.isPanning).toBe(false);

    start(eventFor(component.refs.mapContainer, {
      touches: [{ clientX: 100, clientY: 120 }]
    }));
    expect(component.state.isPanning).toBe(true);
    expect(component.panStart).toEqual({ x: 100, y: 120 });

    const oneFingerMove = eventFor(component.refs.mapContainer, {
      touches: [{ clientX: 120, clientY: 150 }]
    });
    move(oneFingerMove);
    expect(oneFingerMove.preventDefault).toHaveBeenCalled();
    expect(component.panMarkersBy).toHaveBeenCalled();

    start(eventFor(component.refs.mapContainer, {
      touches: [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 100 }
      ]
    }));
    expect(component.state.isPanning).toBe(false);
    const beforePinch = component.viewBox.width;

    const pinchMove = eventFor(component.refs.mapContainer, {
      touches: [
        { clientX: 90, clientY: 100 },
        { clientX: 210, clientY: 100 }
      ]
    });
    move(pinchMove);
    expect(component.viewBox.width).toBeLessThan(beforePinch);
    expect(component.updateMarkerScales).toHaveBeenCalledWith({ defer: true });

    end();
    expect(component.state.isPanning).toBe(false);
    expect(component.updateMarkerScales).toHaveBeenCalled();
    expect(component.triggerSettingsChange).toHaveBeenCalled();
  });

  it('prevents an unsupported touch shape without changing the view', () => {
    const { component, listeners } = makeComponent();
    const move = callback(listeners, component.refs.mapContainer, 'touchmove');
    const original = { ...component.viewBox };
    const event = eventFor(component.refs.mapContainer, { touches: [] });

    move(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.viewBox).toEqual(original);
  });

  it.each([
    ['ArrowLeft', -1, 0],
    ['ArrowRight', 1, 0],
    ['ArrowUp', 0, -1],
    ['ArrowDown', 0, 1]
  ])('pans with %s and refreshes markers after settling', (key, xDirection, yDirection) => {
    const { component, listeners } = makeComponent();
    const keydown = callback(listeners, component.refs.mapContainer, 'keydown');
    const original = { x: component.viewBox.x, y: component.viewBox.y };
    const event = eventFor(component.refs.mapContainer, { key });

    keydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    if (xDirection) expect(Math.sign(component.viewBox.x - original.x)).toBe(xDirection);
    if (yDirection) expect(Math.sign(component.viewBox.y - original.y)).toBe(yDirection);
    expect(component.panMarkersBy).toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(component.updateMarkerScales).toHaveBeenCalled();
    expect(component.triggerSettingsChange).toHaveBeenCalled();
  });

  it.each([
    ['+', true],
    ['=', true],
    ['-', false],
    ['_', false]
  ])('zooms with the %s key and settles', (key, zoomsIn) => {
    const { component, listeners } = makeComponent();
    const keydown = callback(listeners, component.refs.mapContainer, 'keydown');
    const originalWidth = component.viewBox.width;

    keydown(eventFor(component.refs.mapContainer, { key }));

    expect(zoomsIn
      ? component.viewBox.width < originalWidth
      : component.viewBox.width > originalWidth).toBe(true);
    vi.advanceTimersByTime(400);
    expect(component.triggerSettingsChange).toHaveBeenCalled();
  });

  it.each(['Home', '0'])('resets the view with %s', (key) => {
    const { component, listeners } = makeComponent();
    const keydown = callback(listeners, component.refs.mapContainer, 'keydown');
    const event = eventFor(component.refs.mapContainer, { key });

    keydown(event);

    expect(component.resetView).toHaveBeenCalled();
    expect(component.triggerSettingsChange).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('handles reset keys when resetView is unavailable', () => {
    const { component, listeners } = makeComponent();
    const keydown = callback(listeners, component.refs.mapContainer, 'keydown');
    component.resetView = null;
    const event = eventFor(component.refs.mapContainer, { key: 'Home' });

    keydown(event);

    expect(component.triggerSettingsChange).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('ignores keys from descendants and unsupported map-container keys', () => {
    const { component, listeners } = makeComponent();
    const keydown = callback(listeners, component.refs.mapContainer, 'keydown');
    const child = document.createElement('button');
    component.refs.mapContainer.appendChild(child);
    const childEvent = eventFor(child, { key: 'ArrowLeft' });
    const unsupported = eventFor(component.refs.mapContainer, { key: 'PageDown' });

    keydown(childEvent);
    keydown(unsupported);

    expect(childEvent.preventDefault).not.toHaveBeenCalled();
    expect(unsupported.preventDefault).not.toHaveBeenCalled();
    expect(component.panMarkersBy).not.toHaveBeenCalled();
  });

  it('constrains pans at the full map edge', () => {
    const { component, listeners } = makeComponent();
    const keydown = callback(listeners, component.refs.mapContainer, 'keydown');
    component.viewBox = { x: 0, y: 0, width: SVG_WIDTH, height: SVG_HEIGHT };

    keydown(eventFor(component.refs.mapContainer, { key: 'ArrowLeft' }));
    keydown(eventFor(component.refs.mapContainer, { key: 'ArrowUp' }));

    expect(component.viewBox.x).toBe(0);
    expect(component.viewBox.y).toBe(0);
    expect(component.panMarkersBy).toHaveBeenCalledWith(0, 0);
  });
});

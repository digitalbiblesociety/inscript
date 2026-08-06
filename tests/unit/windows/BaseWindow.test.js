import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({ config: { marker: 'config' } }));
vi.mock('@core/config.js', () => ({ getConfig: () => fixtures.config }));

import { AsyncHelpers, BaseWindow, registerWindowComponent } from '@windows/BaseWindow.js';

class TestBaseWindow extends BaseWindow {}
if (!customElements.get('test-base-window')) customElements.define('test-base-window', TestBaseWindow);

function makeWindow() {
  return document.createElement('test-base-window');
}

describe('BaseWindow and AsyncHelpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('promisifies callback APIs and converts synchronous exceptions to rejections', async () => {
    expect(await AsyncHelpers.promisify((value, callback) => callback(value * 2), 3)).toBe(6);
    await expect(AsyncHelpers.promisify(() => { throw new Error('sync'); })).rejects.toThrow('sync');
    expect(await AsyncHelpers.promisifyWithError((value, success) => success(value + 1), 2)).toBe(3);
    await expect(AsyncHelpers.promisifyWithError((_success, error) => error(new Error('failed'))))
      .rejects.toThrow('failed');
  });

  it('sleeps for the requested timer duration', async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    AsyncHelpers.sleep(25).then(done);
    vi.advanceTimersByTime(24);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
  });

  it('initializes constructor state and configuration', () => {
    const win = makeWindow();
    expect(win.config).toBe(fixtures.config);
    expect(win.state).toEqual({ isInitialized: false, isLoading: false });
    expect(win.refs).toEqual({});
    expect(win.windowId).toBeNull();
    expect(win.parentInfo).toBeNull();
    expect(win.initData).toBeNull();
    expect(win._boundHandlers).toBeInstanceOf(Map);
    expect(win._abortController).toBeNull();
  });

  it('runs the complete connected lifecycle once and emits initialized', async () => {
    const win = makeWindow();
    win.setAttribute('window-id', 'w1');
    win.setAttribute('init-data', '{"value":7}');
    win.render = vi.fn().mockResolvedValue();
    win.cacheRefs = vi.fn();
    win.attachEventListeners = vi.fn();
    win.init = vi.fn().mockResolvedValue();
    win.trigger = vi.fn();
    await win.connectedCallback();
    expect(win.windowId).toBe('w1');
    expect(win.initData).toEqual({ value: 7 });
    expect(win.render).toHaveBeenCalled();
    expect(win.cacheRefs).toHaveBeenCalled();
    expect(win.attachEventListeners).toHaveBeenCalled();
    expect(win.init).toHaveBeenCalled();
    expect(win.state.isInitialized).toBe(true);
    expect(win.trigger).toHaveBeenCalledWith('initialized', { type: 'initialized', target: win });
    await win.connectedCallback();
    expect(win.render).toHaveBeenCalledOnce();
  });

  it('preserves preassigned window and init data', async () => {
    const win = makeWindow();
    win.windowId = 'existing';
    win.initData = { existing: true };
    win.render = vi.fn();
    win.cacheRefs = vi.fn();
    win.attachEventListeners = vi.fn();
    win.init = vi.fn();
    await win.connectedCallback();
    expect(win.windowId).toBe('existing');
    expect(win.initData).toEqual({ existing: true });
  });

  it('reports lifecycle failures through the window error surface', async () => {
    const win = makeWindow();
    win.render = vi.fn().mockRejectedValue(new Error('render failed'));
    win.showError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await win.connectedCallback();
    expect(consoleError).toHaveBeenCalledWith('TestBaseWindow initialization error:', expect.any(Error));
    expect(win.showError).toHaveBeenCalledWith('Failed to initialize window');
    expect(win.state.isInitialized).toBe(false);
  });

  it('disconnects through cleanup and parses valid, absent, and invalid init data', () => {
    const win = makeWindow();
    win.cleanup = vi.fn();
    win.disconnectedCallback();
    expect(win.cleanup).toHaveBeenCalled();
    expect(win._parseInitData()).toEqual({});
    win.setAttribute('init-data', '{"a":1}');
    expect(win._parseInitData()).toEqual({ a: 1 });
    win.setAttribute('init-data', '{bad');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(win._parseInitData()).toEqual({});
    expect(consoleWarn).toHaveBeenCalledWith('Failed to parse init-data:', expect.any(Error));
  });

  it('renders the base structure, caches refs, and has safe empty hooks', async () => {
    const win = makeWindow();
    await win.render();
    win.cacheRefs();
    expect(win.refs.content).toBe(win.querySelector('.window-content'));
    expect(win.refs.header).toBe(win.querySelector('.window-header'));
    expect(win.refs.main).toBe(win.querySelector('.window-main'));
    expect(win.refs.footer).toBe(win.querySelector('.window-footer'));
    expect(win.attachEventListeners()).toBeUndefined();
    expect(await win.init()).toBeUndefined();
  });

  it('adds abortable listeners with object or boolean options and ignores unavailable targets', () => {
    const win = makeWindow();
    const target = document.createElement('button');
    const add = vi.spyOn(target, 'addEventListener');
    const handler = vi.fn();
    win.addListener(target, 'click', handler);
    expect(add).not.toHaveBeenCalled();
    win._abortController = new AbortController();
    win.addListener(target, 'click', handler, true);
    expect(add).toHaveBeenLastCalledWith('click', handler, {
      capture: true, signal: win._abortController.signal
    });
    win.addListener(target, 'focus', handler, { once: true });
    expect(add).toHaveBeenLastCalledWith('focus', handler, {
      once: true, signal: win._abortController.signal
    });
    expect(() => win.addListener(null, 'click', handler)).not.toThrow();
  });

  it('binds and caches handlers by name', () => {
    const win = makeWindow();
    win.value = 4;
    function handler(add) { return this.value + add; }
    const first = win.bindHandler('sum', handler);
    const second = win.bindHandler('sum', vi.fn());
    expect(first).toBe(second);
    expect(first(3)).toBe(7);
  });

  it('sets state, emits old/new snapshots, and optionally rerenders', () => {
    const win = makeWindow();
    win.trigger = vi.fn();
    win.rerender = vi.fn();
    win.setState({ value: 1 });
    expect(win.trigger).toHaveBeenCalledWith('statechange', {
      type: 'statechange', target: win,
      data: {
        oldState: { isInitialized: false, isLoading: false },
        newState: { isInitialized: false, isLoading: false, value: 1 },
        updates: { value: 1 }
      }
    });
    expect(win.rerender).not.toHaveBeenCalled();
    win.setState({ value: 2 }, true);
    expect(win.rerender).toHaveBeenCalled();
  });

  it('rerenders with a fresh abort controller and rewires the view', async () => {
    const win = makeWindow();
    const previous = new AbortController();
    const abort = vi.spyOn(previous, 'abort');
    win._abortController = previous;
    win.render = vi.fn().mockResolvedValue();
    win.cacheRefs = vi.fn();
    win.attachEventListeners = vi.fn();
    await win.rerender();
    expect(abort).toHaveBeenCalled();
    expect(win._abortController).not.toBe(previous);
    expect(win.render).toHaveBeenCalled();
    expect(win.cacheRefs).toHaveBeenCalled();
    expect(win.attachEventListeners).toHaveBeenCalled();

    win._abortController = null;
    await win.rerender();
    expect(win._abortController).toBeInstanceOf(AbortController);
  });

  it('shows, updates, and hides loading messages', async () => {
    const win = makeWindow();
    await win.render();
    win.cacheRefs();
    win.showLoading();
    expect(win.state.isLoading).toBe(true);
    expect(win.refs.main.classList).toContain('loading-indicator');
    expect(win.refs.main.querySelector('.loading-message')).toBeNull();
    win.showLoading('Loading one');
    expect(win.refs.main.querySelector('.loading-message').textContent).toBe('Loading one');
    win.showLoading('Loading two');
    expect(win.refs.main.querySelectorAll('.loading-message')).toHaveLength(1);
    expect(win.refs.main.querySelector('.loading-message').textContent).toBe('Loading two');
    win.hideLoading();
    expect(win.state.isLoading).toBe(false);
    expect(win.refs.main.classList).not.toContain('loading-indicator');
    expect(win.refs.main.querySelector('.loading-message')).toBeNull();
    win.hideLoading();
  });

  it('tolerates loading without a main ref', () => {
    const win = makeWindow();
    win.showLoading('Loading');
    win.hideLoading();
    expect(win.state.isLoading).toBe(false);
  });

  it('renders escaped errors and optionally logs an underlying error', async () => {
    const win = makeWindow();
    await win.render();
    win.cacheRefs();
    win.refs.main.classList.add('loading-indicator');
    const error = new Error('detail');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    win.showError('<bad>', error);
    expect(win.state.isLoading).toBe(false);
    expect(consoleError).toHaveBeenCalledWith('TestBaseWindow error:', error);
    expect(win.refs.main.innerHTML).toBe('<div class="window-error">&lt;bad&gt;</div>');
    win.refs.main = null;
    expect(() => win.showError('safe')).not.toThrow();
  });

  it('sizes the base window, accounting for optional header/footer, and emits resize', async () => {
    const win = makeWindow();
    await win.render();
    win.cacheRefs();
    Object.defineProperty(win.refs.header, 'offsetHeight', { configurable: true, value: 30 });
    Object.defineProperty(win.refs.footer, 'offsetHeight', { value: 20 });
    win.trigger = vi.fn();
    win.size(800, 600);
    expect(win.style.width).toBe('800px');
    expect(win.style.height).toBe('600px');
    expect(win.refs.main.style.width).toBe('800px');
    expect(win.refs.main.style.height).toBe('550px');
    expect(win.trigger).toHaveBeenCalledWith('resize', {
      type: 'resize', target: win, data: { width: 800, height: 600 }
    });

    win.refs.footer = null;
    Object.defineProperty(win.refs.header, 'offsetHeight', { configurable: true, value: 0 });
    win.size(100, 80);
    expect(win.refs.main.style.height).toBe('80px');
  });

  it('sizes safely before refs are cached', () => {
    const win = makeWindow();
    win.trigger = vi.fn();
    win.size(100, 50);
    expect(win.style.width).toBe('100px');
    expect(win.trigger).toHaveBeenCalled();
  });

  it('serializes default type, sends messages, and resolves nested parameters', () => {
    const win = makeWindow();
    win.trigger = vi.fn();
    expect(win.getData()).toEqual({ params: { win: 'base' } });
    TestBaseWindow.windowType = 'test';
    expect(win.getData()).toEqual({ params: { win: 'test' } });
    win.sendMessage({ value: 1 });
    expect(win.trigger).toHaveBeenCalledWith('message', {
      type: 'message', target: win, data: { value: 1 }
    });
    win.initData = { direct: false, params: { nested: 0 } };
    expect(win.getParam('direct', true)).toBe(false);
    expect(win.getParam('nested', 2)).toBe(0);
    expect(win.getParam('missing', 'fallback')).toBe('fallback');
    win.initData = null;
    expect(win.getParam('missing')).toBeNull();
  });

  it('offers selector, escaping, element creation, and tab label helpers', () => {
    const win = makeWindow();
    win.innerHTML = '<span class="one"></span><span class="one"></span>';
    expect(win.$('.one')).toBe(win.querySelector('.one'));
    expect(win.$$('.one')).toHaveLength(2);
    expect(win.escapeHtml(null)).toBe('');
    expect(win.escapeHtml('<b>&')).toBe('&lt;b&gt;&amp;');
    expect(win.createElement('  <button>Button</button>  ').tagName).toBe('BUTTON');
    win.updateTabLabel('No parent');
    const span = document.createElement('span');
    win.parentInfo = { tab: { querySelector: vi.fn(() => span) } };
    win.updateTabLabel('Updated');
    expect(span.textContent).toBe('Updated');
    win.parentInfo.tab.querySelector.mockReturnValue(null);
    expect(() => win.updateTabLabel('Missing')).not.toThrow();
  });

  it('cleans controllers, bound handlers, and emitter listeners', () => {
    const win = makeWindow();
    const controller = new AbortController();
    const abort = vi.spyOn(controller, 'abort');
    win._abortController = controller;
    win._boundHandlers.set('one', vi.fn());
    win.on('event', vi.fn());
    win.cleanup();
    expect(abort).toHaveBeenCalled();
    expect(win._abortController).toBeNull();
    expect(win._boundHandlers.size).toBe(0);
    expect(win._events).toEqual({});
    expect(() => win.cleanup()).not.toThrow();
  });

  it('closes by cleaning and removing itself', () => {
    const win = makeWindow();
    win.state.isInitialized = true;
    document.body.appendChild(win);
    win.cleanup = vi.fn();
    win.close();
    expect(win.cleanup).toHaveBeenCalled();
    expect(win.parentNode).toBeNull();
  });

  it('registers component metadata, defaults, and avoids redefining existing tags', () => {
    class RegisteredWindow extends BaseWindow {}
    registerWindowComponent('registered-test-window', RegisteredWindow, {
      windowType: 'registered', displayName: 'Registered', paramKeys: { id: 'i' }, defaultInit: { id: 1 }
    });
    expect(RegisteredWindow.windowType).toBe('registered');
    expect(RegisteredWindow.displayName).toBe('Registered');
    expect(RegisteredWindow.paramKeys).toEqual({ id: 'i' });
    expect(RegisteredWindow.defaultInit).toEqual({ id: 1 });
    expect(RegisteredWindow._tagName).toBe('registered-test-window');
    expect(customElements.get('registered-test-window')).toBe(RegisteredWindow);

    class OtherWindow extends BaseWindow {}
    expect(() => registerWindowComponent('registered-test-window', OtherWindow)).not.toThrow();
    expect(customElements.get('registered-test-window')).toBe(RegisteredWindow);
    expect(OtherWindow.paramKeys).toEqual({});
    expect(OtherWindow.defaultInit).toEqual({});
  });
});

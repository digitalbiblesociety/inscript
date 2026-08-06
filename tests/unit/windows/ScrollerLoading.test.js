import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  offset: vi.fn(() => ({ top: 0 })),
  showApocrypha: false,
  skipApocryphalSection: vi.fn(id => id),
  loadSection: vi.fn()
}));

vi.mock('@lib/helpers.esm.js', () => ({ offset: fixtures.offset }));
vi.mock('@bible/Apocrypha.js', () => ({
  getShowApocrypha: () => fixtures.showApocrypha,
  skipApocryphalSection: fixtures.skipApocryphalSection
}));
vi.mock('@texts/TextLoader.js', () => ({ loadSection: fixtures.loadSection }));

import { load, loadMore } from '@windows/ScrollerLoading.js';

function controller() {
  const wrapper = document.createElement('div');
  const nodeElement = document.createElement('div');
  nodeElement.appendChild(wrapper);
  Object.defineProperty(nodeElement, 'offsetHeight', { configurable: true, value: 100 });
  Object.defineProperty(wrapper, 'offsetHeight', { configurable: true, value: 1000 });
  return {
    wrapper,
    nodeElement,
    speedDelta: 0,
    currentTextInfo: { id: 'WEB', abbr: 'WEB', type: 'Bible', sections: ['GN1', 'GN2', 'GN3'] },
    loadEpoch: 0,
    inflightDirectional: { next: null, prev: null },
    pendingLoadSectionid: null,
    pendingLoadFragmentid: null,
    locationInfo: { old: true },
    setScrollTop: vi.fn(value => { nodeElement.scrollTop = value; }),
    load: vi.fn(),
    scrollTo: vi.fn(),
    updateLocationInfo: vi.fn(),
    insertContent: vi.fn(),
    trigger: vi.fn(),
    loadMore: vi.fn(),
    showLoadError: vi.fn(),
    showChapterUnavailable: vi.fn()
  };
}

function sections(ctx, count, { prev = 'GN0', next = 'GN9' } = {}) {
  ctx.wrapper.innerHTML = Array.from({ length: count }, (_, index) =>
    `<div class="section GN${index + 1}" data-id="GN${index + 1}" ` +
    `data-previd="${index ? `GN${index}` : prev}" data-nextid="${index === count - 1 ? next : `GN${index + 2}`}">` +
    `<span data-anchor="${index}"></span></div>`).join('');
}

describe('ScrollerLoading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.showApocrypha = false;
    fixtures.skipApocryphalSection.mockImplementation(id => id);
  });

  it('does nothing while unavailable or moving', () => {
    const ctx = controller();
    ctx.wrapper = null;
    loadMore(ctx);
    ctx.wrapper = document.createElement('div');
    ctx.speedDelta = 2;
    loadMore(ctx);
    expect(ctx.load).not.toHaveBeenCalled();
  });

  it('loads the next or previous visible section near either edge', () => {
    const ctx = controller();
    sections(ctx, 2, { prev: 'TOB1', next: 'GN3' });
    ctx.nodeElement.scrollTop = 850;
    fixtures.skipApocryphalSection.mockReturnValueOnce('GN3');
    loadMore(ctx);
    expect(ctx.load).toHaveBeenCalledWith('next', 'GN3');

    ctx.load.mockClear();
    Object.defineProperty(ctx.wrapper, 'offsetHeight', { configurable: true, value: 2000 });
    ctx.nodeElement.scrollTop = 50;
    fixtures.skipApocryphalSection.mockReturnValueOnce('GN0');
    loadMore(ctx);
    expect(ctx.load).toHaveBeenCalledWith('prev', 'GN0');
    expect(fixtures.skipApocryphalSection).toHaveBeenLastCalledWith('TOB1', -1, ctx.currentTextInfo.sections);
  });

  it('keeps apocryphal ids when enabled and ignores null boundaries', () => {
    const ctx = controller();
    sections(ctx, 2, { next: 'TOB1' });
    ctx.nodeElement.scrollTop = 850;
    fixtures.showApocrypha = true;
    loadMore(ctx);
    expect(ctx.load).toHaveBeenCalledWith('next', 'TOB1');
    expect(fixtures.skipApocryphalSection).not.toHaveBeenCalled();
    ctx.load.mockClear();
    sections(ctx, 2, { next: 'null' });
    loadMore(ctx);
    expect(ctx.load).not.toHaveBeenCalled();
  });

  it('trims distant sections from the top while preserving the viewport', () => {
    const ctx = controller();
    sections(ctx, 3);
    Object.defineProperty(ctx.wrapper, 'offsetHeight', { configurable: true, value: 4000 });
    ctx.nodeElement.scrollTop = 1600;
    // Alternating anchor/wrapper reads, before and after the removal.
    fixtures.offset
      .mockReturnValueOnce({ top: 200 }).mockReturnValueOnce({ top: 0 })
      .mockReturnValueOnce({ top: 150 }).mockReturnValueOnce({ top: 0 });
    loadMore(ctx);
    expect(ctx.wrapper.querySelectorAll('.section')).toHaveLength(2);
    expect(ctx.setScrollTop).toHaveBeenCalledWith(1550);
  });

  it('trims distant sections from the bottom', () => {
    const ctx = controller();
    sections(ctx, 5);
    Object.defineProperty(ctx.wrapper, 'offsetHeight', { configurable: true, value: 4000 });
    ctx.nodeElement.scrollTop = 500;
    loadMore(ctx);
    expect(ctx.wrapper.querySelectorAll('.section')).toHaveLength(4);
  });

  // A commentary chapter can be twenty viewports tall. Trimming one the reader
  // is still inside of leaves nowhere to restore the position to, and the reload
  // that follows puts it straight back, jittering the view.
  it('keeps a section taller than the buffer it would leave behind', () => {
    const ctx = controller();
    sections(ctx, 2);
    Object.defineProperty(ctx.wrapper, 'offsetHeight', { configurable: true, value: 30000 });
    const [first, last] = ctx.wrapper.querySelectorAll('.section');
    Object.defineProperty(first, 'offsetHeight', { configurable: true, value: 17000 });
    Object.defineProperty(last, 'offsetHeight', { configurable: true, value: 13000 });
    ctx.nodeElement.scrollTop = 16000;

    loadMore(ctx);

    expect(ctx.wrapper.querySelectorAll('.section')).toHaveLength(2);
    expect(ctx.setScrollTop).not.toHaveBeenCalled();
    expect(ctx.load).not.toHaveBeenCalled();
  });

  it('keeps a trailing section taller than the buffer below it', () => {
    const ctx = controller();
    sections(ctx, 5);
    Object.defineProperty(ctx.wrapper, 'offsetHeight', { configurable: true, value: 4000 });
    const all = ctx.wrapper.querySelectorAll('.section');
    Object.defineProperty(all[all.length - 1], 'offsetHeight', { configurable: true, value: 3300 });
    ctx.nodeElement.scrollTop = 500;

    loadMore(ctx);

    expect(ctx.wrapper.querySelectorAll('.section')).toHaveLength(5);
  });

  it('scrolls to an already-loaded text and refreshes its location', () => {
    const ctx = controller();
    sections(ctx, 1);
    load(ctx, 'text', 'GN1', ' GN1_2 ');
    expect(ctx.scrollTo).toHaveBeenCalledWith(' GN1_2 ');
    expect(ctx.locationInfo).toBeNull();
    expect(ctx.updateLocationInfo).toHaveBeenCalled();
    expect(fixtures.loadSection).not.toHaveBeenCalled();

    ctx.scrollTo.mockClear();
    load(ctx, 'text', 'GN1', '');
    expect(ctx.scrollTo).toHaveBeenCalledWith('GN1');
  });

  it('prepares a text load, coalesces its latest fragment, and handles success', () => {
    const ctx = controller();
    ctx.currentTextInfo.loadingMessage = 'Loading chapter';
    load(ctx, 'text', 'GN2', 'GN2_1');
    expect(ctx.loadEpoch).toBe(1);
    expect(ctx.wrapper.innerHTML).toContain('Loading chapter');
    expect(ctx.setScrollTop).toHaveBeenCalledWith(0);
    expect(fixtures.loadSection).toHaveBeenCalledOnce();
    load(ctx, 'text', 'GN2', 'GN2_5');
    expect(fixtures.loadSection).toHaveBeenCalledOnce();
    expect(ctx.pendingLoadFragmentid).toBe('GN2_5');

    const success = fixtures.loadSection.mock.calls[0][2];
    success('<div class="section GN2"></div>');
    expect(ctx.insertContent).toHaveBeenCalledWith('text', expect.any(String));
    expect(ctx.scrollTo).toHaveBeenCalledWith('GN2_5');
    expect(ctx.pendingLoadSectionid).toBeNull();
    expect(ctx.trigger).toHaveBeenCalledWith('globalmessage', expect.objectContaining({
      data: expect.objectContaining({ texttype: 'bible', sectionid: 'GN2', fragmentid: 'GN2_1' })
    }));
    expect(ctx.loadMore).toHaveBeenCalled();
  });

  it('deduplicates directional loads, clears inflight state, and handles missing text metadata', () => {
    const ctx = controller();
    load(ctx, 'next', 'GN2');
    load(ctx, 'next', 'GN2');
    expect(fixtures.loadSection).toHaveBeenCalledOnce();
    expect(ctx.inflightDirectional.next).toBe(0);
    ctx.currentTextInfo = null;
    fixtures.loadSection.mock.calls[0][2]('<section>next</section>');
    expect(ctx.inflightDirectional.next).toBeNull();
    expect(ctx.insertContent).toHaveBeenCalledWith('next', '<section>next</section>');
    expect(ctx.trigger).not.toHaveBeenCalled();
  });

  it('reports text load errors and ignores stale or directional errors', () => {
    const ctx = controller();
    load(ctx, 'text', 'GN2', 'GN2_1');
    fixtures.loadSection.mock.calls[0][3](null, null, { message: 'Unavailable' });
    expect(ctx.showLoadError).toHaveBeenCalledWith('Unavailable');
    expect(ctx.pendingLoadSectionid).toBeNull();

    fixtures.loadSection.mockClear();
    load(ctx, 'text', 'GN3', 'GN3_1');
    fixtures.loadSection.mock.calls[0][3](null, null, {});
    expect(ctx.showChapterUnavailable).toHaveBeenCalledWith('GN3');

    fixtures.loadSection.mockClear();
    load(ctx, 'prev', 'GN1');
    fixtures.loadSection.mock.calls[0][3](null, null, { message: 'ignored' });
    expect(ctx.inflightDirectional.prev).toBeNull();
    expect(ctx.showLoadError).toHaveBeenCalledTimes(1);
  });

  it('ignores invalid, detached, and stale loads', () => {
    const ctx = controller();
    load(ctx, 'text', null);
    load(ctx, 'text', 'null');
    ctx.wrapper = null;
    load(ctx, 'text', 'GN1');
    expect(fixtures.loadSection).not.toHaveBeenCalled();

    ctx.wrapper = document.createElement('div');
    load(ctx, 'next', 'GN2');
    ctx.loadEpoch++;
    fixtures.loadSection.mock.calls[0][2]('stale');
    expect(ctx.insertContent).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  offset: vi.fn(element => ({ top: Number(element?.dataset?.top ?? 0) })),
  Reference: vi.fn(fragmentid => ({
    fragmentid,
    language: '',
    toString() { return `${this.language}:${this.fragmentid}`; }
  }))
}));

vi.mock('@lib/helpers.esm.js', () => ({ offset: fixtures.offset }));
vi.mock('@bible/BibleReference.js', () => ({ Reference: fixtures.Reference }));

import { scrollTo, setScrollTop, updateLocationInfo } from '@windows/ScrollerLocation.js';

function controller(html = '') {
  const nodeElement = document.createElement('div');
  nodeElement.dataset.top = '100';
  nodeElement.innerHTML = `<div class="wrapper">${html}</div>`;
  return {
    nodeElement,
    wrapper: nodeElement.firstElementChild,
    currentTextInfo: { id: 'WEB', abbr: 'Web', lang: 'eng', type: 'Bible', sections: ['GN1', 'GN2'] },
    locationInfo: null,
    suppressedScrollTop: null,
    trigger: vi.fn(),
    setScrollTop: vi.fn(value => { nodeElement.scrollTop = value; }),
    load: vi.fn()
  };
}

describe('ScrollerLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.offset.mockImplementation(element => ({ top: Number(element?.dataset?.top ?? 0) }));
  });

  it('sets and records changed scroll positions only', () => {
    const ctx = controller();
    setScrollTop(ctx, 0);
    expect(ctx.suppressedScrollTop).toBeNull();
    setScrollTop(ctx, 25);
    expect(ctx.nodeElement.scrollTop).toBe(25);
    expect(ctx.suppressedScrollTop).toBe(25);
  });

  it('creates lazy Bible labels and emits only changed locations', () => {
    const ctx = controller('<div class="section GN1" data-id="GN1">' +
      '<span class="v GN1_1" data-id="GN1_1" data-top="110"></span>' +
      '<span class="v GN1_2" data-id="GN1_2" data-top="130"></span></div>');
    updateLocationInfo(ctx);
    expect(ctx.locationInfo).toMatchObject({
      fragmentid: 'GN1_1', sectionid: 'GN1', offset: -10, textid: 'WEB'
    });
    expect(ctx.locationInfo.label).toBe('eng:GN1_1');
    expect(ctx.locationInfo.labelLong).toBe('eng:GN1_1 (Web)');
    expect(ctx.trigger).toHaveBeenCalledOnce();
    updateLocationInfo(ctx);
    expect(ctx.trigger).toHaveBeenCalledOnce();
  });

  it('builds book labels and supports a custom fragment selector', () => {
    const ctx = controller('<div class="section page-one" data-id="page-one" data-top="120"></div>');
    ctx.currentTextInfo = {
      id: 'BOOK', name: 'My Book', type: 'Book', fragmentSelector: '.page-one'
    };
    updateLocationInfo(ctx);
    expect(ctx.locationInfo.sectionid).toBe('page-one');
    expect(ctx.locationInfo.label).toBe('My Book page-one');
    expect(ctx.locationInfo.labelLong).toBe('My Book page-one');
  });

  it('falls back from a sole fragment to its section and permits empty labels', () => {
    const ctx = controller('<div class="section GN1" data-id="GN1" data-top="110"><span class="v GN1_1" data-id="GN1_1" data-top="90"></span></div>');
    fixtures.Reference.mockReturnValueOnce(null);
    updateLocationInfo(ctx);
    expect(ctx.locationInfo.fragmentid).toBe('GN1');
    expect(ctx.locationInfo.label).toBe('');
  });

  it('chooses the first visible duplicate and skips hidden duplicate groups', () => {
    const ctx = controller(`<div class="section GN1" data-id="GN1">
      <span class="v GN1_1" data-id="GN1_1" data-top="90"></span>
      <span class="v GN1_1" data-id="GN1_1" data-top="110"></span>
      <span class="v GN1_2" data-id="GN1_2" data-top="120"></span>
    </div>`);
    updateLocationInfo(ctx);
    expect(ctx.locationInfo.fragmentid).toBe('GN1_2');
  });

  it('clears location when nothing is visible', () => {
    const ctx = controller('<span class="v" data-id="GN1_1" data-top="90"></span><span class="v" data-id="GN1_2" data-top="98"></span>');
    updateLocationInfo(ctx);
    expect(ctx.locationInfo).toBeNull();
    expect(ctx.trigger).not.toHaveBeenCalled();
  });

  it('scrolls to an exact fragment with an optional offset', () => {
    const ctx = controller('<div class="section GN1"><span class="v GN1_2" data-id="GN1_2" data-top="240"></span></div>');
    ctx.nodeElement.scrollTop = 30;
    scrollTo(ctx, 'GN1_2', 5);
    expect(ctx.setScrollTop).toHaveBeenCalledWith(175);
  });

  it('chooses the nearest valid verse when the exact fragment is absent', () => {
    const ctx = controller(`<div class="section GN1">
      <span class="v" data-id="bad"></span>
      <span class="v" data-id="GN1_bad"></span>
      <span class="v" data-id="GN1_2" data-top="120"></span>
      <span class="verse" data-id="GN1_7" data-top="170"></span>
    </div>`);
    scrollTo(ctx, 'GN1_5');
    expect(ctx.setScrollTop).toHaveBeenCalledWith(70);
    ctx.setScrollTop.mockClear();
    scrollTo(ctx, 'XX_bad');
    expect(ctx.setScrollTop).not.toHaveBeenCalled();
  });

  it('falls back to a section or requests an available unloaded section', () => {
    const ctx = controller('<div class="section GN1" data-top="150"></div>');
    scrollTo(ctx, 'GN1_unknown');
    expect(ctx.setScrollTop).toHaveBeenCalledWith(50);
    scrollTo(ctx, 'GN2_3');
    expect(ctx.load).toHaveBeenCalledWith('text', 'GN2', 'GN2_3');
    scrollTo(ctx, 'EX1_1');
    expect(ctx.load).toHaveBeenCalledOnce();
  });

  it('ignores missing targets and detached wrappers', () => {
    const ctx = controller();
    scrollTo(ctx, null);
    ctx.wrapper = null;
    scrollTo(ctx, 'GN1_1');
    expect(ctx.load).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({ Reference: vi.fn() }));
vi.mock('@bible/BibleReference.js', () => ({ Reference: fixtures.Reference }));

import {
  findNearestSection,
  insertContent,
  showChapterUnavailable,
  showLoadError
} from '@windows/ScrollerContent.js';

function controller() {
  const wrapper = document.createElement('div');
  const nodeElement = document.createElement('div');
  return {
    wrapper,
    nodeElement,
    currentTextInfo: { lang: 'spa', sections: [] },
    setScrollTop: vi.fn(value => { nodeElement.scrollTop = value; }),
    load: vi.fn()
  };
}

describe('ScrollerContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.Reference.mockImplementation(sectionid => ({
      language: 'eng',
      toString: () => `label:${sectionid}`
    }));
  });

  it('returns null without available sections and preserves exact matches', () => {
    expect(findNearestSection('GN1', null)).toBeNull();
    expect(findNearestSection('GN1', [])).toBeNull();
    expect(findNearestSection('GN1', ['GN1', 'GN2'])).toBe('GN1');
  });

  it('finds the nearest chapter in the same book and defaults malformed chapters to one', () => {
    expect(findNearestSection('GN5', ['GN1', 'GN4', 'GN8'])).toBe('GN4');
    expect(findNearestSection('GNbad', ['GN1', 'GN4'])).toBe('GN1');
    expect(findNearestSection('GN6', ['GN4', 'GN8'])).toBe('GN4');
  });

  it('falls back to the first section for a non-Apocrypha book', () => {
    expect(findNearestSection('ZZ1', ['JN1', 'GN1'])).toBe('JN1');
  });

  it('finds the canonically nearest available Apocrypha book', () => {
    expect(findNearestSection('SR1', ['TB1', 'MA1', 'WS1'])).toBe('WS1');
  });

  it('replaces text content from strings, nodes, or wrappers and resets scroll', () => {
    const ctx = controller();
    ctx.wrapper.innerHTML = '<span>old</span>';
    insertContent(ctx, 'text', '<p>string</p>');
    expect(ctx.wrapper.innerHTML).toBe('<p>string</p>');
    expect(ctx.setScrollTop).toHaveBeenCalledWith(0);

    const node = document.createElement('section');
    node.textContent = 'node';
    insertContent(ctx, 'text', node);
    expect(ctx.wrapper.firstChild).toBe(node);

    const wrapped = document.createElement('article');
    insertContent(ctx, 'text', { 0: wrapped });
    expect(ctx.wrapper.firstChild).toBe(wrapped);

    insertContent(ctx, 'text', {});
    expect(ctx.wrapper.children).toHaveLength(0);
  });

  it('appends next content from strings, nodes, and wrapped nodes', () => {
    const ctx = controller();
    ctx.wrapper.innerHTML = '<p>first</p>';
    insertContent(ctx, 'next', '<p>second</p>');
    const node = document.createElement('p');
    node.textContent = 'third';
    insertContent(ctx, 'next', node);
    const wrapped = document.createElement('p');
    wrapped.textContent = 'fourth';
    insertContent(ctx, 'next', [wrapped]);
    insertContent(ctx, 'next', {});
    expect([...ctx.wrapper.children].map(child => child.textContent))
      .toEqual(['first', 'second', 'third', 'fourth']);
  });

  it('prepends previous strings while preserving the visual scroll position', () => {
    const ctx = controller();
    ctx.wrapper.innerHTML = '<p>existing</p>';
    ctx.nodeElement.scrollTop = 40;
    let height = 100;
    Object.defineProperty(ctx.wrapper, 'offsetHeight', { get: () => height });
    const originalInsert = ctx.wrapper.insertAdjacentHTML.bind(ctx.wrapper);
    vi.spyOn(ctx.wrapper, 'insertAdjacentHTML').mockImplementation((position, html) => {
      originalInsert(position, html);
      height = 160;
    });
    insertContent(ctx, 'prev', '<p>previous</p>');
    expect(ctx.wrapper.firstChild.textContent).toBe('previous');
    expect(ctx.setScrollTop).toHaveBeenCalledWith(100);
  });

  it('prepends previous nodes/wrappers and ignores missing elements', () => {
    const ctx = controller();
    const existing = document.createElement('p');
    existing.textContent = 'existing';
    ctx.wrapper.appendChild(existing);
    let height = 100;
    Object.defineProperty(ctx.wrapper, 'offsetHeight', { get: () => height });
    const originalInsert = ctx.wrapper.insertBefore.bind(ctx.wrapper);
    vi.spyOn(ctx.wrapper, 'insertBefore').mockImplementation((node, before) => {
      const result = originalInsert(node, before);
      height += 20;
      return result;
    });
    const node = document.createElement('p');
    node.textContent = 'node';
    insertContent(ctx, 'prev', node);
    const wrapped = document.createElement('p');
    wrapped.textContent = 'wrapped';
    insertContent(ctx, 'prev', { 0: wrapped });
    insertContent(ctx, 'prev', {});
    expect([...ctx.wrapper.children].map(child => child.textContent))
      .toEqual(['wrapped', 'node', 'existing']);
  });

  it('does nothing for unknown load types', () => {
    const ctx = controller();
    insertContent(ctx, 'unknown', '<p>content</p>');
    expect(ctx.wrapper.innerHTML).toBe('');
  });

  it('renders a localized unavailable chapter and links to its nearest chapter', () => {
    const ctx = controller();
    ctx.currentTextInfo.sections = ['GN1', 'GN3'];
    showChapterUnavailable(ctx, 'GN2');
    expect(ctx.wrapper.querySelector('.chapter-unavailable-message').textContent)
      .toBe('label:GN2 is not available in this text.');
    const link = ctx.wrapper.querySelector('.chapter-unavailable-link');
    expect(link.textContent).toBe('Go to label:GN1');
    expect(fixtures.Reference.mock.results[0].value.language).toBe('spa');
    link.click();
    expect(ctx.load).toHaveBeenCalledWith('text', 'GN1');
  });

  it('uses raw labels for invalid/empty references and omits same/missing links', () => {
    const ctx = controller();
    fixtures.Reference.mockReturnValueOnce(null);
    ctx.currentTextInfo.sections = ['ZZ1'];
    showChapterUnavailable(ctx, 'ZZ1');
    expect(ctx.wrapper.textContent).toBe('ZZ1 is not available in this text.');
    expect(ctx.wrapper.querySelector('a')).toBeNull();

    fixtures.Reference.mockImplementation(sectionid => ({
      toString: () => sectionid === 'GN2' ? '' : `label:${sectionid}`
    }));
    ctx.currentTextInfo.sections = [];
    showChapterUnavailable(ctx, 'GN2');
    expect(ctx.wrapper.textContent).toBe('GN2 is not available in this text.');
    expect(ctx.wrapper.querySelector('a')).toBeNull();
  });

  it('ignores unavailable/error rendering when no wrapper exists', () => {
    const ctx = controller();
    ctx.wrapper = null;
    expect(() => showChapterUnavailable(ctx, 'GN1')).not.toThrow();
    expect(() => showLoadError(ctx, 'failed')).not.toThrow();
  });

  it('renders a plain load error and resets scrolling', () => {
    const ctx = controller();
    ctx.wrapper.innerHTML = '<p>old</p>';
    showLoadError(ctx, '<failed>');
    expect(ctx.wrapper.querySelector('.chapter-unavailable-message').textContent).toBe('<failed>');
    expect(ctx.wrapper.innerHTML).toContain('&lt;failed&gt;');
    expect(ctx.setScrollTop).toHaveBeenCalledWith(0);
  });
});

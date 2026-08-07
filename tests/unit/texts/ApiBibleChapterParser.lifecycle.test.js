import { describe, expect, it } from 'vitest';

import {
  buildAboutHtml,
  buildStructureFromBooks,
  parseChapterContent,
  renderApiBibleSection
} from '@texts/ApiBibleChapterParser.js';

const verse = number => ({
  type: 'tag', name: 'verse', attrs: { style: 'v', number: String(number) }
});

describe('ApiBibleChapterParser helpers', () => {
  it('handles defaults, ignored nodes, nested tags, and non-red-letter char runs', () => {
    const html = parseChapterContent([
      null,
      { type: 'text', text: 'outside' },
      { type: 'tag', name: 'para', items: [
        { type: 'text', text: '' },
        { type: 'other', text: 'ignored' },
        verse(1),
        { type: 'tag', name: 'char', attrs: { style: 'it' }, items: [
          { type: 'text', text: 'nested' }
        ] },
        { type: 'tag', name: 'wrapper', items: [
          { type: 'text', text: ' deeper' }
        ] }
      ] }
    ], 'GN1');
    expect(html).toBe(
      '<div class="p"><span class="v-num v-1">1&nbsp;</span>' +
      '<span class="v GN1_1" data-id="GN1_1">nested deeper</span></div>'
    );
  });

  it('collects nested title text, escapes it, and skips empty titles', () => {
    const html = parseChapterContent([
      { type: 'tag', name: 'para', attrs: { style: 's2' }, items: [
        { type: 'text', text: 'A & ' },
        { type: 'tag', items: [{ type: 'text', text: 'title' }] }
      ] },
      { type: 'tag', name: 'para', attrs: { style: 'ms' }, items: [] }
    ], 'GN1');
    expect(html).toBe('<div class="s">A &amp; title</div>');
  });

  it('builds about markup with preferred metadata and safe external links', () => {
    const html = buildAboutHtml(
      { name: 'Fallback', langName: 'Fallback language' },
      {
        nameLocal: 'Local <Name>', name: 'Name',
        language: { name: 'Language & Name' },
        info: '<a href="https://publisher.test">Publisher</a>',
        copyright: 'Copyright >'
      }
    );
    expect(html).toContain('Local &lt;Name&gt;');
    expect(html).toContain('Language &amp; Name');
    expect(html).toContain('<a target="_blank" rel="noopener" href="https://publisher.test">');
    expect(html).toContain('Copyright &gt;');
  });

  it('uses text-info fallbacks when optional details are absent', () => {
    const html = buildAboutHtml({ name: 'Fallback', langName: 'English' }, null);
    expect(html).toContain('<h1>Fallback</h1>');
    expect(html).toContain('English');
  });

  it('rebuilds divisions and numeric section ids while skipping unknown books and intros', () => {
    const info = { divisions: ['old'], divisionNames: ['old'], sections: ['old'] };
    buildStructureFromBooks(info, [
      { id: 'GEN', name: 'Genesis', chapters: [
        { number: 'intro' }, { number: '1' }, { number: '02' }
      ] },
      { id: 'MAT', name: 'Matthew' },
      { id: 'UNKNOWN', name: 'Unknown', chapters: [{ number: '1' }] }
    ], code => ({ GEN: 'GN', MAT: 'MT' })[code]);
    expect(info).toEqual({
      divisions: ['GN', 'MT'],
      divisionNames: ['Genesis', 'Matthew'],
      sections: ['GN1', 'GN02']
    });
  });

  it('renders first chapters with titles and language metadata', () => {
    const html = renderApiBibleSection({
      content: [{ type: 'tag', name: 'para', items: [verse(1), { type: 'text', text: 'Text' }] }],
      textid: 'ENGWEB', sectionid: 'GN1', bookid: 'GN', chapter: '1',
      lang: 'eng', dir: 'ltr', previd: '', nextid: 'GN2', bookTitle: 'Genesis'
    });
    expect(html).toContain('data-textid="ENGWEB"');
    expect(html).toContain('lang="en"');
    expect(html).toContain('data-nextid="GN2"');
    expect(html).toContain('<div class="mt">Genesis</div>');
    expect(html).toContain('<div class="c">1</div>');
  });

  it('omits the book title after chapter one', () => {
    const html = renderApiBibleSection({
      content: [], textid: 'ENGWEB', sectionid: 'GN2', bookid: 'GN', chapter: '2',
      lang: 'eng', dir: 'ltr', previd: 'GN1', nextid: 'GN3', bookTitle: 'Genesis'
    });
    expect(html).not.toContain('class="mt"');
    expect(html).toContain('<div class="c">2</div>');
  });
});

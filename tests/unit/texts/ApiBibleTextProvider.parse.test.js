import { describe, it, expect } from 'vitest';
import { parseChapterContent } from '@texts/ApiBibleTextProvider.js';

/**
 * Fixtures mirror the real API.Bible content-type=json USX shape (verified live
 * against John 3): top-level `para` tags, `verse` marker tags, `text` nodes
 * carrying verseId, `char` runs (e.g. style "wj" = words of Christ), and `s1`
 * section titles.
 */

const verse = (number) => ({
  name: 'verse',
  type: 'tag',
  attrs: { number: String(number), style: 'v', sid: `JHN 3:${number}` }
});

const text = (t, n) => ({
  type: 'text',
  text: t,
  attrs: { verseId: `JHN.3.${n}`, verseOrgIds: [`JHN.3.${n}`] }
});

describe('parseChapterContent', () => {
  it('emits v-num + verse spans with section-scoped ids', () => {
    const content = [
      { name: 'para', type: 'tag', attrs: { style: 'p' }, items: [
        verse(1), text('In the beginning. ', 1),
        verse(2), text('And then.', 2)
      ] }
    ];

    const html = parseChapterContent(content, 'JN3');

    expect(html).toContain('<span class="v-num v-1">1&nbsp;</span>');
    expect(html).toContain('<span class="v JN3_1" data-id="JN3_1">In the beginning. </span>');
    expect(html).toContain('<span class="v-num v-2">2&nbsp;</span>');
    expect(html).toContain('<span class="v JN3_2" data-id="JN3_2">And then.</span>');
    // wrapped in a paragraph block matching the USFM style
    expect(html.startsWith('<div class="p">')).toBe(true);
    expect(html.endsWith('</div>')).toBe(true);
  });

  it('renders s1 paragraphs as section titles, not verse text', () => {
    const content = [
      { name: 'para', type: 'tag', attrs: { style: 's1' }, items: [
        { type: 'text', text: 'Jesus Teaches Nicodemus' }
      ] },
      { name: 'para', type: 'tag', attrs: { style: 'p' }, items: [verse(1), text('x', 1)] }
    ];

    const html = parseChapterContent(content, 'JN3');

    expect(html).toContain('<div class="s">Jesus Teaches Nicodemus</div>');
    // a title must not introduce a verse span
    expect(html.indexOf('<div class="s">')).toBeLessThan(html.indexOf('class="v JN3_1"'));
  });

  it('wraps words of Christ (char style "wj") in a .wj span inside the verse', () => {
    const content = [
      { name: 'para', type: 'tag', attrs: { style: 'p' }, items: [
        verse(3), text('Jesus replied, ', 3),
        { name: 'char', type: 'tag', attrs: { style: 'wj' }, items: [
          { type: 'text', text: 'You must be born again.', attrs: { verseId: 'JHN.3.3' } }
        ] }
      ] }
    ];

    const html = parseChapterContent(content, 'JN3');

    expect(html).toContain('<span class="wj">You must be born again.</span>');
    // the wj run stays within the open verse span (no stray closing before it)
    expect(html).toContain('data-id="JN3_3">Jesus replied, <span class="wj">');
  });

  it('reopens a verse span (no number) when a verse continues into a new paragraph', () => {
    const content = [
      { name: 'para', type: 'tag', attrs: { style: 'q1' }, items: [verse(16), text('For God so loved', 16)] },
      { name: 'para', type: 'tag', attrs: { style: 'q2' }, items: [text('the world,', 16)] }
    ];

    const html = parseChapterContent(content, 'JN3');

    // two separate .v spans for v16 across the two poetry lines, only one v-num
    const vnumCount = (html.match(/v-num v-16/g) || []).length;
    const vSpanCount = (html.match(/class="v JN3_16"/g) || []).length;
    expect(vnumCount).toBe(1);
    expect(vSpanCount).toBe(2);
    expect(html).toContain('<div class="q2"><span class="v JN3_16" data-id="JN3_16">the world,</span></div>');
  });

  it('escapes HTML special characters in verse text', () => {
    const content = [
      { name: 'para', type: 'tag', attrs: { style: 'p' }, items: [verse(1), text('a < b & c > d', 1)] }
    ];

    const html = parseChapterContent(content, 'JN3');
    expect(html).toContain('a &lt; b &amp; c &gt; d');
  });

  it('skips note tags entirely', () => {
    const content = [
      { name: 'para', type: 'tag', attrs: { style: 'p' }, items: [
        verse(1), text('text', 1),
        { name: 'note', type: 'tag', attrs: { style: 'f' }, items: [{ type: 'text', text: 'a footnote' }] }
      ] }
    ];

    const html = parseChapterContent(content, 'JN3');
    expect(html).not.toContain('a footnote');
  });
});

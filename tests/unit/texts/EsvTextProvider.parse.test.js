import { describe, it, expect } from 'vitest';
import { parseEsvPassageHtml } from '@texts/EsvTextProvider.js';

/**
 * Fixtures mirror the real api.esv.org v3 passage-html markup: <b
 * class="verse-num"> / <b class="chapter-num"> markers, <h3> section headings,
 * <h4 class="psalm-title"> superscriptions, poetry as <div
 * class="block-indent"><p class="line-group"> with <span class="line"> runs,
 * and <span class="woc"> words of Christ.
 */

const NBSP = ' ';

describe('parseEsvPassageHtml', () => {
  it('emits v-num + verse spans with section-scoped ids', () => {
    const passage = `<p class="starts-chapter">` +
      `<b class="verse-num" id="v43003001-1">1${NBSP}</b>Now there was a man of the Pharisees. ` +
      `<b class="verse-num" id="v43003002-1">2${NBSP}</b>This man came to Jesus.</p>`;

    const html = parseEsvPassageHtml(passage, 'JN3');

    expect(html).toContain('<span class="v-num v-1">1&nbsp;</span>');
    expect(html).toContain('<span class="v JN3_1" data-id="JN3_1">Now there was a man of the Pharisees. </span>');
    expect(html).toContain('<span class="v-num v-2">2&nbsp;</span>');
    expect(html).toContain('<span class="v JN3_2" data-id="JN3_2">This man came to Jesus.</span>');
    expect(html.startsWith('<div class="p">')).toBe(true);
    expect(html.endsWith('</div>')).toBe(true);
  });

  it('reads the verse number from a chapter-start marker like "3:1"', () => {
    const passage = `<p><b class="chapter-num" id="v43003001-1">3:1${NBSP}</b>Now there was a man.</p>`;

    const html = parseEsvPassageHtml(passage, 'JN3');

    expect(html).toContain('<span class="v-num v-1">1&nbsp;</span>');
    expect(html).toContain('<span class="v JN3_1" data-id="JN3_1">Now there was a man.</span>');
  });

  it('renders h3 headings as section titles, not verse text', () => {
    const passage = `<h3 id="p43003001_01-1">You Must Be Born Again</h3>` +
      `<p><b class="verse-num">1${NBSP}</b>Now there was a man.</p>`;

    const html = parseEsvPassageHtml(passage, 'JN3');

    expect(html).toContain('<div class="s">You Must Be Born Again</div>');
    expect(html.indexOf('<div class="s">')).toBeLessThan(html.indexOf('class="v JN3_1"'));
  });

  it('keeps words of Christ in a .woc span inside the verse', () => {
    const passage = `<p><b class="verse-num">3${NBSP}</b>Jesus answered him, ` +
      `<span class="woc">“Truly, truly, I say to you.”</span></p>`;

    const html = parseEsvPassageHtml(passage, 'JN3');

    expect(html).toContain('<span class="woc">“Truly, truly, I say to you.”</span>');
    expect(html).toContain('data-id="JN3_3">Jesus answered him, <span class="woc">');
  });

  it('reopens a verse span (no number) when a verse continues into a new paragraph', () => {
    const passage = `<p><b class="verse-num">16${NBSP}</b>For God so loved</p>` +
      `<p>the world,</p>`;

    const html = parseEsvPassageHtml(passage, 'JN3');

    const vnumCount = (html.match(/v-num v-16/g) || []).length;
    const vSpanCount = (html.match(/class="v JN3_16"/g) || []).length;
    expect(vnumCount).toBe(1);
    expect(vSpanCount).toBe(2);
    expect(html).toContain('<div class="p"><span class="v JN3_16" data-id="JN3_16">the world,</span></div>');
  });

  it('turns poetry line-groups into q/q2 line divs with per-line verse spans', () => {
    const passage = `<div class="block-indent"><p class="line-group">` +
      `<b class="chapter-num" id="v19023001-1">23:1${NBSP}</b>` +
      `<span class="line">The <span class="small-caps">Lord</span> is my shepherd; I shall not want.</span><br />` +
      `<b class="verse-num" id="v19023002-1">2${NBSP}</b>` +
      `<span class="line">He makes me lie down in green pastures.</span><br />` +
      `<span class="indent line">He leads me beside still waters.</span><br />` +
      `</p></div>`;

    const html = parseEsvPassageHtml(passage, 'PS23');

    // Each line is its own div; the verse number sits inside the line div.
    expect(html).toContain('<div class="q"><span class="v-num v-1">1&nbsp;</span>' +
      '<span class="v PS23_1" data-id="PS23_1">The <span class="nog">Lord</span> is my shepherd; I shall not want.</span></div>');
    expect(html).toContain('<div class="q"><span class="v-num v-2">2&nbsp;</span>');
    // The indented continuation reopens v2 with no second number.
    expect(html).toContain('<div class="q2"><span class="v PS23_2" data-id="PS23_2">He leads me beside still waters.</span></div>');
    expect((html.match(/v-num v-2/g) || []).length).toBe(1);
    expect((html.match(/class="v PS23_2"/g) || []).length).toBe(2);
  });

  it('renders psalm titles as .d superscriptions', () => {
    const passage = `<h4 class="psalm-title" id="p19023001_02-1">A Psalm of David.</h4>` +
      `<div class="block-indent"><p class="line-group">` +
      `<b class="chapter-num">23:1${NBSP}</b><span class="line">The Lord is my shepherd.</span>` +
      `</p></div>`;

    const html = parseEsvPassageHtml(passage, 'PS23');

    expect(html).toContain('<div class="d">A Psalm of David.</div>');
    expect(html.indexOf('<div class="d">')).toBeLessThan(html.indexOf('class="v PS23_1"'));
  });

  it('escapes HTML special characters in verse text', () => {
    const passage = `<p><b class="verse-num">1${NBSP}</b>a &lt; b &amp; c &gt; d</p>`;

    const html = parseEsvPassageHtml(passage, 'JN3');
    expect(html).toContain('a &lt; b &amp; c &gt; d');
  });

  it('skips footnote markers, footnote blocks and copyright paragraphs', () => {
    const passage = `<p><b class="verse-num">1${NBSP}</b>In the beginning` +
      `<sup class="footnote"><a class="fn" href="#f1">[1]</a></sup> was the Word.</p>` +
      `<div class="footnotes extra_text"><h3>Footnotes</h3>` +
      `<p><span class="footnote"><a href="#b1" id="f1">[1]</a></span> A footnote body.</p></div>` +
      `<p>(<a href="http://www.esv.org" class="copyright">ESV</a>)</p>`;

    const html = parseEsvPassageHtml(passage, 'JN1');

    expect(html).toContain('In the beginning was the Word.');
    expect(html).not.toContain('[1]');
    expect(html).not.toContain('A footnote body.');
    expect(html).not.toContain('ESV</a>');
    expect(html).not.toContain('copyright');
  });

  it('assigns leading text with no verse marker to verse 1', () => {
    const passage = `<p class="starts-chapter">In the beginning was the Word. ` +
      `<b class="verse-num">2${NBSP}</b>He was in the beginning with God.</p>`;

    const html = parseEsvPassageHtml(passage, 'JN1');

    expect(html).toContain('<span class="v JN1_1" data-id="JN1_1">In the beginning was the Word. </span>');
    expect(html).toContain('<span class="v JN1_2" data-id="JN1_2">He was in the beginning with God.</span>');
  });
});

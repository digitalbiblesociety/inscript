import { toBcp47Lang } from '../lib/bcp47.js';

export const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const SKIPPED_INLINE = ['footnote', 'crossref', 'audio', 'extra_text', 'copyright'];
// Passage reference headings, footnote blocks and audio links are turned
// off in the request; drop any that show up anyway.
const SKIPPED_BLOCK = ['extra_text', 'footnotes', 'audio'];
const hasSkippedClass = (cls, skipList) => skipList.some(c => cls.contains(c));

// Inline styling wrappers as [open, close] pairs; "small-caps" marks the
// divine name and .nog is the app's small-caps style.
const WRAP_WOC = ['<span class="woc">', '</span>'];
const WRAP_NOG = ['<span class="nog">', '</span>'];
const WRAP_ITALIC = ['<i>', '</i>'];

const inlineWrapper = (node, cls) => {
  if (cls.contains('woc')) return WRAP_WOC;
  if (cls.contains('small-caps')) return WRAP_NOG;
  if (node.tagName === 'I' || node.tagName === 'EM') return WRAP_ITALIC;
  return null;
};

class EsvPassageParser {
  constructor(sectionid) {
    this.sectionid = sectionid;
    this.html = [];
    this.openVerse = false;
    this.currentVerseNum = null;
  }

  closeVerse() {
    if (this.openVerse) {
      this.html.push('</span>');
      this.openVerse = false;
    }
  }

  openVerseSpan() {
    this.html.push(`<span class="v ${this.sectionid}_${this.currentVerseNum}" data-id="${this.sectionid}_${this.currentVerseNum}">`);
    this.openVerse = true;
  }

  ensureVerseOpen() {
    if (this.openVerse) return;
    if (this.currentVerseNum == null) this.currentVerseNum = '1';
    this.openVerseSpan();
  }

  markerVerseNum(el) {
    const raw = el.textContent.replace(/\u00a0/g, ' ').trim();
    return raw.includes(':') ? raw.split(':').pop() : raw;
  }

  isVerseMarker(el) {
    return el.tagName === 'B' && (el.classList.contains('verse-num') || el.classList.contains('chapter-num'));
  }

  verseNumHtml() {
    return `<span class="v-num v-${this.currentVerseNum}">${escapeHtml(this.currentVerseNum)}&nbsp;</span>`;
  }

  inlineText(text) {
    if (!text) return;
    if (!this.openVerse && text.trim() === '') return;
    this.ensureVerseOpen();
    this.html.push(escapeHtml(text));
  }

  walkInline(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      this.inlineText(node.nodeValue ?? '');
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const cls = node.classList;
    if (hasSkippedClass(cls, SKIPPED_INLINE)) return;
    if (node.tagName === 'BR') return;

    if (this.isVerseMarker(node)) {
      this.closeVerse();
      this.currentVerseNum = this.markerVerseNum(node);
      this.html.push(this.verseNumHtml());
      this.openVerseSpan();
      return;
    }

    // Wrapped inline content keeps its styling span; any other inline tag
    // (anchors, spans) keeps its content and drops the tag.
    const [open, close] = inlineWrapper(node, cls) ?? [];
    if (open) {
      this.ensureVerseOpen();
      this.html.push(open);
    }
    for (const child of node.childNodes) this.walkInline(child);
    if (close) this.html.push(close);
  }

  // Poetry: <p class="line-group"> holds <span class="line"> / <span
  // class="indent line"> runs with verse-num markers between them. Each line
  // becomes its own q/q2 div; a marker before a line is buffered so the number
  // renders inside that line's div.
  walkLineGroup(el) {
    this.closeVerse();
    let pendingVerseNum = '';

    const renderLine = (line) => {
      this.html.push(`<div class="${line.classList.contains('indent') ? 'q2' : 'q'}">`);
      if (pendingVerseNum) {
        this.html.push(pendingVerseNum);
        pendingVerseNum = '';
      }
      for (const lineChild of line.childNodes) this.walkInline(lineChild);
      this.closeVerse();
      this.html.push('</div>');
    };

    for (const child of el.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE && this.isVerseMarker(child)) {
        this.closeVerse();
        this.currentVerseNum = this.markerVerseNum(child);
        pendingVerseNum += this.verseNumHtml();
        continue;
      }

      if (child.nodeType === Node.ELEMENT_NODE && child.classList.contains('line')) {
        renderLine(child);
        continue;
      }

      this.walkInline(child);
    }
  }

  pushHeading(node, className) {
    this.closeVerse();
    const title = node.textContent.trim();
    if (title) this.html.push(`<div class="${className}">${escapeHtml(title)}</div>`);
  }

  walkParagraph(node) {
    this.closeVerse();
    this.html.push('<div class="p">');
    for (const child of node.childNodes) this.walkInline(child);
    this.closeVerse();
    this.html.push('</div>');
  }

  walkBlock(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    const cls = node.classList;

    if (hasSkippedClass(cls, SKIPPED_BLOCK)) {
      // dropped block
    } else if (tag === 'H3') {
      this.pushHeading(node, 's');
    } else if (cls.contains('psalm-title') || tag === 'H4') {
      this.pushHeading(node, 'd');
    } else if (tag === 'P' && cls.contains('line-group')) {
      this.walkLineGroup(node);
    } else if (tag === 'P') {
      if (!node.querySelector('a.copyright')) this.walkParagraph(node);
    } else {
      // block-indent and any other wrapper: recurse into its children.
      this.walkBlocks(node.childNodes);
    }
  }

  walkBlocks(nodes) {
    for (const node of nodes) this.walkBlock(node);
  }

  parse(passageHtml) {
    const doc = new DOMParser().parseFromString(passageHtml, 'text/html');
    this.walkBlocks(doc.body.childNodes);
    this.closeVerse();
    return this.html.join('');
  }
}

export function parseEsvPassageHtml(passageHtml, sectionid) {
  return new EsvPassageParser(sectionid).parse(passageHtml);
}

/** Wraps one parsed chapter in the section markup the reader expects. */
export function renderEsvSection({ passage, textid, sectionid, bookid, chapter, lang, dir, previd, nextid, bookTitle }) {
  const html = [];

  html.push(`<div class="section chapter ${textid} ${bookid} ${sectionid} ${lang}" ` +
    ` data-textid="${textid}"` +
    ` data-id="${sectionid}"` +
    ` data-nextid="${nextid}"` +
    ` data-previd="${previd}"` +
    ` lang="${toBcp47Lang(lang)}"` +
    ` data-lang3="${lang}"` +
    ` dir="${dir}"` +
    `>`);

  if (chapter === '1') {
    html.push(`<div class="mt">${escapeHtml(bookTitle)}</div>`);
  }

  html.push(`<div class="c">${chapter}</div>`);
  html.push(parseEsvPassageHtml(passage, sectionid));
  html.push('</div>');

  return html.join('');
}

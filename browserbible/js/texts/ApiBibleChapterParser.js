import { toBcp47Lang } from '../lib/bcp47.js';

export const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// Paragraph styles that are section headings rather than verse-bearing prose.
const TITLE_STYLE = /^(s\d*|ms\d*|mr|sr|sp|d|qa|r)$/;

const collectText = (items = []) => {
  let out = '';
  for (const item of items) {
    if (item.type === 'text') out += item.text ?? '';
    else if (item.items) out += collectText(item.items);
  }
  return out;
};

class ApiBibleChapterParser {
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

  // Reopen a verse span (no number marker) when a verse continues into a new
  // paragraph or styled run.
  ensureVerseOpen() {
    if (!this.openVerse && this.currentVerseNum != null) {
      this.html.push(`<span class="v ${this.sectionid}_${this.currentVerseNum}" data-id="${this.sectionid}_${this.currentVerseNum}">`);
      this.openVerse = true;
    }
  }

  startVerse(item) {
    this.closeVerse();
    const n = item.attrs.number;
    this.currentVerseNum = n;
    this.html.push(`<span class="v-num v-${n}">${escapeHtml(n)}&nbsp;</span>`);
    this.html.push(`<span class="v ${this.sectionid}_${n}" data-id="${this.sectionid}_${n}">`);
    this.openVerse = true;
  }

  walkChar(item, style) {
    this.ensureVerseOpen();
    if (style === 'wj') {
      this.html.push('<span class="wj">');
      this.walkInline(item.items);
      this.html.push('</span>');
    } else {
      this.walkInline(item.items);
    }
  }

  walkInline(items = []) {
    for (const item of items) {
      if (item.type === 'text') {
        if (item.text) {
          this.ensureVerseOpen();
          this.html.push(escapeHtml(item.text));
        }
        continue;
      }

      if (item.type !== 'tag') continue;
      const style = item.attrs?.style;

      if (item.name === 'verse' && style === 'v') {
        this.startVerse(item);
      } else if (item.name === 'note') {
        // Footnotes/cross-refs are turned off in the request; skip any that show up.
      } else if (item.name === 'char') {
        this.walkChar(item, style);
      } else if (item.items) {
        // Any other inline tag: descend into its content.
        this.walkInline(item.items);
      }
    }
  }

  walkBlock(block) {
    if (block?.type !== 'tag' || block.name !== 'para') return;
    const style = block.attrs?.style ?? 'p';

    if (TITLE_STYLE.test(style)) {
      this.closeVerse();
      const title = collectText(block.items).trim();
      if (title) this.html.push(`<div class="s">${escapeHtml(title)}</div>`);
      return;
    }

    this.closeVerse();
    this.html.push(`<div class="${style}">`);
    this.walkInline(block.items);
    this.closeVerse();
    this.html.push('</div>');
  }

  parse(content) {
    for (const block of content) {
      this.walkBlock(block);
    }
    this.closeVerse();
    return this.html.join('');
  }
}

/**
 * Walk API.Bible USX-JSON `data.content` array into the app verse-span HTML:
 * paragraphs, titles and verse spans. Exported for unit testing; pure.
 */
export function parseChapterContent(content, sectionid) {
  return new ApiBibleChapterParser(sectionid).parse(content);
}

const addBlankTargets = (html) => html.replace(/<a\s/gi, '<a target="_blank" rel="noopener" ');

export function buildAboutHtml(textInfo, details) {
  return `<div class="about-text">
  <h1>${escapeHtml(details?.nameLocal || details?.name || textInfo.name)}</h1>
  <p class="about-language">${escapeHtml(details?.language?.name || textInfo.langName || '')}</p>
  <div class="about-publisher">${addBlankTargets(details?.info || '')}</div>
  <p class="about-copyright">${escapeHtml(details?.copyright || '')}</p>
  <p class="about-source">Provided through <a href="https://api.bible" target="_blank" rel="noopener">API.Bible</a>.</p>
</div>`;
}

/** Fills info.divisions/divisionNames/sections from an API.Bible books response. */
export function buildStructureFromBooks(info, books, usfmToDbsCode) {
  info.divisions = [];
  info.divisionNames = [];
  info.sections = [];

  for (const book of books) {
    const dbsCode = usfmToDbsCode(book.id);
    if (typeof dbsCode === 'undefined') continue;

    info.divisions.push(dbsCode);
    info.divisionNames.push(book.name);

    for (const chapter of book.chapters ?? []) {
      // The API includes a non-numeric "intro" pseudo-chapter; skip it.
      if (!/^\d+$/.test(chapter.number)) continue;
      info.sections.push(`${dbsCode}${chapter.number}`);
    }
  }
}

/** Wraps one parsed chapter in the section markup the reader expects. */
export function renderApiBibleSection({ content, textid, sectionid, bookid, chapter, lang, dir, previd, nextid, bookTitle }) {
  const html = [];

  html.push(`<div class="section chapter ${textid} ${bookid} ${sectionid} ${lang} " ` +
    ` data-textid="${textid}"` +
    ` data-id="${sectionid}"` +
    ` data-nextid="${nextid}"` +
    ` data-previd="${previd}"` +
    ` lang="${toBcp47Lang(lang)}"` +
    ` data-lang3="${lang}"` +
    ` dir="${dir}"` +
    `>`);

  if (chapter === '1') {
    html.push(`<div class="mt">${bookTitle}</div>`);
  }

  html.push(`<div class="c">${chapter}</div>`);
  html.push(parseChapterContent(content, sectionid));
  html.push('</div>');

  return html.join('');
}

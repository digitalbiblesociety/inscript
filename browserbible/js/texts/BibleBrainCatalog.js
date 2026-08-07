import { BOOK_DATA, NT_BOOKS } from '../bible/BibleData.js';
import { toBcp47Lang } from '../lib/bcp47.js';
import { escapeHtml } from '../lib/escapeHtml.js';

const MANIFEST_MAX_PAGES = 100;
const MANIFEST_FETCH_CONCURRENCY = 8;

const AUDIO_TYPES = ['audio', 'audio_drama'];

const filesetType = (fs) => fs.type ?? fs.set_type_code ?? '';
const filesetSize = (fs) => fs.size ?? fs.set_size_code ?? '';

const isNtBook = (bookCode) => NT_BOOKS.includes(bookCode);

export function filesetCoversTestament(size, isNT) {
  const s = String(size ?? '').toUpperCase();
  if (s === '' || s === 'C' || s === 'P' || s === 'S') return true;
  return isNT ? s.includes('NT') : s.includes('OT');
}

export function selectTextFileset(textFilesets, bookCode) {
  if (!Array.isArray(textFilesets) || textFilesets.length === 0) return null;
  const isNT = isNtBook(bookCode);
  return textFilesets.find(fs => filesetCoversTestament(fs.size, isNT)) || null;
}

export function flattenFilesets(filesets) {
  if (!filesets || typeof filesets !== 'object') return [];
  return Object.values(filesets).flat().filter(Boolean);
}

export function selectFilesets(filesetsObj) {
  const all = flattenFilesets(filesetsObj);

  const plain = all.filter(fs => filesetType(fs) === 'text_plain');
  const textSource = plain.length > 0
    ? plain
    : all.filter(fs => filesetType(fs) === 'text_format');

  const toEntry = (fs) => ({ id: fs.id, type: filesetType(fs), size: filesetSize(fs) });

  return {
    textFilesets: textSource.map(toEntry),
    audioFilesets: all.filter(fs => AUDIO_TYPES.includes(filesetType(fs))).map(toEntry)
  };
}

const createAboutHtml = (entry) => `<div class="about-text">
  <h1>${escapeHtml(entry.vname || entry.name)}</h1>
  <p class="about-language">${escapeHtml(entry.language || entry.langName || '')}</p>
  <p class="about-source">Provided through <a href="https://www.faithcomesbyhearing.com/bible-brain" target="_blank" rel="noopener">Bible Brain</a> by Faith Comes By Hearing.</p>
</div>`;

export function entryToTextInfo(entry) {
  const { textFilesets, audioFilesets } = selectFilesets(entry.filesets);
  if (textFilesets.length === 0) return null;

  const name = entry.vname || entry.name;
  if (!name) return null;

  return {
    type: 'bible',
    id: entry.abbr,
    name,
    nameEnglish: entry.name || name,
    abbr: entry.abbr,
    lang: entry.iso || '',
    langName: entry.language || '',
    langNameEnglish: entry.language || '',
    dir: 'ltr',
    hasAudio: audioFilesets.length > 0,
    aboutHtml: createAboutHtml(entry),
    biblebrain: {
      bibleId: entry.abbr,
      textFilesets,
      audioFilesets
    }
  };
}

const fetchBiblesPage = async (base, page) => {
  const response = await fetch(`${base}/bibles?page=${page}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const fetchCachedCatalog = async (base) => {
  try {
    const response = await fetch(`${base}/bibles-all`);
    if (!response.ok) return null;
    const data = (await response.json())?.data;
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch (_e) {
    return null;
  }
};

export async function fetchAllBibles(base) {
  const cached = await fetchCachedCatalog(base);
  if (cached) return cached;

  const first = await fetchBiblesPage(base, 1);
  const out = [...(first?.data ?? [])];

  const pagination = first?.meta?.pagination ?? {};
  const lastPage = pagination.last_page ?? pagination.total_pages ?? 1;
  const maxPage = Math.min(lastPage, MANIFEST_MAX_PAGES);
  if (lastPage > MANIFEST_MAX_PAGES) {
    console.warn(`BibleBrainTextProvider: catalog has ${lastPage} pages; fetching first ${MANIFEST_MAX_PAGES}. ` +
      'Set config.bibleBrainLanguages to narrow it.');
  }

  for (let start = 2; start <= maxPage; start += MANIFEST_FETCH_CONCURRENCY) {
    const batch = [];
    for (let p = start; p < start + MANIFEST_FETCH_CONCURRENCY && p <= maxPage; p++) {
      batch.push(fetchBiblesPage(base, p).then(j => j?.data ?? []).catch(() => []));
    }
    for (const data of await Promise.all(batch)) out.push(...data);
  }
  return out;
}

export function normalizeChapters(chapters) {
  if (Array.isArray(chapters)) {
    return chapters.map(Number).filter(n => Number.isFinite(n) && n > 0);
  }
  if (typeof chapters === 'string') {
    return chapters.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);
  }
  return [];
}

/** Fills info.divisions/divisionNames/sections from a Bible Brain books response. */
export function buildStructureFromBooks(info, books, usfmToDbsCode) {
  info.divisions = [];
  info.divisionNames = [];
  info.sections = [];

  for (const book of books) {
    const dbsCode = usfmToDbsCode(book.book_id);
    if (typeof dbsCode === 'undefined') continue;

    if (!selectTextFileset(info.biblebrain.textFilesets, dbsCode)) continue;

    info.divisions.push(dbsCode);
    info.divisionNames.push(book.name || BOOK_DATA[dbsCode]?.name || dbsCode);

    for (const chapter of normalizeChapters(book.chapters)) {
      info.sections.push(`${dbsCode}${chapter}`);
    }
  }
}

export function versesToHtml(verses, ctx) {
  const { textid, sectionid, bookid, chapter, lang, dir, title, previd, nextid } = ctx;
  const html = [];

  html.push(`<div class="section chapter ${textid} ${bookid} ${sectionid} ${lang} "` +
    ` data-textid="${textid}"` +
    ` data-id="${sectionid}"` +
    ` data-nextid="${nextid}"` +
    ` data-previd="${previd}"` +
    ` lang="${toBcp47Lang(lang)}"` +
    ` data-lang3="${lang}"` +
    ` dir="${dir}"` +
    `>`);

  if (String(chapter) === '1' && title) {
    html.push(`<div class="mt">${escapeHtml(title)}</div>`);
  }

  html.push(`<div class="c">${escapeHtml(chapter)}</div>`);
  html.push('<div class="p">');

  for (const verse of verses) {
    const vnum = verse.verse_start;
    const vid = `${sectionid}_${vnum}`;
    html.push(` <span class="v-num v-${vnum}">${escapeHtml(vnum)}</span>` +
      `<span class="v ${vid}" data-id="${vid}">${escapeHtml(verse.verse_text)}</span>`);
  }

  html.push('</div>');
  html.push('</div>');
  return html.join('');
}

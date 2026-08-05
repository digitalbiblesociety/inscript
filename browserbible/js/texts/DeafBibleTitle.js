// Pure helpers that turn Deaf Bible catalog entries and per-title metadata
// into the app's textinfo/section shapes.

import { BOOK_DATA } from '../bible/BibleData.js';
import { toBcp47Lang } from '../lib/bcp47.js';

export const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s.]/g, '');

// Map full English book names in DBS metadata ("Genesis", "1 Samuel") to DBS 2-letter codes.
const BOOK_NAME_TO_CODE = (() => {
  const map = {};
  for (const code of Object.keys(BOOK_DATA)) {
    const book = BOOK_DATA[code];
    map[norm(book.name)] = code;
    for (const alias of book.names?.eng ?? []) map[norm(alias)] = code;
  }
  // Spellings DBS uses that aren't in the alias lists.
  map[norm('Psalms')] = 'PS';
  map[norm('Song of Solomon')] = 'SS';
  return map;
})();

export const idFor = (entry) => `deaf_${entry.iso.toUpperCase()}`;

const pickDescription = (raw, orig) => [
  raw?.description,
  raw?.description_short,
  raw?.longDescription,
  raw?.shortDescription,
  orig.longDescription,
  orig.shortDescription,
  orig.film_description
].find(Boolean) || '';

const createAboutHtml = (entry, raw) => {
  const orig = raw?.source?.original ?? {};
  const description = pickDescription(raw, orig);
  const orgUrl = raw?.org?.url || raw?.org_url || orig.org_url || 'https://deafbiblesociety.com/';
  const country = raw?.country?.name || entry.primaryCountry || '';

  return `<div class="about-text">
  <h1>${escapeHtml(entry.language)}</h1>
  <p class="about-language">Deaf Bible${country ? ` &mdash; ${escapeHtml(country)}` : ''}</p>
  <p>${escapeHtml(description)}</p>
  <p class="about-source">Provided by the <a href="${escapeHtml(orgUrl)}" target="_blank" rel="noopener">Deaf Bible Society</a>.</p>
</div>`;
};

// Normalize a per-title passage (new "sections[].items" shape, or the legacy "chapters" shape)
// into the flat record buildSectionHtml/DeafPlaylist consume.
const normalizePassage = (item) => ({
  book: item.book,
  reference: item.reference,
  title: item.title,
  web_url: item.media?.high?.url ?? item.web_url ?? '',
  web_url_low: item.media?.low?.url ?? item.web_url_low ?? '',
  cover: item.cover ?? '',
  length: item.duration_human ?? item.duration_seconds ?? item.length ?? ''
});

/** Resolve a passage book plus starting chapter/verse to a DBS section id. */
export function parsePassage(book, reference) {
  const code = BOOK_NAME_TO_CODE[norm(book)];
  if (!code) return null;

  // Strip book name first so a numbered book's leading digit doesn't leak into the chapter match.
  let ref = String(reference ?? '');
  const bookName = String(book ?? '');
  const bookIdx = bookName ? ref.toLowerCase().indexOf(bookName.toLowerCase()) : -1;
  if (bookIdx > -1) ref = ref.slice(bookIdx + bookName.length);

  const match = /(\d+)\s*:\s*(\d+)|(\d+)/.exec(ref);
  const chapter = match ? (match[1] ?? match[3]) : '1';
  const verse = match && match[2] ? match[2] : '1';

  return { code, sectionid: `${code}${chapter}`, verse };
}

export function buildTitle(entry, raw) {
  const id = idFor(entry);
  const lang = entry.iso;
  const dir = raw?.language?.direction || entry.direction || 'ltr';

  const divisions = [];
  const divisionNames = [];
  const sections = [];
  const sectionPassages = new Map();

  // New titles group passages under sections[].items; legacy titles used a flat chapters[].
  const rawItems = Array.isArray(raw.sections)
    ? raw.sections.flatMap((section) => section?.items ?? [])
    : (raw.chapters ?? []);

  for (const item of rawItems) {
    const passage = normalizePassage(item);
    const parsed = parsePassage(passage.book, passage.reference || passage.title);
    if (!parsed) continue;

    const { code, sectionid, verse } = parsed;

    if (!divisions.includes(code)) {
      divisions.push(code);
      divisionNames.push(BOOK_DATA[code]?.name || passage.book);
    }
    if (!sectionPassages.has(sectionid)) {
      sectionPassages.set(sectionid, []);
      sections.push(sectionid);
    }
    sectionPassages.get(sectionid).push({ ...passage, verse, sectionid });
  }

  const countryName = raw?.country?.name || entry.primaryCountry || '';

  const info = {
    type: 'deafbible',
    id,
    abbr: entry.iso.toUpperCase(),
    name: entry.language,
    nameEnglish: entry.language,
    title: 'Deaf Bible',
    lang,
    langName: entry.language,
    langNameEnglish: entry.language,
    dir,
    hasText: true,
    hasAudio: false,
    cover: raw?.cover || entry.cover || '',
    countries: countryName ? [countryName] : [],
    divisions,
    divisionNames,
    sections,
    aboutHtml: createAboutHtml(entry, raw),
    _deaf: { file: entry.file, directory: entry.directory }
  };

  // Flat, canonical-order list of passages for the video player (see DeafPlaylist).
  const orderedPassages = sections.flatMap((s) => sectionPassages.get(s));

  return { info, sectionPassages, orderedPassages };
}

export function buildSectionHtml(info, sectionid, passages) {
  // DBS book codes are always two characters (e.g. GN, S1, C2); the rest is the chapter.
  const bookid = sectionid.substring(0, 2);
  const chapter = sectionid.substring(2);

  const idx = info.sections.indexOf(sectionid);
  const previd = idx > 0 ? info.sections[idx - 1] : null;
  const nextid = idx > -1 && idx < info.sections.length - 1 ? info.sections[idx + 1] : null;

  const divIndex = info.divisions.indexOf(bookid);
  const bookName = divIndex > -1 ? info.divisionNames[divIndex] : (BOOK_DATA[bookid]?.name || bookid);

  const html = [];
  html.push(`<div class="section chapter ${info.id} ${bookid} ${sectionid} ${info.lang} "` +
    ` data-textid="${info.id}"` +
    ` data-id="${sectionid}"` +
    ` data-nextid="${nextid}"` +
    ` data-previd="${previd}"` +
    ` lang="${toBcp47Lang(info.lang)}"` +
    ` data-lang3="${info.lang}"` +
    ` dir="${info.dir}"` +
    `>`);

  html.push(`<div class="mt">${escapeHtml(bookName)} ${escapeHtml(chapter)}</div>`);

  for (const passage of passages) {
    const vid = `${sectionid}_${passage.verse}`;
    const heading = passage.title || passage.reference || `${bookName} ${chapter}`;
    const src = passage.web_url || passage.web_url_low || '';
    const poster = passage.cover || info.cover || '';

    html.push(`<span class="v ${vid}" data-id="${vid}">`);
    html.push(`<div class="s">${escapeHtml(heading)}</div>`);
    html.push('<div class="deaf-video">');
    html.push(`<video src="${escapeHtml(src)}" preload="none" class="inline-video" controls` +
      (poster ? ` poster="${escapeHtml(poster)}"` : '') + '></video>');
    html.push('</div>');
    html.push('</span>');
  }

  html.push('</div>');
  return html.join('');
}

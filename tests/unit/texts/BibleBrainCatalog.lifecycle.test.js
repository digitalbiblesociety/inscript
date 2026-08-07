import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildStructureFromBooks,
  entryToTextInfo,
  fetchAllBibles,
  flattenFilesets,
  normalizeChapters,
  selectFilesets,
  selectTextFileset,
  versesToHtml
} from '@texts/BibleBrainCatalog.js';

const response = (body, ok = true, status = 200) => ({
  ok, status, json: vi.fn().mockResolvedValue(body)
});

describe('BibleBrainCatalog lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('normalizes chapter collections', () => {
    expect(normalizeChapters([1, '2', 0, 'bad'])).toEqual([1, 2]);
    expect(normalizeChapters('1, 2, bad, 0')).toEqual([1, 2]);
    expect(normalizeChapters({})).toEqual([]);
  });

  it('flattens and selects plain, formatted, and audio filesets', () => {
    expect(flattenFilesets(null)).toEqual([]);
    const filesets = {
      one: [null, { id: 'FMT', set_type_code: 'text_format', set_size_code: 'NT' }],
      two: [{ id: 'AUDIO', type: 'audio', size: 'C' }]
    };
    expect(selectFilesets(filesets)).toEqual({
      textFilesets: [{ id: 'FMT', type: 'text_format', size: 'NT' }],
      audioFilesets: [{ id: 'AUDIO', type: 'audio', size: 'C' }]
    });
    expect(selectTextFileset([], 'JN')).toBeNull();
  });

  it('rejects entries without text or names and builds complete text metadata', () => {
    expect(entryToTextInfo({ filesets: {}, name: 'No text' })).toBeNull();
    expect(entryToTextInfo({ abbr: 'NONE', filesets: { x: [{ id: 'T', type: 'text_plain', size: 'C' }] } })).toBeNull();
    const info = entryToTextInfo({
      abbr: 'WEB', name: 'World English', vname: 'Local Name', iso: 'eng', language: 'English',
      filesets: { x: [
        { id: 'T', type: 'text_plain', size: 'C' },
        { id: 'A', type: 'audio_drama', size: 'C' }
      ] }
    });
    expect(info).toMatchObject({
      id: 'WEB', name: 'Local Name', nameEnglish: 'World English', hasAudio: true,
      biblebrain: { bibleId: 'WEB' }
    });
    expect(info.aboutHtml).toContain('Local Name');
  });

  it('throws for failed paginated page requests', async () => {
    fetch.mockResolvedValueOnce(response({}, false, 503))
      .mockResolvedValueOnce(response({}, false, 500));
    await expect(fetchAllBibles('base')).rejects.toThrow('HTTP 500');
  });

  it('warns and caps oversized catalogs while tolerating failed later pages', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetch.mockImplementation(async url => {
      if (url.endsWith('/bibles-all')) return response({}, false, 404);
      const page = Number(new URL(url, 'https://base.test').searchParams.get('page'));
      if (page === 1) return response({ data: [{ page: 1 }], meta: { pagination: { total_pages: 101 } } });
      if (page === 2) throw new Error('failed page');
      return response({ data: [{ page }] });
    });
    const all = await fetchAllBibles('https://base.test');
    expect(all[0]).toEqual({ page: 1 });
    expect(all.some(item => item.page === 2)).toBe(false);
    expect(all.some(item => item.page === 100)).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('builds structure only from mapped books covered by text filesets', () => {
    const info = { biblebrain: { textFilesets: [{ id: 'NT', type: 'text_plain', size: 'NT' }] } };
    buildStructureFromBooks(info, [
      { book_id: 'GEN', name: 'Genesis', chapters: [1] },
      { book_id: 'MAT', name: '', chapters: '1,2' },
      { book_id: 'BAD', name: 'Bad', chapters: [1] }
    ], id => ({ GEN: 'GN', MAT: 'MT' })[id]);
    expect(info.divisions).toEqual(['MT']);
    expect(info.sections).toEqual(['MT1', 'MT2']);
    expect(info.divisionNames[0]).toBeTruthy();
  });

  it('renders escaped chapter and verse markup with first-chapter titles only', () => {
    const base = {
      textid: 'WEB', sectionid: 'GN1', bookid: 'GN', chapter: 1,
      lang: 'eng', dir: 'ltr', title: 'Genesis & Start', previd: '', nextid: 'GN2'
    };
    const html = versesToHtml([{ verse_start: 1, verse_text: '<Beginning>' }], base);
    expect(html).toContain('Genesis &amp; Start');
    expect(html).toContain('&lt;Beginning&gt;');
    expect(html).toContain('data-id="GN1_1"');
    expect(versesToHtml([], { ...base, sectionid: 'GN2', chapter: 2 })).not.toContain('class="mt"');
  });
});

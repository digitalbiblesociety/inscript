import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  resolveIsoCandidates,
  pickCatalogEntry,
  normalizeTitle,
  primeDbsVideoCatalog,
  hasDbsVideoEdition,
  getDbsVideoChapter,
  getDbsVideoLanguages,
  getDbsVideoLanguageName
} from '@/media/DbsVideoApi.js';

describe('resolveIsoCandidates', () => {
  it('passes an ISO 639-3 code through', () => {
    expect(resolveIsoCandidates('eng')).toEqual(['eng']);
    expect(resolveIsoCandidates('cmn')).toEqual(['cmn']);
  });

  it('widens a 2-letter code to every 639-3 code it stands for', () => {
    // The catalog files Arabic and Chinese recordings under the individual
    // language (arb, cmn), not the macrolanguage, so both must be tried.
    expect(resolveIsoCandidates('ar')).toContain('arb');
    expect(resolveIsoCandidates('ar')).toContain('ara');
    expect(resolveIsoCandidates('zh')).toContain('cmn');
  });

  it('drops script and region suffixes', () => {
    expect(resolveIsoCandidates('eng-Latn-US')).toEqual(['eng']);
  });

  it('lowercases and tolerates empty input', () => {
    expect(resolveIsoCandidates('SPA')).toEqual(['spa']);
    expect(resolveIsoCandidates('')).toEqual([]);
    expect(resolveIsoCandidates(undefined)).toEqual([]);
  });
});

describe('pickCatalogEntry', () => {
  it('prefers the most complete edition', () => {
    // A sparse edition may not hold the chapter being asked for at all: the
    // Book of Genesis ships as 44 chapters in some languages and 3 in others.
    const entries = [
      { language: 'Ka', file: 'a.json', videoCount: 3 },
      { language: 'Kalanga Long Name', file: 'b.json', videoCount: 44 }
    ];
    expect(pickCatalogEntry(entries).file).toBe('b.json');
  });

  it('picks the plainest language name when editions are equally complete', () => {
    const entries = [
      { language: 'English North American Indigenous', file: 'eng_nai.json', videoCount: 62 },
      { language: 'English', file: 'eng_english.json', videoCount: 62 }
    ];
    expect(pickCatalogEntry(entries).file).toBe('eng_english.json');
  });

  it('is deterministic when names are the same length', () => {
    const entries = [
      { language: 'Bbb', file: 'b.json', videoCount: 62 },
      { language: 'Aaa', file: 'a.json', videoCount: 62 }
    ];
    expect(pickCatalogEntry(entries).file).toBe('a.json');
  });

  it('takes a full-film-only edition when that is all there is', () => {
    const entries = [{ language: 'Xyz', file: 'x.json', videoCount: 1 }];
    expect(pickCatalogEntry(entries).file).toBe('x.json');
  });

  it('returns null for no entries', () => {
    expect(pickCatalogEntry([])).toBeNull();
    expect(pickCatalogEntry(undefined)).toBeNull();
  });
});

describe('normalizeTitle', () => {
  const raw = {
    id: 'spa_spanish-castilian_jesus',
    iso: 'SPA',
    title: 'JESUS',
    title_vernacular: 'JESÚS',
    language: { name: 'Spanish Castilian' },
    sections: [{
      items: [
        {
          n: 2,
          title: 'Nacimiento de Jesús',
          reference: 'Lucas 1:1',
          description_short: 'Corto',
          description: 'Largo',
          cover: 'https://covers/jesus_chapter_02.jpg',
          duration_seconds: 223,
          media: {
            high: { url: 'https://video/high_02.mp4' },
            low: { url: 'https://video/low_02.mp4' }
          }
        },
        {
          n: 3,
          title: 'Sin video',
          reference: 'Lucas 2:21',
          media: {}
        }
      ]
    }]
  };

  it('keys chapters by number and prefers the vernacular title', () => {
    const title = normalizeTitle(raw);
    expect(title.title).toBe('JESÚS');
    expect(title.iso).toBe('spa');
    expect(title.languageName).toBe('Spanish Castilian');
    expect([...title.chapters.keys()]).toEqual([2]);
  });

  it('plays the standard-definition copy and keeps high as the retry', () => {
    const chapter = normalizeTitle(raw).chapters.get(2);
    expect(chapter.url).toBe('https://video/low_02.mp4');
    expect(chapter.urlAlt).toBe('https://video/high_02.mp4');
    expect(chapter.poster).toBe('https://covers/jesus_chapter_02.jpg');
    expect(chapter.title).toBe('Nacimiento de Jesús');
    expect(chapter.description).toBe('Corto');
    expect(chapter.duration).toBe(223);
  });

  it('skips chapters with no video at all', () => {
    expect(normalizeTitle(raw).chapters.has(3)).toBe(false);
  });

  it('keeps the first listing when sections repeat the same chapters', () => {
    // LUMO ships one section per audio translation, each numbered 1..n.
    const title = normalizeTitle({
      sections: [
        { title: 'New Living Translation', items: [{ n: 1, title: 'NLT cut', media: { low: { url: 'https://video/nlt_01.mp4' } } }] },
        { title: 'English Standard Version', items: [{ n: 1, title: 'ESV cut', media: { low: { url: 'https://video/esv_01.mp4' } } }] }
      ]
    });
    expect(title.chapters.size).toBe(1);
    expect(title.chapters.get(1).url).toBe('https://video/nlt_01.mp4');
    expect(title.chapters.get(1).title).toBe('NLT cut');
  });

  it('uses the only available quality without an alternate', () => {
    const title = normalizeTitle({
      sections: [{ items: [{ n: 1, media: { high: { url: 'https://video/high_01.mp4' } } }] }]
    });
    expect(title.chapters.get(1).url).toBe('https://video/high_01.mp4');
    expect(title.chapters.get(1).urlAlt).toBe('');
  });

  it('reads the legacy flat chapters shape', () => {
    const title = normalizeTitle({
      chapters: [{ chapter: 5, web_url: 'https://video/high_05.mp4', web_url_low: 'https://video/low_05.mp4' }]
    });
    expect(title.chapters.get(5).url).toBe('https://video/low_05.mp4');
    expect(title.chapters.get(5).urlAlt).toBe('https://video/high_05.mp4');
  });

  it('returns an empty chapter map for junk input', () => {
    expect(normalizeTitle(null).chapters.size).toBe(0);
    expect(normalizeTitle({}).chapters.size).toBe(0);
  });
});

/**
 * End to end over a stubbed catalog: one catalog fetch serves every title, a
 * language falls back to English, and titles that exist only in minority
 * languages are reported unavailable rather than offered and then failing.
 */
describe('catalog resolution', () => {
  const CATALOG = [
    { o: 'Lumo-Mark', i: 'eng', l: 'English-American', j: 'eng_mark.json', k: 32 },
    { o: 'Lumo-Mark', i: 'spa', l: 'Spanish', j: 'spa_mark.json', k: 48 },
    // Bible Slides ships in minority languages only: no English edition exists.
    { o: 'Bible_Slides', i: 'tac', l: 'Tarahumara Baja', j: 'tac_slides.json', k: 28 },
    { o: 'Jesus', i: 'eng', l: 'English', j: 'eng_jesus.json', k: 62 }
  ];

  const chapter = (n, url) => ({ n, title: `Chapter ${n}`, media: { low: { url } } });
  const TITLES = {
    'Lumo-Mark/eng_mark.json': { iso: 'eng', language: { name: 'English-American' }, sections: [{ items: [chapter(1, 'https://video/mark_eng_01.mp4')] }] },
    'Lumo-Mark/spa_mark.json': { iso: 'spa', language: { name: 'Spanish' }, sections: [{ items: [chapter(1, 'https://video/mark_spa_01.mp4')] }] },
    'Bible_Slides/tac_slides.json': { iso: 'tac', language: { name: 'Tarahumara Baja' }, sections: [{ items: [chapter(2, 'https://video/slides_tac_02.mp4')] }] },
    'Jesus/eng_jesus.json': { iso: 'eng', language: { name: 'English' }, sections: [{ items: [chapter(2, 'https://video/jesus_eng_02.mp4')] }] }
  };

  const fetched = [];
  const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

  beforeAll(async () => {
    vi.stubGlobal('fetch', (url) => {
      fetched.push(String(url));
      if (String(url).endsWith('video.json')) return json(CATALOG);
      const key = Object.keys(TITLES).find((k) => String(url).endsWith(k));
      return key ? json(TITLES[key]) : Promise.resolve({ ok: false, status: 404 });
    });
    await primeDbsVideoCatalog();
  });

  afterAll(() => vi.unstubAllGlobals());

  it('indexes every title from a single catalog fetch', () => {
    expect(fetched.filter((u) => u.endsWith('video.json'))).toHaveLength(1);
    expect(hasDbsVideoEdition('Lumo-Mark', 'eng')).toBe(true);
    expect(hasDbsVideoEdition('Jesus', 'eng')).toBe(true);
  });

  it('reports a title available when the reader\'s language has it', () => {
    expect(hasDbsVideoEdition('Lumo-Mark', 'spa')).toBe(true);
    expect(hasDbsVideoEdition('Bible_Slides', 'tac')).toBe(true);
  });

  it('reports a title available through the English fallback', () => {
    expect(hasDbsVideoEdition('Lumo-Mark', 'fra')).toBe(true);
  });

  it('reports a minority-language-only title unavailable to other readers', () => {
    expect(hasDbsVideoEdition('Bible_Slides', 'eng')).toBe(false);
    expect(hasDbsVideoEdition('Bible_Slides', 'spa')).toBe(false);
  });

  it('withholds the English fallback for a language the reader picked', () => {
    expect(hasDbsVideoEdition('Lumo-Mark', 'fra', { fallback: false })).toBe(false);
    expect(hasDbsVideoEdition('Lumo-Mark', 'spa', { fallback: false })).toBe(true);
  });

  it('reports an unknown title unavailable', () => {
    expect(hasDbsVideoEdition('Acts_VB', 'eng')).toBe(false);
    expect(hasDbsVideoEdition('', 'eng')).toBe(false);
  });

  it('plays the reader\'s own language', async () => {
    const found = await getDbsVideoChapter('Lumo-Mark', 'spa', 1);
    expect(found.url).toBe('https://video/mark_spa_01.mp4');
    expect(found.org).toBe('Lumo-Mark');
    expect(found.isFallback).toBe(false);
  });

  it('falls back to English and says so', async () => {
    const found = await getDbsVideoChapter('Lumo-Mark', 'fra', 1);
    expect(found.url).toBe('https://video/mark_eng_01.mp4');
    expect(found.isFallback).toBe(true);
    expect(found.languageName).toBe('English-American');
  });

  it('resolves a minority language with no English edition', async () => {
    const found = await getDbsVideoChapter('Bible_Slides', 'tac', 2);
    expect(found.url).toBe('https://video/slides_tac_02.mp4');
    expect(found.isFallback).toBe(false);
  });

  it('returns null for an unknown title, missing chapter or bad input', async () => {
    await expect(getDbsVideoChapter('Bible_Slides', 'eng', 2)).resolves.toBeNull();
    await expect(getDbsVideoChapter('Acts_VB', 'eng', 1)).resolves.toBeNull();
    await expect(getDbsVideoChapter('Jesus', 'eng', 99)).resolves.toBeNull();
    await expect(getDbsVideoChapter('', 'eng', 1)).resolves.toBeNull();
    await expect(getDbsVideoChapter('Jesus', 'eng', 'nope')).resolves.toBeNull();
  });

  it('fetches each title once and reuses it across languages', async () => {
    const before = fetched.length;
    await getDbsVideoChapter('Lumo-Mark', 'spa', 1);
    await getDbsVideoChapter('Lumo-Mark', 'spa', 1);
    expect(fetched.length).toBe(before);
  });

  describe('getDbsVideoLanguages', () => {
    it('lists only the languages the given titles come in', () => {
      // Nothing on this chapter is in Tarahumara Baja, so offering it would
      // leave the reader with an empty chapter.
      const languages = getDbsVideoLanguages(['Lumo-Mark']);
      expect(languages.map((language) => language.iso)).toEqual(['eng', 'spa']);
    });

    it('counts how many of those titles each language has', () => {
      const languages = getDbsVideoLanguages(['Lumo-Mark', 'Jesus']);
      expect(languages.find((language) => language.iso === 'eng').titles).toBe(2);
      expect(languages.find((language) => language.iso === 'spa').titles).toBe(1);
    });

    it('covers every title when no titles are named', () => {
      expect(getDbsVideoLanguages().map((language) => language.iso))
        .toEqual(['eng', 'spa', 'tac']);
    });

    it('offers nothing for an empty list of titles', () => {
      // A chapter with no video is not a chapter with every language: the
      // picker has nothing to offer there and hides itself.
      expect(getDbsVideoLanguages([])).toEqual([]);
    });

    it('sorts by display name, not by code', () => {
      // 'tac' has no name of its own on this platform, so the catalog names it
      const names = getDbsVideoLanguages().map((language) => language.name);
      expect(names).toEqual(['English', 'Spanish', 'Tarahumara Baja']);
    });

    it('ignores unknown titles', () => {
      expect(getDbsVideoLanguages(['Acts_VB'])).toEqual([]);
    });
  });

  describe('getDbsVideoLanguageName', () => {
    it('names a language the way the reader\'s own locale does', () => {
      expect(getDbsVideoLanguageName('spa')).toBe('Spanish');
      expect(getDbsVideoLanguageName('spa', 'es')).toBe('español');
    });

    it('falls back to the catalog for a language the platform cannot name', () => {
      // Two thirds of the catalog's 2,600 languages are in this position
      expect(getDbsVideoLanguageName('tac')).toBe('Tarahumara Baja');
    });

    it('returns the code when nothing names it', () => {
      expect(getDbsVideoLanguageName('zzz')).toBe('zzz');
      expect(getDbsVideoLanguageName('')).toBe('');
    });
  });
});

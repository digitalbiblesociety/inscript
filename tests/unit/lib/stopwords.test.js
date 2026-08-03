import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadStopwords, normalizeLang, tokenizeWords, wordKey } from '@lib/stopwords.js';
import engWords from '../../../browserbible/public/content/stopwords/eng.json';

describe('tokenizeWords', () => {
  it('splits on whitespace runs including newlines and tabs', () => {
    expect(tokenizeWords('In  the\nbeginning\tGod created')).toEqual(
      ['In', 'the', 'beginning', 'God', 'created']
    );
  });

  it('strips punctuation attached to words', () => {
    expect(tokenizeWords('earth. And God said, "Let there be light!"')).toEqual(
      ['earth', 'And', 'God', 'said', 'Let', 'there', 'be', 'light']
    );
  });

  it('strips trailing possessives with straight and curly apostrophes', () => {
    expect(tokenizeWords("God's word")).toEqual(['God', 'word']);
    expect(tokenizeWords('God’s word')).toEqual(['God', 'word']);
    expect(tokenizeWords("GOD'S")).toEqual(['GOD']);
  });

  it('keeps non-possessive internal apostrophes', () => {
    expect(tokenizeWords("didn't o'clock")).toEqual(["didn't", "o'clock"]);
  });

  it('splits hyphenated words', () => {
    expect(tokenizeWords('Baal-zephon')).toEqual(['Baal', 'zephon']);
  });

  it('keeps accented and non-ASCII letters', () => {
    expect(tokenizeWords('Él creó los cielos')).toEqual(['Él', 'creó', 'los', 'cielos']);
  });

  it('keeps combining marks intact (Devanagari, Arabic)', () => {
    expect(tokenizeWords('परमेश्वर ने कहा', 'hin')).toEqual(['परमेश्वर', 'ने', 'कहा']);
  });

  it('splits French elisions on apostrophes but keeps English contractions', () => {
    expect(tokenizeWords("l'Éternel qu'il m'a dit", 'fra')).toEqual(['l', 'Éternel', 'qu', 'il', 'm', 'a', 'dit']);
    expect(tokenizeWords("didn't", 'eng')).toEqual(["didn't"]);
    expect(tokenizeWords("didn't")).toEqual(["didn't"]);
  });

  it('segments spaceless languages via Intl.Segmenter', () => {
    const jpn = tokenizeWords('初めに言があった。', 'jpn');
    expect(jpn).toContain('言');
    expect(jpn).not.toContain('。');
    const zho = tokenizeWords('太初有道，道與神同在。', 'zho');
    expect(zho).toContain('神');
    expect(zho).not.toContain('，');
  });

  it('returns an empty array for empty or nullish input', () => {
    expect(tokenizeWords('')).toEqual([]);
    expect(tokenizeWords('  . , !  ')).toEqual([]);
    expect(tokenizeWords(null)).toEqual([]);
    expect(tokenizeWords(undefined)).toEqual([]);
  });
});

describe('wordKey', () => {
  it('lowercases and normalizes curly apostrophes', () => {
    expect(wordKey('Don’t')).toBe("don't");
    expect(wordKey('LORD')).toBe('lord');
  });
});

describe('normalizeLang', () => {
  it('passes through ISO 639-3 codes and strips suffixes', () => {
    expect(normalizeLang('eng')).toBe('eng');
    expect(normalizeLang('eng-Latn-US')).toBe('eng');
    expect(normalizeLang('grc')).toBe('grc');
  });

  it('maps 2-letter and macrolanguage aliases', () => {
    expect(normalizeLang('en')).toBe('eng');
    expect(normalizeLang('EN-US')).toBe('eng');
    expect(normalizeLang('es')).toBe('spa');
    expect(normalizeLang('pt')).toBe('por');
    expect(normalizeLang('fr-FR')).toBe('fra');
    expect(normalizeLang('hi')).toBe('hin');
    expect(normalizeLang('ar')).toBe('ara');
    expect(normalizeLang('arb')).toBe('ara');
    expect(normalizeLang('ja')).toBe('jpn');
    expect(normalizeLang('ko')).toBe('kor');
    expect(normalizeLang('zh')).toBe('zho');
    expect(normalizeLang('cmn')).toBe('zho');
  });

  it('rejects missing or malformed codes', () => {
    expect(normalizeLang('')).toBeUndefined();
    expect(normalizeLang(null)).toBeUndefined();
    expect(normalizeLang('not a lang')).toBeUndefined();
  });
});

describe('loadStopwords', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the per-language JSON and returns a Set, sharing one fetch per language', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ['foo', 'bar'] }));
    vi.stubGlobal('fetch', fetchMock);

    const [a, b, c] = await Promise.all([
      loadStopwords('xx'), loadStopwords('xx-Latn'), loadStopwords('XX')
    ]);
    expect(a).toBeInstanceOf(Set);
    expect(a.has('foo')).toBe(true);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('content/stopwords/xx.json');
  });

  it('resolves undefined for missing languages, fetch errors, and bad payloads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await loadStopwords('yy')).toBeUndefined();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await loadStopwords('zz')).toBeUndefined();

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ not: 'an array' }) })));
    expect(await loadStopwords('zza')).toBeUndefined();

    expect(await loadStopwords('')).toBeUndefined();
    expect(await loadStopwords(null)).toBeUndefined();
  });
});

describe('eng.json word list', () => {
  const eng = new Set(engWords);

  it('includes modern English function words', () => {
    for (const word of ['the', 'and', 'of', 'was', 'were', 'him', 'you', 'your', 'is', 'are', 'this', 'which', 'who', 'shall', 'will', 'not', "don't", 'said', 'came', 'went']) {
      expect(eng.has(word), word).toBe(true);
    }
  });

  it('includes archaic KJV-era forms', () => {
    for (const word of ['thou', 'thee', 'thy', 'thine', 'ye', 'hath', 'doth', 'shalt', 'wilt', 'saith', 'spake', 'wherefore', 'thereof', 'peradventure', 'howbeit']) {
      expect(eng.has(word), word).toBe(true);
    }
  });

  it('keeps distinctive frequent words visible', () => {
    for (const word of ['god', 'lord', 'jesus', 'king', 'verily', 'behold', 'amen', 'day', 'man', 'love', 'light']) {
      expect(eng.has(word), word).toBe(false);
    }
  });

  it('has roughly 600 unique entries, all in canonical key form', () => {
    expect(eng.size).toBe(engWords.length);
    expect(eng.size).toBeGreaterThan(500);
    for (const word of eng) {
      expect(word, word).toBe(wordKey(word));
    }
  });
});

describe('all language word lists', () => {
  const dir = new URL('../../../browserbible/public/content/stopwords/', import.meta.url);

  it.each(['eng', 'spa', 'por', 'fra', 'hin', 'ara', 'jpn', 'kor', 'zho'])(
    '%s.json is a non-empty array of unique canonical entries',
    async (code) => {
      const { readFile } = await import('node:fs/promises');
      const words = JSON.parse(await readFile(new URL(`${code}.json`, dir), 'utf8'));
      expect(Array.isArray(words)).toBe(true);
      expect(words.length).toBeGreaterThan(50);
      expect(new Set(words).size).toBe(words.length);
      for (const word of words) {
        expect(word, word).toBe(wordKey(word));
      }
    }
  );

  it('filters John 1:1 down to content words in each language', async () => {
    const { readFile } = await import('node:fs/promises');
    const samples = {
      spa: ['En el principio era el Verbo, y el Verbo era con Dios.', ['verbo', 'dios', 'principio']],
      por: ['No princípio era o Verbo, e o Verbo estava com Deus.', ['verbo', 'deus', 'princípio']],
      fra: ["Au commencement était la Parole, et la Parole était avec Dieu; c'est l'Éternel.", ['parole', 'dieu', 'éternel']],
      hin: ['आदि में वचन था, और वचन परमेश्वर के साथ था।', ['वचन', 'परमेश्वर']],
      ara: ['في البدء كان الكلمة والكلمة كان عند الله.', ['الكلمة', 'الله']],
      jpn: ['初めに言があった。言は神と共にあった。', ['言', '神']],
      kor: ['태초에 말씀이 계시니라 이 말씀이 하나님과 함께 계셨으니', ['말씀이', '하나님과']],
      zho: ['太初有道，道與神同在，道就是神。', ['道', '神']]
    };
    for (const [code, [text, keep]] of Object.entries(samples)) {
      const stopwords = new Set(JSON.parse(await readFile(new URL(`${code}.json`, dir), 'utf8')));
      const survivors = tokenizeWords(text, code).map(wordKey).filter((k) => !stopwords.has(k));
      for (const k of keep) {
        expect(survivors, `${code}: ${k}`).toContain(wordKey(k));
      }
    }
  });
});

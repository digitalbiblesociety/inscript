import { describe, it, expect, vi, beforeAll } from 'vitest';

// Local (already-loaded) texts the provider must dedupe against. Mutated by the
// provider (hasAudio), so rebuilt fresh in beforeAll.
let localTexts;
let config;

vi.mock('@/core/config.js', () => ({ getConfig: () => config }));
vi.mock('@texts/TextLoader.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getTextInfoData: () => localTexts
}));
// Stand-in alias map, so the test doesn't track edits to the curated one.
vi.mock('@/data/biblebrainAliases.js', () => {
  const aliases = {
    ENGESV: 'ESV',      // target loads after this provider (ESV API)
    EN1ESV: 'ESV',      // second recording of the same text
    ENGCSB: 'CSB',      // audio-only entry, target from API.Bible
    ENGWWH: 'ENGWEB',   // second recording of a local text
    ENGNAS: 'ENGNASB',  // text-only duplicate of a local text
    ENGNLH: 'NEWNEW'    // alias onto a Bible Brain text we keep
  };
  // BLOKTX shares a code with a local text but is a different work; BLOKAU
  // shares one and its audio can never play.
  const blocked = new Set(['BLOKTX', 'BLOKAU']);
  return {
    aliasTargetFor: (abbr) => aliases[String(abbr ?? '').toUpperCase()] ?? null,
    isPairingBlocked: (abbr) => blocked.has(String(abbr ?? '').toUpperCase())
  };
});

const textFileset = (id) => ({ id, type: 'text_plain', size: 'C' });
const audioFileset = (id) => ({ id, type: 'audio', size: 'NT' });

const catalogEntries = [
  // Duplicates a local text and carries audio: no picker entry, audio paired.
  {
    abbr: 'ENGKJV', name: 'King James Version', vname: 'KJV', language: 'English', iso: 'eng',
    filesets: { 'dbp-prod': [textFileset('ENGKJVO_ET'), audioFileset('ENGKJVN1DA')] }
  },
  // Audio-only entry matching a local text: audio paired, nothing added.
  {
    abbr: 'ABIWBT', name: 'Abidji NT', iso: 'abi',
    filesets: { 'dbp-prod': [audioFileset('ABIWBTN1DA')] }
  },
  // Text-only duplicate: dropped, and no association registered.
  {
    abbr: 'TXTONL', name: 'Text Only Duplicate', vname: 'Text Only', iso: 'txt',
    filesets: { 'dbp-prod': [textFileset('TXTONLN_ET')] }
  },
  // Net-new text: becomes a Bible Brain picker entry.
  {
    abbr: 'NEWNEW', name: 'Net New Bible', vname: 'Net New', language: 'Newish', iso: 'new',
    filesets: { 'dbp-prod': [textFileset('NEWNEWN_ET'), audioFileset('NEWNEWN1DA')] }
  },
  // Audio-only with no matching local text: nothing to pair it to, dropped.
  {
    abbr: 'AUDONL', name: 'Audio Only', iso: 'aud',
    filesets: { 'dbp-prod': [audioFileset('AUDONLN2DA')] }
  },
  // Curated exclude id without a local match: dropped.
  {
    abbr: 'EXCLME', name: 'Excluded Bible', vname: 'Excluded', iso: 'exc',
    filesets: { 'dbp-prod': [textFileset('EXCLMEN_ET')] }
  },
  // Aliased to a text served by a provider that loads later (esv:ESV).
  {
    abbr: 'ENGESV', name: 'English Standard Version', vname: 'ESV', language: 'English', iso: 'eng',
    filesets: { 'dbp-prod': [textFileset('ENGESVN_ET'), audioFileset('ENGESVN1DA')] }
  },
  // A second recording of the same aliased text: merges into one association.
  {
    abbr: 'EN1ESV', name: 'ESV Hear the Word', iso: 'eng',
    filesets: { 'dbp-prod': [textFileset('ENGESHN_ET'), audioFileset('ENGESHN1DA')] }
  },
  // Audio-only alias: the target text comes from API.Bible.
  {
    abbr: 'ENGCSB', name: 'Christian Standard Bible', iso: 'eng',
    filesets: { 'dbp-prod': [audioFileset('ENGCSBN1DA')] }
  },
  // Aliased onto a local text that also has its own Bible Brain entry.
  {
    abbr: 'ENGWWH', name: 'World English Bible - Winfred Henson', iso: 'eng',
    filesets: { 'dbp-prod': [textFileset('ENGWWHN_ET'), audioFileset('EN1WEBN2DA')] }
  },
  {
    abbr: 'ENGWEB', name: 'World English Bible', vname: 'WEB', language: 'English', iso: 'eng',
    filesets: { 'dbp-prod': [textFileset('ENGWEBN_ET'), audioFileset('ENGWEBN2DA')] }
  },
  // Text-only alias: dropped with nothing to pair.
  {
    abbr: 'ENGNAS', name: 'New American Standard Bible', iso: 'eng',
    filesets: { 'dbp-prod': [textFileset('ENGNASN_ET')] }
  },
  // Alias whose target is a Bible Brain text we keep (NEWNEW).
  {
    abbr: 'ENGNLH', name: 'Another Recording', iso: 'new',
    filesets: { 'dbp-prod': [textFileset('ENGNLHN_ET'), audioFileset('ENGNLHN1DA')] }
  },
  // Blocked despite matching a local text by code: carries text, so it must
  // come back as its own picker entry rather than pairing its audio.
  {
    abbr: 'BLOKTX', name: 'Different Work Same Code', vname: 'Different Work',
    language: 'Blocked', iso: 'blk',
    filesets: { 'dbp-prod': [textFileset('BLOKTXN_ET'), audioFileset('BLOKTXN1DA')] }
  },
  // Blocked and text-free: nothing to show and nothing to pair, so it vanishes.
  {
    abbr: 'BLOKAU', name: 'Unplayable Audio Same Code', iso: 'blk',
    filesets: { 'dbp-prod': [audioFileset('BLOKAUN1DA')] }
  }
];

describe('BibleBrainTextProvider.getTextManifest dedup + audio pairing', () => {
  let manifest;
  let linkedAudioFor;

  beforeAll(async () => {
    localTexts = [
      { id: 'ENGKJV', abbr: 'KJV', lang: 'eng', name: 'KJV', nameEnglish: 'King James Version', hasAudio: false },
      { id: 'ABIWBT', abbr: 'ABIWBT', lang: 'abi', name: 'Abidji NT', hasAudio: false },
      { id: 'TXTONL', abbr: 'TXTONL', lang: 'txt', name: 'Text Only Local', hasAudio: false },
      { id: 'ENGWEB', abbr: 'ENGWEB', lang: 'eng', name: 'World English Bible', hasAudio: false },
      { id: 'BLOKTX', abbr: 'BLOKTX', lang: 'blk', name: 'Our Blocked-Code Text', hasAudio: false },
      { id: 'BLOKAU', abbr: 'BLOKAU', lang: 'blk', name: 'Our Other Blocked Text', hasAudio: false }
    ];
    config = {
      enableOnlineSources: true,
      bibleBrainEnabled: true,
      bibleBrainProxyBase: 'https://proxy.test/fcbh/v4',
      bibleBrainLanguages: [],
      bibleBrainExcludeIds: ['EXCLME']
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: catalogEntries, meta: { total: catalogEntries.length } })
    })));

    const { BibleBrainTextProvider } = await import('@texts/BibleBrainTextProvider.js');
    manifest = await new Promise(resolve => {
      BibleBrainTextProvider.getTextManifest(resolve);
    });
    ({ linkedAudioFor } = await import('@/data/biblebrainDuplicates.js'));

    vi.unstubAllGlobals();
  });

  it('adds only net-new texts, dropping duplicates, aliases and curated excludes', () => {
    expect(manifest.map(t => t.id)).toEqual(['NEWNEW', 'BLOKTX']);
  });

  it('never pairs a blocklisted id, even when the code matches one of our texts', () => {
    expect(linkedAudioFor({ id: 'BLOKTX' })).toBeNull();
    expect(linkedAudioFor({ id: 'BLOKAU' })).toBeNull();
    expect(localTexts.find(t => t.id === 'BLOKTX').hasAudio).toBe(false);
    expect(localTexts.find(t => t.id === 'BLOKAU').hasAudio).toBe(false);
  });

  it('returns a blocked entry to the picker when it carries readable text', () => {
    // It is a different work from our same-code text, so it belongs in the list.
    const blocked = manifest.find(t => t.abbr === 'BLOKTX');
    expect(blocked.biblebrain.audioFilesets.map(f => f.id)).toEqual(['BLOKTXN1DA']);
  });

  it('drops a blocked entry that has no readable text of its own', () => {
    expect(manifest.some(t => t.abbr === 'BLOKAU')).toBe(false);
  });

  it('pairs duplicate-entry audio to the existing text', () => {
    const assoc = linkedAudioFor(localTexts[0]);
    expect(assoc.inscriptId).toBe('ENGKJV');
    expect(assoc.audioFilesets).toEqual([{ id: 'ENGKJVN1DA', type: 'audio', size: 'NT' }]);
    expect(localTexts[0].hasAudio).toBe(true);
  });

  it('pairs audio-only entries to the existing text', () => {
    expect(linkedAudioFor(localTexts[1])?.audioFilesets)
      .toEqual([{ id: 'ABIWBTN1DA', type: 'audio', size: 'NT' }]);
    expect(localTexts[1].hasAudio).toBe(true);
  });

  it('registers nothing for a text-only duplicate', () => {
    expect(linkedAudioFor(localTexts[2])).toBeNull();
    expect(localTexts[2].hasAudio).toBe(false);
  });

  it('pairs an aliased entry to a text that has not loaded yet', () => {
    const assoc = linkedAudioFor({ id: 'ESV' });
    expect(assoc.inscriptId).toBe('ESV');
    expect(assoc.bibleBrainIds).toEqual(['ENGESV', 'EN1ESV']);
  });

  it('merges every recording of one aliased text into a single association', () => {
    expect(linkedAudioFor({ id: 'ESV' }).audioFilesets.map(f => f.id))
      .toEqual(['ENGESVN1DA', 'ENGESHN1DA']);
  });

  it('pairs an audio-only alias to its target text', () => {
    expect(linkedAudioFor({ id: 'CSB' })?.audioFilesets.map(f => f.id)).toEqual(['ENGCSBN1DA']);
  });

  it('merges an alias with the target text own same-code entry', () => {
    // ENGWEB matches by code, ENGWWH by alias: one association, both recordings.
    const assoc = linkedAudioFor(localTexts[3]);
    expect(assoc.audioFilesets.map(f => f.id)).toEqual(['EN1WEBN2DA', 'ENGWEBN2DA']);
    expect(localTexts[3].hasAudio).toBe(true);
  });

  it('registers no association for a text-only alias', () => {
    expect(linkedAudioFor({ id: 'ENGNASB' })).toBeNull();
  });

  it('folds an alias onto a kept Bible Brain text into that text own filesets', () => {
    // Bible Brain audio answers before linked audio for its own texts, so the
    // filesets have to land on the entry itself.
    const kept = manifest.find(t => t.id === 'NEWNEW');
    expect(kept.biblebrain.audioFilesets.map(f => f.id)).toEqual(['NEWNEWN1DA', 'ENGNLHN1DA']);
    expect(kept.hasAudio).toBe(true);
    expect(linkedAudioFor({ id: 'NEWNEW' })).toBeNull();
  });
});

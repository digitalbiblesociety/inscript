import { describe, it, expect } from 'vitest';
import { resolveUpstream, matchOrigin } from '../src/routes.js';

const NIV = '78a9f6124f344018-01';
const CSB = 'a556c5305ee15c3f-01';
const IDS = { apiBibleIds: [NIV, CSB] };

describe('resolveUpstream', () => {
  it('maps /abs/v1 API.Bible paths onto api.scripture.api.bible', () => {
    const route = resolveUpstream(`/abs/v1/bibles/${NIV}/chapters/JHN.3`, '?content-type=json', IDS);
    expect(route).toEqual({
      service: 'apibible',
      url: `https://api.scripture.api.bible/v1/bibles/${NIV}/chapters/JHN.3?content-type=json`
    });
  });

  it('also accepts the bare /v1 prefix used by local dev', () => {
    const route = resolveUpstream(`/v1/bibles/${NIV}/books`, '?include-chapters=true', IDS);
    expect(route.service).toBe('apibible');
    expect(route.url).toBe(`https://api.scripture.api.bible/v1/bibles/${NIV}/books?include-chapters=true`);
  });

  it('refuses API.Bible ids outside the allowlist', () => {
    expect(resolveUpstream('/abs/v1/bibles/some-other-bible-01/chapters/JHN.3', '', IDS))
      .toEqual({ error: 'forbidden' });
  });

  it('refuses API.Bible paths that are not under /bibles/{id}', () => {
    expect(resolveUpstream('/abs/v1/bibles', '', IDS)).toEqual({ error: 'forbidden' });
    expect(resolveUpstream('/abs/v1/audio-bibles', '', IDS)).toEqual({ error: 'forbidden' });
  });

  it('allows any bible id when the allowlist is empty', () => {
    const route = resolveUpstream('/abs/v1/bibles/anything-01/books', '', { apiBibleIds: [] });
    expect(route.service).toBe('apibible');
  });

  it('maps /fcbh/v4 paths onto 4.dbt.io', () => {
    const route = resolveUpstream('/fcbh/v4/bibles/filesets/ENGESVN2DA/JHN/3', '');
    expect(route).toEqual({
      service: 'fcbh',
      url: 'https://4.dbt.io/api/bibles/filesets/ENGESVN2DA/JHN/3'
    });
  });

  it('maps the two ESV endpoints onto api.esv.org', () => {
    expect(resolveUpstream('/esv/v3/passage/html/', '?q=John+3')).toEqual({
      service: 'esv',
      url: 'https://api.esv.org/v3/passage/html/?q=John+3'
    });
    expect(resolveUpstream('/esv/v3/passage/search/', '?q=love').service).toBe('esv');
  });

  it('refuses other ESV endpoints', () => {
    expect(resolveUpstream('/esv/v3/passage/text/', '?q=John+3')).toEqual({ error: 'forbidden' });
    expect(resolveUpstream('/esv/v3/passage/audio/', '')).toEqual({ error: 'forbidden' });
  });

  it('returns null for unknown paths', () => {
    expect(resolveUpstream('/nope', '')).toBeNull();
    expect(resolveUpstream('/', '')).toBeNull();
  });
});

describe('matchOrigin', () => {
  const LIST = 'https://inscript.org,https://*.inscript.pages.dev,http://localhost:3000';

  it('matches exact origins', () => {
    expect(matchOrigin('https://inscript.org', LIST)).toBe('https://inscript.org');
    expect(matchOrigin('http://localhost:3000', LIST)).toBe('http://localhost:3000');
  });

  it('matches wildcard subdomains with the right scheme', () => {
    expect(matchOrigin('https://my-branch.inscript.pages.dev', LIST))
      .toBe('https://my-branch.inscript.pages.dev');
    expect(matchOrigin('http://evil.inscript.pages.dev', LIST)).toBeNull();
  });

  it('rejects everything else', () => {
    expect(matchOrigin('https://evil.example.com', LIST)).toBeNull();
    expect(matchOrigin('https://inscript.org.evil.com', LIST)).toBeNull();
    expect(matchOrigin('https://notinscript.pages.dev', LIST)).toBeNull();
    expect(matchOrigin(null, LIST)).toBeNull();
  });
});

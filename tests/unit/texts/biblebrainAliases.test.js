import { describe, it, expect } from 'vitest';
import { aliasTargetFor, isPairingBlocked } from '@/data/biblebrainAliases.js';

// Guards on the curated data itself: these are hand-maintained files, so the
// tests state the invariants an edit must not break.

describe('bibleBrainTextAliases', () => {
  it('maps the Bible Brain ESV codes onto the ESV API text', () => {
    for (const abbr of ['ENGESV', 'EN1ESV', 'ENGGID']) {
      expect(aliasTargetFor(abbr)).toBe('ESV');
    }
  });

  it('maps the Bible Brain NLT and CSB codes onto their API.Bible texts', () => {
    expect(aliasTargetFor('ENGNLT')).toBe('NLT');
    expect(aliasTargetFor('ENGNLH')).toBe('NLT');
    expect(aliasTargetFor('ENGCSB')).toBe('CSB');
  });

  it('is case-insensitive and returns null for anything unmapped', () => {
    expect(aliasTargetFor('engesv')).toBe('ESV');
    expect(aliasTargetFor('ENGNKJV')).toBeNull();
    expect(aliasTargetFor(undefined)).toBeNull();
    expect(aliasTargetFor(null)).toBeNull();
  });
});

describe('bibleBrainPairingBlocklist', () => {
  // Each of these plays audio from a different translation, or advertises audio
  // that no chapter can play. Removing one silently reintroduces that defect.
  const blocked = ['MAMSBG', 'MALNIB', 'HEBM95', 'AVAIBT', 'RMYPBT', 'MEYPBT'];

  it.each(blocked)('keeps %s blocked from same-code pairing', (abbr) => {
    expect(isPairingBlocked(abbr)).toBe(true);
  });

  it('is case-insensitive and leaves every other id pairable', () => {
    expect(isPairingBlocked('mamsbg')).toBe(true);
    expect(isPairingBlocked('ENGKJV')).toBe(false);
    expect(isPairingBlocked(undefined)).toBe(false);
    expect(isPairingBlocked(null)).toBe(false);
  });

  it('never blocks and aliases the same id, which would be contradictory', () => {
    for (const abbr of blocked) {
      expect(aliasTargetFor(abbr)).toBeNull();
    }
  });
});

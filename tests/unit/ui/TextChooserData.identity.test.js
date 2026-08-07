import { describe, expect, it, vi } from 'vitest';

vi.mock('@core/config.js', () => ({ getConfig: () => ({}) }));
vi.mock('@lib/i18n.js', () => ({ t: () => 'Recently Used' }));

import { buildPinnedTop } from '@ui/TextChooserData.js';

describe('TextChooserData provider identity', () => {
  const one = {
    id: 'ESV', providerid: 'one:ESV', providerName: 'one',
    type: 'bible', name: 'ESV One', lang: 'eng', langNameEnglish: 'English'
  };
  const two = {
    id: 'ESV', providerid: 'two:ESV', providerName: 'two',
    type: 'bible', name: 'ESV Two', lang: 'eng', langNameEnglish: 'English'
  };

  const controller = (recent) => ({
    textType: 'bible',
    langFilter: 'eng',
    recentlyUsed: { recent },
    groupedCache: { filteredArray: [one, two] }
  });

  it('restores the exact provider-qualified recent text', () => {
    const items = buildPinnedTop(controller(['two:ESV']));
    expect(items).toHaveLength(2);
    expect(items[1].data).toBe(two);
  });

  it('keeps legacy bare recent ids readable', () => {
    const items = buildPinnedTop(controller(['ESV']));
    expect(items[1].data).toBe(one);
  });
});

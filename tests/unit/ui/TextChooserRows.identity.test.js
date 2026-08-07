import { describe, expect, it, vi } from 'vitest';

vi.mock('@texts/TextLoader.js', () => ({
  displayAbbr: (text) => text.abbr,
  getTextIdentity: (text) => text?.providerid ?? text?.id ?? ''
}));

import { renderVisible } from '@ui/TextChooserRows.js';

describe('TextChooserRows provider identity', () => {
  it('renders provider-qualified row ids and selects only the exact provider', () => {
    const main = document.createElement('div');
    Object.defineProperty(main, 'clientHeight', { value: 64 });
    const scrollContent = document.createElement('div');
    const texts = [
      { id: 'ESV', providerid: 'one:ESV', abbr: 'ESV 1', name: 'First' },
      { id: 'ESV', providerid: 'two:ESV', abbr: 'ESV 2', name: 'Second' }
    ];
    const controller = {
      refs: { main, scrollContent },
      processedData: texts.map((data) => ({ type: 'text', data })),
      filteredIndices: [0, 1],
      selectedTextInfo: texts[1],
      filterTokens: [],
      scrollTop: 0
    };

    renderVisible(controller);

    const rows = [...scrollContent.querySelectorAll('.text-chooser-row')];
    expect(rows.map((row) => row.dataset.id)).toEqual(['one:ESV', 'two:ESV']);
    expect(rows.map((row) => row.classList.contains('selected'))).toEqual([false, true]);
  });
});

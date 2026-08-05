import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApp } from '../../../browserbible/js/core/registry.js';
import { SearchWindow, getOpenBibleTextId } from '../../../browserbible/js/windows/SearchWindow.js';

const proto = SearchWindow.prototype;

function formatResultLabel(fragmentid, short, textInfo = { type: 'bible', lang: 'eng' }) {
  return proto.formatResultLabel.call({ state: { textInfo } }, fragmentid, short);
}

describe('SearchWindow result labels', () => {
  it('formats a single verse as a compact chapter and verse', () => {
    expect(formatResultLabel('JN3_16', true)).toBe('3:16');
  });

  it('formats same-chapter and cross-chapter ranges', () => {
    expect(formatResultLabel('John 3:16-18', true)).toBe('3:16-18');
    expect(formatResultLabel('John 3:16-4:2', true)).toBe('3:16-4:2');
    expect(formatResultLabel('John 3-4', true)).toBe('3-4');
  });

  it('uses the full reference when a compact label is not requested', () => {
    expect(formatResultLabel('JN3_16', false)).toBe('John 3:16');
  });

  it('leaves invalid and non-Bible fragment IDs unchanged', () => {
    expect(formatResultLabel('not-a-reference', true)).toBe('not-a-reference');
    expect(formatResultLabel('section-1', true, { type: 'book', lang: 'eng' })).toBe('section-1');
  });
});

describe('SearchWindow initial text selection', () => {
  afterEach(() => setApp(null));

  it('uses the leftmost open Bible window text', () => {
    setApp({
      windowManager: {
        getWindows: () => [
          { className: 'NotesWindow' },
          { className: 'BibleWindow', getData: () => ({ textid: 'eng-KJV' }) },
          { className: 'BibleWindow', getData: () => ({ textid: 'eng-ESV' }) }
        ]
      }
    });

    expect(getOpenBibleTextId()).toBe('eng-KJV');
  });

  it('loads the first available text when no initial text can be resolved', async () => {
    const context = {
      initData: {},
      loadFirstAvailableText: vi.fn()
    };

    await proto.loadInitialText.call(context);

    expect(context.loadFirstAvailableText).toHaveBeenCalledOnce();
  });
});

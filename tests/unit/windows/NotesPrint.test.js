import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadSection: vi.fn(),
  showNotice: vi.fn()
}));

vi.mock('@texts/TextLoader.js', () => ({ loadSection: mocks.loadSection }));
vi.mock('@windows/NotesWindow/notice.js', () => ({ showNotice: mocks.showNotice }));

import { printNotes } from '@windows/NotesWindow/print.js';

function popup() {
  return {
    document: { body: { textContent: '' } },
    close: vi.fn(),
    location: ''
  };
}

function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

describe('notes printing', () => {
  let printWindow;
  let blob;

  beforeEach(() => {
    vi.clearAllMocks();
    printWindow = popup();
    vi.spyOn(window, 'open').mockReturnValue(printWindow);
    URL.createObjectURL = vi.fn(value => {
      blob = value;
      return 'blob:notes-print';
    });
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows notices for an empty request or a blocked popup', async () => {
    await printNotes([]);
    expect(mocks.showNotice).toHaveBeenCalledWith('windows.notes.noNotesToPrint');

    window.open.mockReturnValueOnce(null);
    await printNotes([{ title: 'Note' }]);
    expect(mocks.showNotice).toHaveBeenCalledWith('windows.notes.popupBlocked');
  });

  it('builds a sanitized print document with title and metadata', async () => {
    await printNotes([{
      title: '<My note>',
      content: '<p onclick="bad()">Safe</p><script>bad()</script>',
      referenceDisplay: 'John 3:16',
      modified: 0
    }], { title: 'Notes & study' });

    expect(printWindow.document.body.textContent).toBe('windows.notes.preparingPrint');
    expect(printWindow.location).toBe('blob:notes-print');
    const html = await readBlob(blob);
    expect(html).toContain('<title>Notes &amp; study</title>');
    expect(html).toContain('&lt;My note&gt;');
    expect(html).toContain('<p>Safe</p>');
    expect(html).not.toContain('<p onclick');
    expect(html).not.toContain('bad()');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('inlines a detected verse range and removes verse furniture', async () => {
    mocks.loadSection.mockImplementation((textid, sectionid, success) => {
      expect(textid).toBe('WEB');
      expect(sectionid).toBe('JN3');
      const section = document.createElement('div');
      section.innerHTML = `
        <span data-id="JN3_16"><span class="v-num">16</span>For God loved<span class="note">footnote</span></span>
        <span class="JN3_17"><span class="verse-num">17</span>God sent his Son</span>`;
      success(section);
    });

    await printNotes([{
      title: 'Gospel',
      content: '<p>Read John 3:16-17.</p>',
      modified: 0
    }], { includeVerseText: true, textId: 'WEB' });

    const html = await readBlob(blob);
    expect(html).toContain('John 3:16-17');
    expect(html).toContain('16 For God loved 17 God sent his Son');
    expect(html).not.toContain('footnote');
  });

  it('inlines a whole chapter after stripping notes and verse numbers', async () => {
    mocks.loadSection.mockImplementation((textid, sectionid, success) => {
      const section = document.createElement('div');
      section.innerHTML = '<span class="v-num">1</span>Chapter text<span class="cf">crossref</span>';
      success(section);
    });
    await printNotes([{
      title: 'Chapter',
      content: '<p>Read Psalm 23.</p>',
      modified: 0
    }], { includeVerseText: true, textId: 'WEB' });

    const html = await readBlob(blob);
    expect(html).toContain('Chapter text');
    expect(html).not.toContain('crossref');
  });

  it('continues printing when verse text fails or contains no matching verse', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.loadSection.mockImplementationOnce((textid, sectionid, success, failure) => failure(new Error('offline')));
    await printNotes([{ title: 'Offline', content: '<p>John 3:16</p>', modified: 0 }], {
      includeVerseText: true
    });
    expect(await readBlob(blob)).not.toContain('<blockquote class="print-verse-text">');
    expect(warn).toHaveBeenCalled();

    mocks.loadSection.mockImplementationOnce((textid, sectionid, success) => success(document.createElement('div')));
    await printNotes([{ title: 'Missing', content: '<p>John 3:16</p>', modified: 0 }], {
      includeVerseText: true
    });
    expect(await readBlob(blob)).not.toContain('<blockquote class="print-verse-text">');
    warn.mockRestore();
  });

  it('closes the popup if document assembly throws', async () => {
    const badDate = { valueOf: () => { throw new Error('bad date'); } };
    await expect(printNotes([{ title: 'Bad', content: '', modified: badDate }])).rejects.toThrow('bad date');
    expect(printWindow.close).toHaveBeenCalled();
  });
});

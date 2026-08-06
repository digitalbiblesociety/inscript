import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  showNotice: vi.fn(),
  t: vi.fn(key => `translated:${key}`)
}));

vi.mock('@windows/NotesWindow/notice.js', () => ({ showNotice: fixtures.showNotice }));
vi.mock('@lib/i18n.js', () => ({ t: fixtures.t }));

import {
  downloadNotes,
  notesToMarkdown,
  notesToPlainText,
  notesToRtf
} from '@windows/NotesWindow/download.js';

function makeNote(overrides = {}) {
  return {
    title: 'Title {one}',
    content: '<h1>H1</h1><h2>H2</h2><h3>H3</h3><div><p><b>B</b> <strong>S</strong> ' +
      '<i>I</i> <em>E</em> <u>U</u><br><a href="#">A</a></p><ul><li>Item</li></ul></div>',
    referenceDisplay: 'John 3:16 {ref}',
    created: 1700000000000,
    modified: 1700000100000,
    ...overrides
  };
}

describe('notes downloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Blob', vi.fn(function Blob(parts, options) {
      return { parts, type: options.type };
    }));
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('handles empty converter input and fills fallback fields', () => {
    const note = makeNote({ title: '', content: '', referenceDisplay: '' });
    expect(notesToPlainText([note])).toContain('Untitled');
    expect(notesToMarkdown([note])).toContain('# Untitled');
    expect(notesToRtf([note])).toContain('{\\b\\fs28 Untitled}');
  });

  it('converts the supported rich-text tags to markdown', () => {
    const markdown = notesToMarkdown([makeNote()]);
    expect(markdown).toContain('# H1');
    expect(markdown).toContain('## H2');
    expect(markdown).toContain('### H3');
    expect(markdown).toContain('**B** **S** *I* *E* _U_');
    expect(markdown).toContain('- Item');
    expect(markdown).toContain('A');
    expect(markdown).not.toContain('<');
  });

  it('converts rich text to RTF and escapes control characters', () => {
    const rtf = notesToRtf([makeNote({ title: 'A\\B {C}' })]);
    expect(rtf).toContain('A\\\\B \\{C\\}');
    expect(rtf).toContain('{\\b B}');
    expect(rtf).toContain('{\\i I}');
    expect(rtf).toContain('{\\ul U}');
    expect(rtf).toContain('\\par - Item');
    expect(rtf.endsWith('}')).toBe(true);
  });

  it('notifies instead of downloading an absent or empty note list', () => {
    downloadNotes(null, 'text');
    downloadNotes([], 'text');
    expect(fixtures.showNotice).toHaveBeenCalledTimes(2);
    expect(fixtures.showNotice).toHaveBeenCalledWith(
      'translated:windows.notes.noNotesToDownload'
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it.each([
    ['markdown', 'notes.md', 'text/markdown'],
    ['rtf', 'notes.rtf', 'application/rtf'],
    ['text', 'notes.txt', 'text/plain'],
    ['unknown', 'notes.txt', 'text/plain']
  ])('downloads %s content with the expected filename and MIME type', (format, filename, type) => {
    downloadNotes([makeNote()], format);
    const blob = Blob.mock.results.at(-1).value;
    expect(blob.type).toBe(type);
    expect(URL.createObjectURL).toHaveBeenLastCalledWith(blob);
    const anchor = HTMLAnchorElement.prototype.click.mock.instances.at(-1);
    expect(anchor.download).toBe(filename);
    expect(anchor.href).toContain('blob:test');
    expect(anchor.isConnected).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenLastCalledWith('blob:test');
  });

  it('downloads JSON with a date-stamped filename', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));
    downloadNotes([makeNote()], 'json');
    const anchor = HTMLAnchorElement.prototype.click.mock.instances.at(-1);
    expect(anchor.download).toBe('notes-backup-2026-08-05.json');
    expect(Blob.mock.results.at(-1).value.type).toBe('application/json');
    vi.useRealTimers();
  });
});

import { describe, expect, it } from 'vitest';
import { escapeHtml } from '@lib/escapeHtml.js';

describe('escapeHtml', () => {
  it('escapes the characters that can break out of text content', () => {
    expect(escapeHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;');
  });

  it('escapes quotes for use in quoted attributes', () => {
    expect(escapeHtml('"a" and \'b\'')).toBe('&quot;a&quot; and &#39;b&#39;');
  });

  it('escapes ampersands before the entities it introduces', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('coerces non-strings and treats null/undefined as empty', () => {
    expect(escapeHtml(12)).toBe('12');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

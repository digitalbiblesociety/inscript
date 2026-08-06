import { describe, expect, it, vi } from 'vitest';
import { renderSections } from '@ui/TextNavigatorBooks.js';

function controller(textInfo) {
  const changer = document.createElement('div');
  changer.innerHTML = `
    <div class="text-navigator-division selected" data-chapters="JN1,JN10,JN150">
      <span>John</span>
    </div>`;
  return {
    textInfo: { type: 'bible', ...textInfo },
    refs: { changer, divisions: changer },
    setActiveBook: vi.fn()
  };
}

describe('TextNavigatorBooks', () => {
  it('renders Arabic-Indic chapter labels while preserving ASCII section IDs', () => {
    const view = controller({ lang: 'arb' });
    renderSections(view, false);

    const chapters = [...view.refs.changer.querySelectorAll('.text-navigator-section')];
    expect(chapters.map(chapter => chapter.textContent)).toEqual(['١', '١٠', '١٥٠']);
    expect(chapters.map(chapter => chapter.dataset.id)).toEqual(['JN1', 'JN10', 'JN150']);
    expect(chapters.map(chapter => chapter.classList[1]))
      .toEqual(['section-JN1', 'section-JN10', 'section-JN150']);
  });

  it.each([
    ['ben', ['১', '১০', '১৫০']],
    ['hin', ['१', '१०', '१५०']],
    ['urd', ['۱', '۱۰', '۱۵۰']]
  ])('renders the configured chapter digits for %s', (lang, expected) => {
    const view = controller({ lang });
    renderSections(view, false);
    expect([...view.refs.changer.querySelectorAll('.text-navigator-section')]
      .map(chapter => chapter.textContent)).toEqual(expected);
  });

  it('keeps Latin fallback labels and supports an existing custom numbers array', () => {
    const latin = controller({ lang: 'eng' });
    renderSections(latin, false);
    expect([...latin.refs.changer.querySelectorAll('.text-navigator-section')]
      .map(chapter => chapter.textContent)).toEqual(['1', '10', '150']);

    const numbers = [];
    numbers[1] = 'one';
    const custom = controller({ lang: 'arb', numbers });
    renderSections(custom, false);
    expect([...custom.refs.changer.querySelectorAll('.text-navigator-section')]
      .map(chapter => chapter.textContent)).toEqual(['one', '١٠', '١٥٠']);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { StatisticsWindow } from '../../../browserbible/js/windows/StatisticsWindow.js';

const proto = StatisticsWindow.prototype;

function makeContext({ lang = 'eng', stopwords = ['the', 'and', 'of'] } = {}) {
  return {
    state: { wordStats: [], lemmaTally: [], textInfo: { lang } },
    _wordIndex: new Map(),
    _lemmaIndex: new Map(),
    _stopwords: new Set(stopwords),
    countWord: proto.countWord,
    tallyLemma: proto.tallyLemma
  };
}

function verseFrom(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

function applyLabels(ctx) {
  for (const entry of ctx.state.wordStats) {
    entry.word = Object.keys(entry.formCounts)
      .sort((a, b) => entry.formCounts[b] - entry.formCounts[a])[0];
  }
}

describe('StatisticsWindow word counting', () => {
  let ctx;
  beforeEach(() => { ctx = makeContext(); });

  it('merges case variants and labels with the most frequent casing', () => {
    proto.processTextVerse.call(ctx, verseFrom('Faith faith faith Faith faith'));
    applyLabels(ctx);

    expect(ctx.state.wordStats).toHaveLength(1);
    expect(ctx.state.wordStats[0].count).toBe(5);
    expect(ctx.state.wordStats[0].word).toBe('faith');
    expect(ctx.state.wordStats[0].key).toBe('faith');
  });

  it('drops stop words from plain text', () => {
    proto.processTextVerse.call(ctx, verseFrom('the light of the world and the truth'));
    applyLabels(ctx);

    expect(ctx.state.wordStats.map((w) => w.word).sort())
      .toEqual(['light', 'truth', 'world']);
  });

  it('counts surface words individually for lemma-tagged text, not grouped by lemma', () => {
    proto.processLemmaVerse.call(ctx, verseFrom(
      '<l s="G26">love</l> <l s="G2532">and</l> <l s="G4102">faith</l> <l s="G26">love</l>'
    ));
    applyLabels(ctx);

    const byWord = Object.fromEntries(ctx.state.wordStats.map((w) => [w.word, w.count]));
    expect(byWord).toEqual({ love: 2, faith: 1 });
  });

  it('skips lemmas whose Strongs codes are all stop codes, and H853', () => {
    proto.processLemmaVerse.call(ctx, verseFrom(
      '<l s="H853">the</l><l s="G3588 G2532">whatever</l><l s="H430">God</l>'
    ));
    applyLabels(ctx);

    expect(ctx.state.wordStats.map((w) => w.word)).toEqual(['God']);
    expect(ctx.state.lemmaTally.map((t) => t.strongs)).toEqual(['H430']);
  });

  it('splits a multi-word lemma and filters its stop words', () => {
    proto.processLemmaVerse.call(ctx, verseFrom('<l s="H3068">the LORD</l>'));
    applyLabels(ctx);

    expect(ctx.state.wordStats.map((w) => w.word)).toEqual(['LORD']);
    expect(ctx.state.lemmaTally[0]).toMatchObject({ strongs: 'H3068', words: ['LORD'], count: 1 });
  });

  it('tallies one lemma entry per occurrence with the surface forms seen', () => {
    proto.processLemmaVerse.call(ctx, verseFrom(
      '<l s="G26">love</l><l s="G26">loved</l><l s="G26">love</l>'
    ));

    expect(ctx.state.lemmaTally).toHaveLength(1);
    expect(ctx.state.lemmaTally[0].count).toBe(3);
    expect(ctx.state.lemmaTally[0].words).toEqual(['love', 'loved']);
  });
});

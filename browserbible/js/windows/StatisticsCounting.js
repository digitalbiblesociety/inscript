import { tokenizeWords, wordKey } from '../lib/stopwords.js';

const STRONGS_STOPWORDS = ['G2532', 'G3588', 'G846', 'G1722', 'G1519', 'G1537', 'G1611', 'H853'];

export function processLemmaVerse(component, verse) {
  const stopwords = component._stopwords;

  verse.querySelectorAll('l[s]').forEach((lemma) => {
    const strongsTokens = lemma.getAttribute('s').split(' ');
    if (strongsTokens.every((strongs) => STRONGS_STOPWORDS.includes(strongs))) return;

    const words = tokenizeWords(lemma.textContent, component.state.textInfo.lang)
      .filter((word) => !stopwords?.has(wordKey(word)));
    if (words.length === 0) return;

    for (const word of words) countWord(component, word);

    for (const strongs of strongsTokens) {
      if (STRONGS_STOPWORDS.includes(strongs)) continue;
      tallyLemma(component, strongs, words);
    }
  });
}

export function processTextVerse(component, verse) {
  const stopwords = component._stopwords;

  for (const word of tokenizeWords(verse.textContent, component.state.textInfo.lang)) {
    if (stopwords?.has(wordKey(word))) continue;
    countWord(component, word);
  }
}

export function countWord(component, word) {
  const key = wordKey(word);
  const entry = component._wordIndex.get(key);

  if (entry) {
    entry.count++;
    entry.formCounts[word] = (entry.formCounts[word] ?? 0) + 1;
  } else {
    const newEntry = { key, word, formCounts: { [word]: 1 }, count: 1 };
    component._wordIndex.set(key, newEntry);
    component.state.wordStats.push(newEntry);
  }
}

export function tallyLemma(component, strongs, words) {
  const tally = component._lemmaIndex.get(strongs);

  if (tally) {
    tally.count++;
    for (const word of words) {
      if (!tally.words.includes(word)) tally.words.push(word);
    }
  } else {
    const newTally = { strongs, words: [...new Set(words)], count: 1 };
    component._lemmaIndex.set(strongs, newTally);
    component.state.lemmaTally.push(newTally);
  }
}

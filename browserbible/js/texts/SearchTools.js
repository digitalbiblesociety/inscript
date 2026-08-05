import { escapeRegExp } from '../lib/textHighlighter.js';

function isCjkChar(charCode) {
  return ((charCode >= 0x4E00) && (charCode <= 0x9FFF)) ||
         ((charCode >= 0x3400) && (charCode <= 0x4DFF)) ||
         ((charCode >= 0x20000) && (charCode <= 0x2A6DF));
}

/** Apostrophes and hyphens join a word only between two non-punctuation chars. */
function isInnerWordChar(input, i, punctuation, innerWordExceptions) {
  if (i === 0 || i === input.length - 1) {
    return false;
  }
  if (innerWordExceptions.indexOf(input[i]) === -1) {
    return false;
  }
  const prevIsPunctuation = punctuation.indexOf(input[i - 1]) > -1;
  const nextIsPunctuation = punctuation.indexOf(input[i + 1]) > -1;
  return !prevIsPunctuation && !nextIsPunctuation;
}

export const SearchTools = {
  isAsciiRegExp: /^[\x20-\x7E]*$/gi,
  isLemmaRegExp: /[GgHh]\d{1,6}/g,
  HASHSIZE: 20,

  createSearchTerms(searchText, isLemmaSearch) {
    const searchTermsRegExp = [];

    if (isLemmaSearch) {
      const strongNumbers = searchText.split(' ');

      for (const part of strongNumbers) {
        searchTermsRegExp.push(
          new RegExp(`s=["'](\\w\\d{1,4}[a-z]?\\s)?(G|H)?${escapeRegExp(part.substr(1))}[a-z]?(\\s\\w\\d{1,4}[a-z]?)?["']`, 'gi')
        );
      }
    } else if (searchText.substring(0, 1) === '"' && searchText.substring(searchText.length - 1) === '"') {
      // Check for quoted search "jesus christ"
      let withoutQuotes = escapeRegExp(searchText.substring(1, searchText.length - 1));
      withoutQuotes = withoutQuotes.replace(/\s/g, '(\\s?(<(.|\\n)*?>)?\\s?)?');

      searchTermsRegExp.push(new RegExp(`\\b(${withoutQuotes})\\b`, 'gi'));
    } else {
      // ASCII characters have predictable word boundaries
      SearchTools.isAsciiRegExp.lastIndex = 0;

      if (SearchTools.isAsciiRegExp.test(searchText)) {
        let andSearchParts = searchText.split(/\s+AND\s+|\s+/gi);

        andSearchParts = andSearchParts.filter((item, index, arr) => arr.indexOf(item) === index);

        for (const part of andSearchParts) {
          searchTermsRegExp.push(new RegExp(`\\b(${escapeRegExp(part)})\\b`, 'gi'));
        }
      } else {
        const words = SearchTools.splitWords(searchText);

        for (const word of words) {
          searchTermsRegExp.push(new RegExp(escapeRegExp(word), 'gi'));
        }
      }
    }

    return searchTermsRegExp;
  },

  /**
   * Build boundary-matching regexes used to highlight original-language words
   * for a lemma search. Each regex matches a Strong's number as a whole token
   * inside a space-separated s attribute value (e.g. "G25" matches s="G3588 G25"
   * but not s="G250"). Returns one regex per Strong's number in searchText.
   */
  createLemmaHighlightRegExps(searchText) {
    return String(searchText)
      .trim()
      .split(/\s+/)
      .filter((part) => /^[GH]?\d{1,6}[a-z]?$/i.test(part))
      .map((part) => {
        const num = part.replace(/^[GH]/i, '').replace(/[a-z]$/i, '');
        return new RegExp(`(^|\\s)(G|H)?${num}[a-z]?($|\\s)`, 'i');
      });
  },

  splitWords(input) {
    const removeRegChars = ['\\', '^', '$', '.', '|', '?', '*', '+', '(', ')', '[', ']', '{', '}'];
    const otherRemoveChars = [
      // Roman
      ',', ';', '!', '-', '–', '―', '—', '~', ':', '"', '/', "'s", "'s", "'", "'", "'", '"', '"', '¿', '<', '>', '&',
      // Chinese
      '。', '：', '，', '"', '"', '）', '（', '~', '「', '」'
    ];
    const punctuation = [...removeRegChars, ...otherRemoveChars];
    const innerWordExceptions = ["'", "'", '-'];
    const words = [];
    let word = '';

    const addWord = () => {
      if (word !== '') {
        words.push(word);
      }
      word = '';
    };

    input = String(input);

    input = input.replace(/('s)/gi, '');

    for (let i = 0, il = input.length; i < il; i++) {
      const letter = input.charAt(i);
      const isPunctuation = punctuation.indexOf(letter) > -1;
      const isWhitespace = letter === ' ';
      const isLetter = !(isWhitespace || isPunctuation);

      if (isLetter) {
        word += letter;

        if (isCjkChar(input.charCodeAt(i))) {
          addWord();
        }
      } else if (isInnerWordChar(input, i, punctuation, innerWordExceptions)) {
        word += letter;
      } else {
        addWord();
      }
    }

    addWord();

    return words.filter((item, index, arr) => arr.indexOf(item) === index);
  },

  hashWord(word) {
    let hash = 0;
    for (const char of word) {
      hash += char.charCodeAt(0);
      hash %= SearchTools.HASHSIZE;
    }
    return hash;
  }
};

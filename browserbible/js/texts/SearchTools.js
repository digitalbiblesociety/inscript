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

/** A search word that is really an operator: "AND"/"OR" in any case. */
const IS_OPERATOR = /^(?:AND|OR)$/i;

/** Split on whitespace outside double-quoted phrases. */
function splitQueryTokens(searchText) {
  const tokens = [];
  let token = '';
  let quoted = false;

  for (const char of String(searchText ?? '')) {
    if (char === '"') quoted = !quoted;

    if (/\s/.test(char) && !quoted) {
      if (token) tokens.push(token);
      token = '';
    } else {
      token += char;
    }
  }

  if (token) tokens.push(token);
  return tokens;
}

function parseOperators(searchText) {
  const tokens = splitQueryTokens(searchText);
  return {
    searchType: tokens.some((token) => /^OR$/i.test(token)) ? 'OR' : 'AND',
    withoutOperators: tokens.filter((token) => !IS_OPERATOR.test(token)).join(' ')
  };
}

export const SearchTools = {
  isAsciiRegExp: /^[\x20-\x7E]*$/gi,
  isLemmaRegExp: /[GgHh]\d{1,6}/g,
  HASHSIZE: 20,

  /**
   * Read the query once so every consumer agrees on it: the local search, the
   * index loader and the remote providers all need the same operator, the same
   * terms and the same regexes. `words` are the plain index keys (operators
   * removed); `searchTermsRegExp` are the matching regexes.
   */
  parseQuery(searchText, isLemmaSearch = false) {
    const text = String(searchText ?? '');
    const { searchType, withoutOperators } = parseOperators(text);

    return {
      searchType,
      words: isLemmaSearch
        ? [...new Set(withoutOperators.split(/\s+/).filter(Boolean))]
        : SearchTools.splitWords(withoutOperators),
      searchTermsRegExp: SearchTools.createSearchTerms(text, isLemmaSearch)
    };
  },

  /**
   * Drop standalone AND/OR tokens. They select how terms combine, so leaving
   * them in would search for the words "and"/"or" themselves.
   */
  removeOperators(searchText) {
    return parseOperators(searchText).withoutOperators;
  },

  createSearchTerms(searchText, isLemmaSearch) {
    const searchTermsRegExp = [];

    if (isLemmaSearch) {
      const strongNumbers = SearchTools.removeOperators(searchText).split(/\s+/).filter(Boolean);

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
        let searchParts = SearchTools.removeOperators(searchText).split(/\s+/).filter(Boolean);

        searchParts = searchParts.filter((item, index, arr) => arr.indexOf(item) === index);

        for (const part of searchParts) {
          searchTermsRegExp.push(new RegExp(`\\b(${escapeRegExp(part)})\\b`, 'gi'));
        }
      } else {
        const words = SearchTools.splitWords(SearchTools.removeOperators(searchText));

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
      // Any whitespace, not just a literal space: newlines and tabs reach here
      // from pasted queries and from index building over wrapped html.
      const isWhitespace = /\s/.test(letter);
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

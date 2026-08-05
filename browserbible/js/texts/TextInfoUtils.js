// Pure helpers shared by TextLoader and the text providers.

export function getTextid(input) {
  const parts = input.split(':');
  return (parts.length > 1) ? parts[1] : parts[0];
}

/**
 * Version abbreviation for display: strips the leading ISO 639-3 language
 * prefix from ids like "ENGKJV" so the UI shows "KJV".
 */
export function displayAbbr(textInfo) {
  if (!textInfo) return '';
  const abbr = textInfo.abbr || textInfo.id || '';
  const lang = (textInfo.lang || '').toUpperCase();

  if (lang.length === 3 && abbr.toUpperCase().startsWith(lang) && abbr.length - lang.length >= 2) {
    return abbr.slice(lang.length);
  }

  return abbr;
}

export function processTexts(textArray, providerName) {
  for (const text of textArray) {
    processText(text, providerName);
  }
}

export function processText(text, providerName) {
  if (text.id.split(':').length > 1) {
    text.id = text.id.split(':')[1];
  }

  text.providerName = providerName;
  text.providerid = `${providerName}:${text.id}`;

  if (text.country && !text.countries &&
      text.country !== text.langName && text.country !== text.langNameEnglish) {
    text.countries = [];
  }
}

/**
 * If the exact section doesn't exist, find a section with the same book and
 * chapter number. When the book/chapter doesn't exist in this text at all,
 * keep the original id and let the provider handle it (or fail gracefully).
 */
export function resolveSectionId(textInfo, sectionid) {
  if (!(textInfo.sections?.length > 0) || textInfo.sections.indexOf(sectionid) !== -1) {
    return sectionid;
  }

  const bookPrefix = sectionid.substring(0, 2);
  const chapterNum = parseInt(sectionid.substring(2), 10);

  const matchingSection = textInfo.sections.find(s => {
    if (!s.startsWith(bookPrefix)) return false;
    const sectionChapter = parseInt(s.substring(2), 10);
    return sectionChapter === chapterNum;
  });

  return matchingSection || sectionid;
}

/** Fresh nodes per caller, since callers adopt and mutate them. */
export function htmlToNode(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.firstChild || temp;
}

import { BOOK_DATA } from '../bible/BibleData.js';

/**
 * Localized book name for the current text: the text's own division names win,
 * then BOOK_DATA names for the text's language, then English, then the code.
 */
export function getBookName(textInfo, bookid) {
  const divIndex = textInfo?.divisions?.indexOf(bookid) ?? -1;
  const divName = divIndex >= 0 ? textInfo?.divisionNames?.[divIndex] : null;
  if (divName) return Array.isArray(divName) ? divName[0] : divName;

  const names = BOOK_DATA[bookid]?.names ?? {};
  const langNames = names[textInfo?.lang] ?? names.eng ?? [];
  const first = langNames[0];
  const name = Array.isArray(first) ? first[0] : first;
  return name ?? bookid;
}

const MAX_PASSAGE_VERSES = 2000;

function appendRange(references, versesIn, range) {
  let chapter = range.startChapter;
  let verse = range.startVerse;

  while (
    (chapter < range.endChapter || (chapter === range.endChapter && verse <= range.endVerse)) &&
    references.length < MAX_PASSAGE_VERSES
  ) {
    references.push({ chapter, verse });
    verse++;
    if (chapter < range.endChapter && verse > versesIn(chapter)) {
      chapter++;
      verse = 1;
    }
  }
}

function parseSegmentLocation(segment, previousChapter) {
  const chapterMatch = segment.match(/^(\d+)\s*:\s*(.*)$/);
  if (chapterMatch) {
    return {
      chapter: parseInt(chapterMatch[1], 10),
      list: chapterMatch[2],
      wholeChapter: false
    };
  }

  const wholeChapter = /^\d+$/.test(segment);
  return {
    chapter: wholeChapter ? parseInt(segment, 10) : previousChapter,
    list: segment,
    wholeChapter
  };
}

function appendListItem(references, versesIn, item, chapter) {
  const match = item.match(/^(\d+)(?:\s*-\s*(?:(\d+)\s*:\s*)?(\d+)[ab]?)?$/);
  if (!match) return chapter;

  const startVerse = parseInt(match[1], 10);
  if (!match[3]) {
    references.push({ chapter, verse: startVerse });
    return chapter;
  }

  const endChapter = match[2] ? parseInt(match[2], 10) : chapter;
  appendRange(references, versesIn, {
    startChapter: chapter,
    startVerse,
    endChapter,
    endVerse: parseInt(match[3], 10)
  });
  return endChapter;
}

function appendSegment(references, versesIn, rawSegment, previousChapter) {
  const segment = rawSegment.trim();
  if (!segment) return previousChapter;

  const location = parseSegmentLocation(segment, previousChapter);
  if (location.chapter === null) return previousChapter;
  if (location.wholeChapter) {
    appendRange(references, versesIn, {
      startChapter: location.chapter,
      startVerse: 1,
      endChapter: location.chapter,
      endVerse: versesIn(location.chapter)
    });
    return location.chapter;
  }

  let chapter = location.chapter;
  for (const rawItem of location.list.split(',')) {
    const item = rawItem.trim();
    if (item) chapter = appendListItem(references, versesIn, item, chapter);
  }
  return chapter;
}

function collectReferences(passage, versesIn) {
  const references = [];
  let chapter = null;
  for (const segment of String(passage).split(';')) {
    chapter = appendSegment(references, versesIn, segment, chapter);
  }
  return references;
}

function groupReferences(references, bookid) {
  const groups = [];
  for (const reference of references) {
    const sectionid = `${bookid}${reference.chapter}`;
    const fragmentid = `${sectionid}_${reference.verse}`;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.sectionid === sectionid) {
      lastGroup.fragmentids.push(fragmentid);
    } else {
      groups.push({ sectionid, fragmentids: [fragmentid] });
    }
  }
  return groups;
}

/**
 * Parse a passage reference into section loads. Handles the formats found in
 * the parallels data: "1:3", "2:2-3", "1:1-12, 14-17", "8:28-34; 9:1",
 * cross-chapter ranges "8:32-9:9" / "15:39- 16:12", and bare chapters "13".
 * Returns one entry per chapter section, in reading order.
 */
export function parsePassageReference(passage, bookid) {
  const chapterCounts = BOOK_DATA[bookid]?.chapters ?? [];
  const versesIn = (chapter) => chapterCounts[chapter - 1] ?? 200;
  return groupReferences(collectReferences(passage, versesIn), bookid);
}

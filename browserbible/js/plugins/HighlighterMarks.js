import { elem } from '../lib/helpers.esm.js';
import { getHighlightsForText } from './HighlighterStorage.js';

const SKIP_SELECTORS = '.verse-num, .v-num, .note, .cf, .chapter-num, .c, .c-num';

/** Skips verse numbers, notes, and other non-verse chrome. */
function getTextNodes(element) {
  const nodes = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent && parent !== element) {
        if (parent.matches(SKIP_SELECTORS)) return NodeFilter.FILTER_REJECT;
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

/** Character offset of a selection anchor/focus within the verse visible text. */
export function getVerseOffset(verse, node, offset) {
  const textNodes = getTextNodes(verse);
  let charCount = 0;
  for (const textNode of textNodes) {
    if (textNode === node) return charCount + offset;
    charCount += textNode.textContent.length;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return charCount;
  const childNodes = Array.from(node.childNodes);
  const targetNode = childNodes[offset] || childNodes[childNodes.length - 1];
  if (!targetNode) return charCount;
  charCount = 0;
  for (const textNode of textNodes) {
    if (targetNode === textNode || targetNode.contains?.(textNode)) return charCount;
    charCount += textNode.textContent.length;
  }
  return charCount;
}

function findNodeAtOffset(verse, targetOffset) {
  const textNodes = getTextNodes(verse);
  let charCount = 0;
  for (const node of textNodes) {
    const length = node.textContent.length;
    if (charCount + length > targetOffset) return { node, offset: targetOffset - charCount };
    charCount += length;
  }
  const lastNode = textNodes[textNodes.length - 1];
  return lastNode ? { node: lastNode, offset: lastNode.textContent.length } : null;
}

const createMark = (highlightId, color) => elem('mark', {
  className: 'user-highlight',
  dataset: { hlId: highlightId },
  style: { backgroundColor: color }
});

export function applyHighlightMark(verse, startOffset, endOffset, color, highlightId) {
  const start = findNodeAtOffset(verse, startOffset);
  const end = findNodeAtOffset(verse, endOffset);
  if (!start || !end) return;
  try {
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    range.surroundContents(createMark(highlightId, color));
  } catch {
    applyHighlightFallback(verse, startOffset, endOffset, color, highlightId);
  }
}

function applyHighlightFallback(verse, startOffset, endOffset, color, highlightId) {
  const textNodes = getTextNodes(verse);
  let charCount = 0;
  for (const node of textNodes) {
    const nodeEnd = charCount + node.textContent.length;
    const overlapStart = Math.max(startOffset, charCount);
    const overlapEnd = Math.min(endOffset, nodeEnd);
    if (overlapStart < overlapEnd) {
      const range = document.createRange();
      range.setStart(node, overlapStart - charCount);
      range.setEnd(node, overlapEnd - charCount);
      try {
        range.surroundContents(createMark(highlightId, color));
      } catch {
        // Skip an individual text node when the browser rejects its range.
      }
    }
    charCount = nodeEnd;
    if (charCount >= endOffset) break;
  }
}

export function removeHighlightMarks(highlightId) {
  document.querySelectorAll(`.user-highlight[data-hl-id="${highlightId}"]`).forEach((mark) => {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

export function recolorHighlightMarks(highlightId, color) {
  document.querySelectorAll(`.user-highlight[data-hl-id="${highlightId}"]`).forEach((mark) => {
    mark.style.backgroundColor = color;
  });
}

export function applyHighlightsToSection(textid, section) {
  if (!section || !textid) return;
  const highlightsByVerse = new Map();
  for (const highlight of getHighlightsForText(textid)) {
    const verseHighlights = highlightsByVerse.get(highlight.verseId) ?? [];
    verseHighlights.push(highlight);
    highlightsByVerse.set(highlight.verseId, verseHighlights);
  }
  for (const verse of section.querySelectorAll('.verse, .v')) {
    const verseId = verse.getAttribute('data-id');
    if (!verseId) continue;
    const highlights = (highlightsByVerse.get(verseId) ?? [])
      .sort((a, b) => b.startOffset - a.startOffset);
    for (const highlight of highlights) {
      applyHighlightMark(verse, highlight.startOffset, highlight.endOffset, highlight.color, highlight.id);
    }
  }
}

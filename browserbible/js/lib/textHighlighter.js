export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectTextNodes(root, skipSelector) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest(skipSelector)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  return textNodes;
}

/** Returns null when the regex never matches, so the node is left untouched. */
function buildHighlightFragment(text, regex, className) {
  regex.lastIndex = 0;

  let match;
  let lastIndex = 0;
  let frag = null;
  while ((match = regex.exec(text)) !== null) {
    if (match[0] === '') { regex.lastIndex++; continue; }
    if (!frag) frag = document.createDocumentFragment();
    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const span = document.createElement('span');
    span.className = className;
    span.textContent = match[0];
    frag.appendChild(span);
    lastIndex = match.index + match[0].length;
    if (!regex.global) break;
  }

  if (frag && lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  return frag;
}

export function highlightTextMatches(root, regexps, className = 'highlight') {
  const skipSelector = '.' + className.trim().split(/\s+/).join('.');

  for (const regex of regexps) {
    for (const textNode of collectTextNodes(root, skipSelector)) {
      const frag = buildHighlightFragment(textNode.nodeValue, regex, className);
      if (frag) textNode.parentNode.replaceChild(frag, textNode);
    }
  }
}

/** Shared event delegation and hover-capability checks for document-level plugins. */

export function supportsHover() {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(hover: hover)').matches;
  }
  return !('ontouchend' in document);
}

export function delegate(root, type, selector, handler, { ignoreInternal = false } = {}) {
  if (!root) return;
  root.addEventListener(type, (event) => {
    const target = event.target.closest?.(selector);
    if (!target || !root.contains(target)) return;
    if (ignoreInternal && event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
    handler(target, event);
  });
}

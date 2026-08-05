/** Cross-window message handling and header state for MapWindow. */

import { Reference } from '../../bible/BibleReference.js';

export function updateEmptyState(component) {
  if (!component.mapPanel?.locationData) return;

  if (component.mapPanel.state.mode === 'journeys') {
    // The journey dropdown provides the context; no count in the header
    component.refs.locationCount.textContent = '';
    component.refs.emptyState.classList.remove('visible');
    return;
  }

  const isPassage = component.mapPanel.state.mode === 'passage';
  const visibleCount = component.refs.mapContainer
    .querySelectorAll('.map-marker:not(.filtered-out)').length;

  component.refs.locationCount.textContent = visibleCount > 0 ? `${visibleCount} locations` : '';

  const showEmpty = isPassage && visibleCount === 0;
  component.refs.emptyState.classList.toggle('visible', showEmpty);
  if (showEmpty && component.mapPanel.state.currentReference) {
    // currentReference is an internal section id ("JN3"); show "John 3"
    const ref = Reference(component.mapPanel.state.currentReference);
    const display = ref?.isValid() ? ref.toString() : component.mapPanel.state.currentReference;
    component.refs.emptyMessage.textContent = `No locations found in ${display}`;
  }
}

export function handleTextLoad(component, e) {
  if (e.data.messagetype !== 'textload') return;

  const prevTextid = component.state.currentTextid;
  if (e.data.textid) {
    component.state.currentTextid = e.data.textid;
    if (component.mapPanel) component.mapPanel._detailTextid = e.data.textid;
  }

  if (e.data.textid && e.data.textid !== prevTextid) {
    component.rehydrateOpenDetail();
  }

  // Scope the text walk to the newly loaded section; wrapping is idempotent,
  // so sections walked earlier keep their spans. A text's first message
  // walks everything: content rendered before this window opened, or
  // replaced by a version change. Filtering reads marker highlight state,
  // so highlight comes first.
  if (!component._seenTextids) component._seenTextids = new Set();
  const scoped = e.data.textid && component._seenTextids.has(e.data.textid);
  // highlight() reports false while pins are still loading. Only a textid
  // whose walk actually ran counts as seen; otherwise the next textload
  // does the full walk that covers the sections this one missed.
  const walked = component.mapPanel?.highlight(scoped ? e.data.sectionid : null);
  if (walked && e.data.textid) component._seenTextids.add(e.data.textid);

  if (e.data.sectionid) {
    component.mapPanel?.filterBySection(e.data.sectionid);
    updateEmptyState(component);
  }
}

export function handleNavigation(component, e) {
  if (e.data?.messagetype === 'nav' && e.data?.locationInfo?.sectionid) {
    component.mapPanel?.filterBySection(e.data.locationInfo.sectionid);
    updateEmptyState(component);
  }
}

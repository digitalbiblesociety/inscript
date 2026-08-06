/** Journey dropdown and stop-list rendering for MapWindow's window chrome. */

import { i18n } from '../../lib/i18n.js';
import { Reference } from '../../bible/BibleReference.js';
import { BOOK_DATA } from '../../bible/BibleData.js';

/** Localized journey display name, falling back to the data file's name. */
function journeyName(journey) {
  const key = `windows.map.journeynames.${journey.id}`;
  const name = i18n.t(key);
  return name === key ? journey.name : name;
}

export function renderJourneyMenu(component, journeys) {
  component.refs.journeyMenu.innerHTML = journeys.map(j =>
    `<button type="button" class="map-journey-menu-item" role="option" aria-selected="false"
      data-journey-id="${component.escapeHtml(j.id)}" style="--journey-color:${component.escapeHtml(j.color)}">
      <span class="map-journey-dot"></span>${component.escapeHtml(journeyName(j))}
    </button>`
  ).join('');
}

export function toggleJourneyMenu(component, open) {
  const show = open ?? component.refs.journeyMenu.style.display !== 'block';
  component.refs.journeyMenu.style.display = show ? 'block' : 'none';
  component.refs.journeyList.setAttribute('aria-expanded', String(show));
}

/** The dropdown trigger shows the current journey; the menu marks it selected. */
export function renderJourneySelection(component, journey) {
  component.refs.journeyList.innerHTML =
    `<span class="map-journey-dot" style="--journey-color:${component.escapeHtml(journey.color)}"></span>
     <span class="map-journey-list-label">${component.escapeHtml(journeyName(journey))}</span>`;
  component.refs.journeyMenu.querySelectorAll('.map-journey-menu-item').forEach(item => {
    item.setAttribute('aria-selected', String(item.dataset.journeyId === journey.id));
  });
}

function journeyStopRow(component, journey, stop, i) {
  const verses = (stop.verses || []).map(verseId => {
    const ref = new Reference(verseId);
    const bookName = BOOK_DATA[ref.bookid]?.names?.eng?.[0] ?? ref.bookid;
    const sectionid = ref.bookid + ref.chapter1;
    return `<span class="verse map-journey-stop-verse" data-sectionid="${sectionid}"
      data-fragmentid="${sectionid}_${ref.verse1}">${component.escapeHtml(`${bookName} ${ref.chapter1}:${ref.verse1}`)}</span>`;
  }).join('');
  return `<div class="map-journey-stop-row" data-stop-index="${i}">
    <span class="map-journey-stop-num" style="--journey-color:${component.escapeHtml(journey.color)}">${i + 1}</span>
    <span class="map-journey-stop-name">${component.escapeHtml(stop.label || stop.name)}</span>
    <span class="map-journey-stop-verses">${verses}</span>
  </div>`;
}

/** Ordered stop list for a journey, rendered into the inline detail area. */
export function showJourneyStops(component, journey) {
  if (!journey) return;

  const rows = journey.stops.map((stop, i) => journeyStopRow(component, journey, stop, i)).join('');

  // The list replaces any hydrating location detail
  component.refs.detailContent._hydrateObserver?.disconnect();
  component.refs.detailContent._hydrateObserver = null;

  component.refs.detailContent.innerHTML = `
    <div class="map-detail-header map-journey-list-header">
      <h2><span class="map-journey-swatch" style="--journey-color:${component.escapeHtml(journey.color)}"></span>${component.escapeHtml(journeyName(journey))}</h2>
      <span class="map-detail-count">${component.escapeHtml(i18n.t('windows.map.journeystops', { count: journey.stops.length }))}</span>
    </div>
    <div class="map-journey-stops">${rows}</div>
  `;
  component.refs.detail.classList.remove('hidden');
  component.refs.detailBack.classList.remove('hidden');
  component._journeyListShowing = true;
  component._detailFromJourney = false;
  component._journeyListJourney = journey;
}

import { getDbsVideoLanguageName, getDbsVideoLanguages } from '../media/DbsVideoApi.js';
import { i18n } from '../lib/i18n.js';

export const effectiveVideoLanguage = (component) =>
  component.state.videoLanguage || component.state.currentLanguage;

export function updateLanguageMenu(component) {
  const languages = getDbsVideoLanguages([...component.chapterVideoOrgs], i18n.lng());
  component.state.videoLanguages = languages;
  component.refs.language.classList.toggle('hidden', languages.length === 0);
  if (languages.length === 0) {
    component.toggleLanguageMenu(false);
    return;
  }
  component.renderLanguageOptions(component.refs.languageFilter.value);
  component.updateLanguageLabel();
}

export function rankLanguages(component, search) {
  const named = [];
  const mentioned = [];
  for (const language of component.state.videoLanguages) {
    const name = language.name.toLowerCase();
    if (name.startsWith(search) || language.iso.startsWith(search)) named.push(language);
    else if (name.includes(search)) mentioned.push(language);
  }
  return [...named, ...mentioned];
}

export function renderLanguageOption(component, { iso, name, titles }) {
  const selected = iso === component.state.videoLanguage;
  const count = titles > 1 ? `<span class="media-language-count">${titles}</span>` : '';
  return `<button type="button" class="media-language-option" role="option"
    aria-selected="${selected}" data-iso="${component.escapeHtml(iso)}">
    <span class="media-language-name">${component.escapeHtml(name)}</span>${count}
  </button>`;
}

export function renderLanguageOptions(component, query = '') {
  const search = query.trim().toLowerCase();
  const matches = search ? component.rankLanguages(search) : component.state.videoLanguages;
  const auto = search ? '' : component.renderLanguageOption({
    iso: '', name: i18n.t('windows.media.videolanguageauto'), titles: 0
  });
  const options = matches.map((language) => component.renderLanguageOption(language)).join('');
  component.refs.languageOptions.innerHTML = auto + options
    || `<div class="media-language-empty">${component.escapeHtml(i18n.t('windows.media.videolanguagenone'))}</div>`;
}

export function updateLanguageLabel(component) {
  const iso = component.state.videoLanguage;
  component.refs.languageLabel.textContent = iso
    ? (component.state.videoLanguages.find((language) => language.iso === iso)?.name
      ?? getDbsVideoLanguageName(iso, i18n.lng()))
    : i18n.t('windows.media.videolanguageauto');
}

export function toggleLanguageMenu(component, open) {
  const show = open ?? !component.refs.languageMenu.classList.contains('open');
  component.refs.languageMenu.classList.toggle('open', show);
  component.refs.languageBtn.setAttribute('aria-expanded', String(show));
  if (!show) return;
  component.refs.languageFilter.value = '';
  component.renderLanguageOptions();
  component.refs.languageFilter.focus();
}

export function setVideoLanguage(component, iso) {
  component.toggleLanguageMenu(false);
  if (iso === component.state.videoLanguage) return;
  component.state.videoLanguage = iso;
  component.reloadForLanguage();
  component.trigger('settingschange', { type: 'settingschange', target: component, data: null });
}

export function reloadForLanguage(component) {
  const current = component.state.galleryItems[component.state.currentGalleryIndex] ?? null;
  component.state.currentSectionId = '';
  component.processContent();
  component.updateLanguageLabel();
  if (!current) return;
  const index = component.findGalleryIndex(current);
  if (index >= 0) component.showGalleryItem(index);
}

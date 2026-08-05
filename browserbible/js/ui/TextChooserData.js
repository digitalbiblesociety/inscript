import { fuzzyIncludes } from '../lib/fuzzy.js';
import { getConfig } from '../core/config.js';
import { t as i18nT } from '../lib/i18n.js';

export const hasAudioContent = (text) => Boolean(
  text.hasAudio || text.audioDirectory || text.fcbh_audio_ot || text.fcbh_audio_nt);

function acceptsText(controller, text) {
  if (controller.langFilter && text.lang3 !== controller.langFilter && text.lang !== controller.langFilter) return false;
  if (controller.textType === 'audio') return hasAudioContent(text);
  if (text.hasText === false) return false;
  return (text.type ?? 'bible') === controller.textType;
}

function buildSearchFields(text) {
  const searchText = [text.name, text.abbr, text.langName || '', text.langNameEnglish || '']
    .join(' ').toLowerCase();
  return { searchText, searchWords: searchText.split(/\s+/).filter(Boolean) };
}

function textItem(text, langHeader) {
  return { type: 'text', data: text, ...buildSearchFields(text), langHeader };
}

export function buildGroupedData(controller) {
  const key = `${controller.textType}|${controller.langFilter || ''}|${controller.listData?.length ?? 0}`;
  if (controller.groupedCacheKey === key && controller.groupedCache) return controller.groupedCache;
  const texts = controller.listData.filter((text) => acceptsText(controller, text));
  const languages = new Map();
  for (const text of texts) {
    const language = text.langNameEnglish || text.langName || '';
    if (!languages.has(language)) languages.set(language, []);
    languages.get(language).push(text);
  }
  const result = [];
  for (const language of [...languages.keys()].sort()) {
    const languageTexts = languages.get(language).sort((a, b) => a.name.localeCompare(b.name));
    const displayName = languageTexts[0].langNameEnglish || languageTexts[0].langName;
    result.push({ type: 'header', data: displayName, langCode: languageTexts[0].lang || '' });
    result.push(...languageTexts.map((text) => textItem(text, displayName)));
  }
  controller.groupedCacheKey = key;
  controller.groupedCache = result;
  result.filteredArray = texts;
  return result;
}

function recentlyUsedItems(controller, texts) {
  if (!controller.recentlyUsed.recent.length) return [];
  const textMap = new Map(texts.map((text) => [text.id, text]));
  const recent = controller.recentlyUsed.recent.map((id) => textMap.get(id)).filter(Boolean);
  if (!recent.length) return [];
  const header = i18nT('windows.bible.recentlyused') || 'Recently Used';
  return [
    { type: 'section-header', data: header, sectionType: 'recent' },
    ...recent.map((text) => textItem(text, header))
  ];
}

export function buildPinnedTop(controller) {
  if (controller.textType !== 'bible') return [];
  const texts = controller.groupedCache?.filteredArray ?? [];
  const result = recentlyUsedItems(controller, texts);
  if (controller.langFilter) return result;
  const language = controller.selectedTextInfo?.langNameEnglish || getConfig().pinnedLanguage || 'English';
  const current = texts.filter((text) => (text.langNameEnglish || text.langName || '') === language)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (current.length) {
    result.push({
      type: 'section-header', data: language, sectionType: 'current-language',
      langCode: current[0].lang || ''
    });
    result.push(...current.map((text) => textItem(text, language)));
  }
  return result;
}

export function buildFilteredIndices(controller) {
  const headers = new Set();
  const texts = new Set();
  controller.processedData.forEach((item, index) => {
    if (item.type !== 'text') return;
    const matches = controller.filterTokens.every((token) =>
      fuzzyIncludes(item.searchText, item.searchWords, token));
    if (matches) {
      texts.add(index);
      headers.add(item.langHeader);
    }
  });
  const result = [];
  controller.processedData.forEach((item, index) => {
    const header = ['header', 'section-header'].includes(item.type) && headers.has(item.data);
    if (header || (item.type === 'text' && texts.has(index))) result.push(index);
  });
  return result;
}

export function processTexts(controller, data) {
  if (!data) return;
  const language = controller.selectedTextInfo?.langNameEnglish || getConfig().pinnedLanguage || 'English';
  const key = `${controller.textType}|${controller.langFilter || ''}|${controller.listData.length}`
    + `|${controller.recentlyUsed.recent.join(',')}|${language}`;
  if (controller.processedDataKey === key && controller.processedData.length) return;
  controller.processedDataKey = key;
  const grouped = controller.buildGroupedData();
  const pinned = controller.buildPinnedTop();
  controller.processedData = pinned.length ? pinned.concat(grouped) : grouped.slice();
  controller.filteredIndices = controller.processedData.map((_, index) => index);
  controller.updateScrollHeight();
  controller.scheduleRender();
}

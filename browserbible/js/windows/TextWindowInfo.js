import { displayAbbr } from '../texts/TextLoader.js';
import { t } from '../lib/i18n.js';

export async function toggleTextInfo(component) {
  component.textChooser.hide();
  component.textNavigator.hide();
  if (component.refs.info.matches(':popover-open')) {
    component.refs.info.hidePopover();
    return;
  }
  const textInfo = component.state.currentTextInfo;
  if (textInfo) {
    component.refs.infoTitle.textContent = t('windows.bible.versioninfoname', [textInfo.name || textInfo.abbr]);
  }
  if (textInfo?.aboutHtml) component.refs.infoContent.innerHTML = textInfo.aboutHtml;
  else await loadTextInfo(component, textInfo);
  component.refs.info.showPopover();
}

async function loadTextInfo(component, textInfo) {
  component.refs.infoContent.innerHTML = `<div class="loading-indicator">${t('windows.bible.loadinginfo')}</div>`;
  try {
    const response = await fetch(`${component.config.baseContentUrl}${component.config.textsPath}/${textInfo.id}/about.html`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const htmlString = await response.text();
    const breakTag = '<body';
    const fixedHtml = htmlString.includes(breakTag) ? breakTag + htmlString.split(breakTag)[1] : '';
    if (!fixedHtml) throw new Error('about.html has no body');
    component.refs.infoContent.innerHTML = fixedHtml;
    textInfo.aboutHtml = fixedHtml;
  } catch {
    component.refs.infoContent.innerHTML = `
      <div class="scroller-info-empty">
        <p>${t('windows.bible.noinfo')}</p>
        <p class="scroller-info-version-name">${textInfo?.name || textInfo?.abbr || ''}</p>
      </div>`;
  }
}

export function setTextInfoUI(component, textInfo) {
  if (textInfo.type !== 'deafbible') {
    component.refs.textlistui.classList.remove('app-list-image');
    component.refs.textlistui.innerHTML = displayAbbr(textInfo);
    return;
  }
  component.refs.textlistui.classList.add('app-list-image');
  const cover = textInfo.cover || `${component.config.baseContentUrl}${component.config.textsPath}/${textInfo.id}/${textInfo.id}.png`;
  const image = document.createElement('img');
  image.src = cover;
  image.alt = textInfo.abbr || textInfo.name || '';
  component.refs.textlistui.replaceChildren(image);
}

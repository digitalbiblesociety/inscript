import { getText, loadTexts, displayAbbr } from '../texts/TextLoader.js';
import { versionHasSection, probeOrder } from './versionCycle.js';

const textTypeOf = (textInfo) => textInfo.type === undefined ? 'bible' : textInfo.type;

export function changeText(component, newTextInfo) {
  if (!newTextInfo) return;
  component.setTextInfoUI(newTextInfo);
  component.updateTabLabel(displayAbbr(newTextInfo));
  component.textNavigator.setTextInfo(newTextInfo);
  component.audioController?.setTextInfo(newTextInfo);
  if (component.state.currentTextInfo == null || newTextInfo.id !== component.state.currentTextInfo.id) {
    component.state.currentTextInfo = newTextInfo;
    component._cycleToken++;
    component._cycleTargetId = null;
    const oldLocation = component.scroller.getLocationInfo() ?? component.state.currentLocationInfo;
    const sectionid = oldLocation?.sectionid ?? newTextInfo.sections[0];
    const fragmentid = oldLocation?.fragmentid;
    component.refs.wrapper.innerHTML = '';
    component.scroller.setTextInfo(newTextInfo);
    component.scroller.load('text', sectionid, fragmentid);
    component.updateVersionCycler();
  }
}

export function cycleVersion(component, direction) {
  const siblings = component._versionSiblings;
  const current = component.state.currentTextInfo;
  if (!siblings || siblings.length < 2 || current == null) return;
  const sectionid = component.scroller.getLocationInfo()?.sectionid
    ?? component.state.currentLocationInfo?.sectionid;
  const anchorId = component._cycleTargetId ?? current.id;
  let startIndex = siblings.findIndex((text) => text.id === anchorId);
  if (startIndex === -1) startIndex = siblings.findIndex((text) => text.id === current.id);
  if (startIndex === -1) startIndex = 0;
  const token = ++component._cycleToken;
  const order = probeOrder(siblings.length, startIndex, direction);
  probeCandidate(component, { current, sectionid, siblings, token, order }, 0);
}

function probeCandidate(component, context, index) {
  if (index >= context.order.length) {
    if (component._cycleToken === context.token) component._cycleTargetId = null;
    return;
  }
  const candidate = context.siblings[context.order[index]];
  if (!candidate || candidate.id === context.current.id) {
    probeCandidate(component, context, index + 1);
    return;
  }
  component._cycleTargetId = candidate.id;
  getText(candidate.id, (info) => {
    if (component._cycleToken !== context.token) return;
    if (info && versionHasSection(info, context.sectionid)) {
      component.textChooser.setTextInfo(info);
      component.changeText(info);
    } else {
      probeCandidate(component, context, index + 1);
    }
  });
}

export function updateVersionCycler(component) {
  const current = component.state.currentTextInfo;
  if (!current || !component.refs.versionCycler) {
    component.setVersionSiblings([]);
    return;
  }
  loadTexts((data) => {
    if (component.state.currentTextInfo !== current) return;
    component.setVersionSiblings(getLanguageSiblings(component, data, current));
  });
}

export function getLanguageSiblings(component, data, textInfo) {
  const langOf = (text) => text.langNameEnglish || text.langName || '';
  const entry = data.find((text) => text.id === textInfo.id);
  const langKey = entry ? langOf(entry) : langOf(textInfo);
  return data
    .filter((text) => text.hasText !== false && textTypeOf(text) === component.state.textType && langOf(text) === langKey)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function setVersionSiblings(component, siblings) {
  component._versionSiblings = siblings;
  component.refs.versionCycler?.classList.toggle('has-versions', siblings.length > 1);
}

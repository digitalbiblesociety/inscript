export function pickSection(container, sectionid) {
  return container.querySelector(`.section[data-id="${sectionid}"]`)
    || container.querySelector('.section')
    || container;
}

export function toContainer(content) {
  if (content?.nodeType) return content;
  const container = document.createElement('div');
  container.innerHTML = typeof content === 'string' ? content : '';
  return container;
}

export function handleMediaMessage(component, event) {
  const { data } = event;
  let content = null;
  if (data.messagetype === 'nav' && data.type === 'bible' && data.locationInfo) {
    component.state.pendingSectionId = data.locationInfo.sectionid;
    content = document.querySelector(`.section[data-id="${data.locationInfo.sectionid}"]`);
  } else if (data.messagetype === 'textload' && data.sectionid && data.content) {
    const wanted = component.state.pendingSectionId || component.state.currentSectionId;
    if (wanted && wanted !== data.sectionid) return;
    content = pickSection(toContainer(data.content), data.sectionid);
    if (!content.getAttribute('data-id')) content.setAttribute('data-id', data.sectionid);
  }
  if (!content) return;
  component.state.pendingSectionId = '';
  component.contentToProcess = content;
  component.processContent();
}

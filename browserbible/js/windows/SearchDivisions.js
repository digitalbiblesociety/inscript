import { NT_BOOKS, AP_BOOKS, EXTRA_MATTER } from '../bible/BibleData.js';
import { getShowApocrypha, isApocryphalBook } from '../bible/Apocrypha.js';
import { i18n } from '../lib/i18n.js';

function divisionLists(component) {
  const lists = { ot: '', ap: '', nt: '' };
  const showApocrypha = getShowApocrypha();
  component.state.selectedTextInfo.divisions.forEach((bookCode, index) => {
    if (EXTRA_MATTER.includes(bookCode)) return;
    if (!showApocrypha && isApocryphalBook(bookCode)) return;
    const name = component.state.selectedTextInfo.divisionNames[index];
    const html = `<label class="division-name"><input type="checkbox" value="${bookCode}" checked />${component.escapeHtml(name)}</label>`;
    if (NT_BOOKS.includes(bookCode)) lists.nt += html;
    else if (AP_BOOKS.includes(bookCode)) lists.ap += html;
    else lists.ot += html;
  });
  return lists;
}

function chooserHtml(lists) {
  return [
    ['ot', 'windows.bible.ot'],
    ['ap', 'windows.bible.dc'],
    ['nt', 'windows.bible.nt']
  ].map(([id, label]) => `
    <div class="division-list division-list-${id}">
      <label class="division-header"><input type="checkbox" value="list-${id}" checked />${i18n.t(label)}</label>
      <div class="division-list-items">${lists[id]}</div>
    </div>`).join('');
}

export function drawDivisions(component) {
  if (!component.state.selectedTextInfo?.divisions) return;
  component.divisionChooser.setAttribute('dir', component.state.selectedTextInfo.dir);
  component.divisionChooser.querySelector('.search-division-main').innerHTML = chooserHtml(divisionLists(component));
  for (const id of ['ot', 'ap', 'nt']) {
    const list = component.divisionChooser.querySelector(`.division-list-${id}`);
    if (!list.querySelector('.division-list-items input')) list.style.display = 'none';
  }
}

export function setDivisions(component, divisions) {
  const selected = typeof divisions === 'string' ? divisions.split(',') : divisions;
  if (selected?.length) {
    component.divisionChooser.querySelectorAll('.division-list input').forEach((input) => {
      input.checked = false;
    });
    for (const division of selected) {
      const input = component.divisionChooser.querySelector(`.division-list input[value="${division}"]`);
      if (input) input.checked = true;
    }
  }
  for (const id of ['ot', 'ap', 'nt']) {
    checkDivisionHeader(component.divisionChooser.querySelector(`.division-list-${id}`));
  }
}

export function checkDivisionHeader(divisionList) {
  if (!divisionList) return;
  const items = [...divisionList.querySelectorAll('.division-list-items input')];
  const header = divisionList.querySelector('.division-header input');
  if (header) header.checked = items.every((item) => item.checked);
}

export function getSelectedDivisions(component) {
  return [...component.divisionChooser.querySelectorAll('.division-list-items input:checked')]
    .map((element) => element.value);
}

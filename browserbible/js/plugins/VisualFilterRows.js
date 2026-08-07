import { elem } from '../lib/helpers.esm.js';

const CELL_COUNT = 5;

export function createFilterRow() {
  const fragment = document.createDocumentFragment();
  const active = elem('div', { className: 'visualfilters-active visualfilters-cell', dataset: { rowStart: 'true' } });
  active.appendChild(elem('input', { type: 'checkbox', checked: true }));
  const strongs = elem('div', { className: 'visualfilters-strongs visualfilters-cell' });
  strongs.appendChild(elem('input', { type: 'text', placeholder: 'G2424, H234' }));
  const morph = elem('div', { className: 'visualfilters-morph visualfilters-cell' });
  const morphSelect = elem('select');
  morphSelect.appendChild(elem('option', { value: 'morphhb', textContent: 'Hebrew' }));
  morphSelect.appendChild(elem('option', { value: 'robinson', textContent: 'Greek' }));
  morph.append(morphSelect, elem('input', { type: 'text', placeholder: 'V-A?' }));
  const style = elem('div', { className: 'visualfilters-style visualfilters-cell' });
  const styleSelect = elem('select', { className: 'style-type' });
  styleSelect.appendChild(elem('option', { value: 'text', textContent: 'Text Color' }));
  styleSelect.appendChild(elem('option', { value: 'background', textContent: 'Background' }));
  styleSelect.appendChild(elem('option', { value: 'underline', textContent: 'Underline' }));
  style.append(styleSelect, elem('input', { type: 'color', className: 'style-color', value: '#ff3333' }));
  const remove = elem('div', { className: 'visualfilters-remove visualfilters-cell' });
  remove.appendChild(elem('span', { className: 'close-button' }));
  fragment.append(active, strongs, morph, style, remove);
  return fragment;
}

function getRowCells(startCell) {
  const cells = [startCell];
  let next = startCell.nextElementSibling;
  while (cells.length < CELL_COUNT && next) {
    cells.push(next);
    next = next.nextElementSibling;
  }
  return cells;
}

const cellWithClass = (cells, className) => cells.find((cell) => cell.classList.contains(className));

function compileMorphology(transform) {
  if (!transform.morph) return null;
  const pattern = transform.morph
    .split('?')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.');
  if (transform.morphType === 'robinson') return new RegExp(`^${pattern}`, 'i');
  if (transform.morphType === 'morphhb') return new RegExp(`(?:^H${pattern}|/${pattern})`, 'i');
  return null;
}

function readTransform(startCell) {
  const cells = getRowCells(startCell);
  const active = cellWithClass(cells, 'visualfilters-active');
  const strongs = cellWithClass(cells, 'visualfilters-strongs');
  const morph = cellWithClass(cells, 'visualfilters-morph');
  const style = cellWithClass(cells, 'visualfilters-style');
  const styleType = style?.querySelector('.style-type')?.value ?? 'text';
  const styleColor = style?.querySelector('.style-color')?.value ?? '#ff3333';
  const transform = {
    active: active?.querySelector('input')?.checked ?? false,
    strongs: strongs?.querySelector('input')?.value ?? '',
    morph: morph?.querySelector('input')?.value ?? '',
    morphType: morph?.querySelector('select')?.value ?? '',
    styleType,
    styleColor,
    style: buildStyleCss(styleType, styleColor)
  };
  transform.morphRegExp = compileMorphology(transform);
  return transform;
}

export function readTransforms(grid) {
  return [...grid.querySelectorAll('.visualfilters-cell[data-row-start="true"]')].map(readTransform);
}

function populateRow(fragment, transform) {
  fragment.querySelector('.visualfilters-active input').checked = transform.active;
  fragment.querySelector('.visualfilters-strongs input').value = transform.strongs;
  fragment.querySelector('.visualfilters-morph input').value = transform.morph;
  fragment.querySelector('.visualfilters-morph select').value = transform.morphType;
  fragment.querySelector('.visualfilters-style .style-type').value = transform.styleType || 'text';
  fragment.querySelector('.visualfilters-style .style-color').value = transform.styleColor || '#ff3333';
}

export function drawTransforms(grid, transforms) {
  grid.querySelectorAll('.visualfilters-cell').forEach((cell) => cell.remove());
  for (const transform of transforms) {
    const row = createFilterRow();
    populateRow(row, transform);
    grid.appendChild(row);
  }
}

export function removeFilterRow(target) {
  let startCell = target.closest('.visualfilters-cell');
  while (startCell && startCell.dataset.rowStart !== 'true') {
    startCell = startCell.previousElementSibling;
  }
  if (startCell) getRowCells(startCell).forEach((cell) => cell.remove());
}

function buildStyleCss(styleType, color) {
  if (styleType === 'background') return `background-color: ${color};`;
  if (styleType === 'underline') return `border-bottom: solid 2px ${color};`;
  return `color: ${color};`;
}

import { elem } from '../lib/helpers.esm.js';

const COLORS = [
  { name: 'yellow', value: '#ff7' },
  { name: 'green', value: '#ada' },
  { name: 'blue', value: '#9cf' },
  { name: 'pink', value: '#f8b' },
  { name: 'orange', value: '#fc8' }
];

export function createPalette(onColorPick, onErase) {
  const palette = elem('div', { className: 'highlighter-palette', style: { display: 'none' } });
  for (const color of COLORS) {
    const swatch = elem('div', {
      className: 'color-swatch',
      title: color.name,
      dataset: { color: color.value },
      style: { backgroundColor: color.value }
    });
    swatch.addEventListener('click', (event) => {
      event.stopPropagation();
      onColorPick(color.value);
    });
    palette.appendChild(swatch);
  }
  const eraser = elem('div', { className: 'eraser', title: 'Remove highlight', textContent: '\u2715' });
  eraser.addEventListener('click', (event) => {
    event.stopPropagation();
    onErase();
  });
  palette.appendChild(eraser);
  document.body.appendChild(palette);
  return palette;
}

export function showPalette(palette, x, y, activeColor) {
  palette.style.display = 'flex';
  palette.style.left = `${x}px`;
  palette.style.top = `${y}px`;
  palette.querySelectorAll('.color-swatch').forEach((swatch) => {
    swatch.classList.toggle('selected', swatch.dataset.color === activeColor);
  });
  requestAnimationFrame(() => {
    const rect = palette.getBoundingClientRect();
    if (rect.right > window.innerWidth) palette.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) palette.style.top = `${y - rect.height - 8}px`;
  });
}

export function hidePalette(palette) {
  palette.style.display = 'none';
}

import { elem } from './helpers.esm.js';

const SPIRAL_ANGLE_STEP = 0.4;
const SPIRAL_RADIUS_PER_TURN = 4;
const WORD_GAP = 6;
const STAGGER_MS = 18;
const STAGGER_MAX_MS = 700;
const ROTATE_RATIO = 0.35;
const EDGE_PAD_X = 24;

export function renderWordCloud(container, options) {
  const {
    list = [],
    weightFactor = (w) => w,
    color = () => '#333',
    hover = null,
    click = null,
    minSize = 0
  } = options;

  container.innerHTML = '';

  Object.assign(container.style, {
    position: 'relative',
    overflow: 'hidden'
  });

  const width = container.clientWidth || 300;
  const height = parseFloat(window.getComputedStyle(container).minHeight) || container.clientHeight || 225;
  container.style.height = `${height}px`;

  const entries = list
    .map(([word, weight]) => ({ word, weight, size: weightFactor(weight) }))
    .filter((entry) => entry.size >= minSize)
    .sort((a, b) => b.size - a.size);

  const placedRects = [];
  const bounds = {
    cx: width / 2,
    cy: height / 2,
    width,
    height,
    xStretch: Math.max(1, width / height)
  };

  let placedCount = 0;

  for (const entry of entries) {
    const span = createWordSpan(entry, color, hover, click);
    container.appendChild(span);

    const spanW = span.offsetWidth + WORD_GAP;
    const spanH = span.offsetHeight + 2;

    const { spot, rotation } =
      placeWord(spanW, spanH, pickRotation(entry === entries[0]), bounds, placedRects);

    if (!spot) {
      span.remove();
      continue;
    }

    placedRects.push(spot);
    span.style.left = `${spot.x + (spot.w - spanW) / 2}px`;
    span.style.top = `${spot.y + (spot.h - spanH) / 2}px`;
    if (rotation) span.style.rotate = `${rotation}deg`;
    span.style.visibility = 'visible';
    span.style.animationDelay = `${Math.min(placedCount * STAGGER_MS, STAGGER_MAX_MS)}ms`;
    placedCount++;

    bindWordEvents(span, entry, hover, click);
  }
}

function createWordSpan(entry, color, hover, click) {
  return elem('span', {
    textContent: entry.word,
    className: 'wordcloud-word',
    dataset: { word: entry.word, weight: entry.weight },
    style: {
      position: 'absolute',
      left: '0px',
      top: '0px',
      visibility: 'hidden',
      fontSize: `${entry.size}px`,
      color: color(entry.word, entry.weight),
      cursor: (hover || click) ? 'pointer' : 'default',
      display: 'inline-block',
      lineHeight: '1.1',
      whiteSpace: 'nowrap'
    }
  });
}

function pickRotation(isFirst) {
  if (isFirst || Math.random() > ROTATE_RATIO) return 0;
  return Math.random() < 0.5 ? 90 : -90;
}

function placeWord(spanW, spanH, rotation, bounds, placedRects) {
  const spot = findSpot(rotation ? spanH : spanW, rotation ? spanW : spanH, bounds, placedRects);
  if (spot || !rotation) return { spot, rotation };
  return { spot: findSpot(spanW, spanH, bounds, placedRects), rotation: 0 };
}

function bindWordEvents(span, entry, hover, click) {
  if (hover) {
    span.addEventListener('mouseenter', () => {
      span.style.transform = 'scale(1.12)';
      hover([entry.word, entry.weight]);
    });

    span.addEventListener('mouseleave', () => {
      span.style.transform = '';
      hover(null);
    });
  }

  if (click) {
    span.addEventListener('click', () => click([entry.word, entry.weight]));
  }
}

function findSpot(w, h, bounds, placedRects) {
  const { cx, cy, width, height, xStretch } = bounds;
  const maxRadius = Math.max(width, height);
  let angle = Math.random() * Math.PI * 2;

  for (let radius = 0; radius < maxRadius; angle += SPIRAL_ANGLE_STEP, radius = SPIRAL_RADIUS_PER_TURN * angle) {
    const x = cx + radius * Math.cos(angle) * xStretch - w / 2;
    const y = cy + radius * Math.sin(angle) - h / 2;

    if (x < EDGE_PAD_X || y < 0 || x + w > width - EDGE_PAD_X || y + h > height) continue;

    if (!placedRects.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y)) {
      return { x, y, w, h };
    }
  }

  return null;
}

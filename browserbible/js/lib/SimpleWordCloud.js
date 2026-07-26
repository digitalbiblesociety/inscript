/** CSS/flexbox word cloud, no canvas. */

import { elem } from './helpers.esm.js';

/**
 * `options.list` holds [word, weight] tuples. `weightFactor` maps a weight to a
 * pixel font size, `color` to a CSS color, and `hover` fires with the entry
 * under the pointer or null.
 */
export function renderWordCloud(container, options) {
  const {
    list = [],
    weightFactor = (w) => w,
    color = () => '#333',
    hover = null,
    minSize = 0
  } = options;

  container.innerHTML = '';

  Object.assign(container.style, {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    alignContent: 'center',
    gap: '0.4em',
    overflow: 'hidden',
    padding: '1em'
  });

  const filteredList = list.filter(([, weight]) => {
    const size = weightFactor(weight);
    return size >= minSize;
  });

  const shuffledList = shuffleArray([...filteredList]);

  for (const [word, weight] of shuffledList) {
    const size = weightFactor(weight);
    const wordColor = color(word, weight);

    const span = elem('span', {
      textContent: word,
      className: 'wordcloud-word',
      dataset: { word, weight },
      style: {
        fontSize: `${size}px`,
        color: wordColor,
        cursor: hover ? 'pointer' : 'default',
        transition: 'transform 0.15s ease, opacity 0.15s ease',
        display: 'inline-block',
        lineHeight: '1.1',
        whiteSpace: 'nowrap'
      }
    });

    if (hover) {
      span.addEventListener('mouseenter', () => {
        span.style.transform = 'scale(1.15)';
        span.style.opacity = '0.85';
        hover([word, weight]);
      });

      span.addEventListener('mouseleave', () => {
        span.style.transform = 'scale(1)';
        span.style.opacity = '1';
        hover(null);
      });
    }

    container.appendChild(span);
  }
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

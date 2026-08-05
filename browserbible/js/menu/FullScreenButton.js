import fullscreenSvg from '../../css/images/fullscreen.svg?raw';

export function FullScreenButton(container) {
  const d = document;
  if (!d.fullscreenEnabled) return;

  d.documentElement.classList.add('supports-fullscreen');

  const btn = d.createElement('div');
  btn.id = 'main-fullscreen-button';
  btn.innerHTML = fullscreenSvg;

  container.appendChild(btn);

  btn.addEventListener('click', () =>
    d.fullscreenElement ? d.exitFullscreen() : d.documentElement.requestFullscreen()
  );
}

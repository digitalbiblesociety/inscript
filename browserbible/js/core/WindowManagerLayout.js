export function sizeWindows(manager, width, height) {
  if (width && height) {
    manager.nodeEl.style.width = `${width}px`;
    manager.nodeEl.style.height = `${height}px`;
  } else {
    width = manager.nodeEl.offsetWidth;
    height = manager.nodeEl.offsetHeight;
  }
  const compact = width < 560;
  document.body.classList.toggle('compact-ui', compact);
  if (!manager.windows.length) return;
  if (compact) {
    const tabWidth = manager.windows[0].tab.offsetWidth - 10;
    manager.windows.forEach((windowComponent, index) => {
      windowComponent.size(width, height - 26);
      windowComponent.tab.style.right = `${(manager.windows.length - index - 1) * tabWidth}px`;
    });
    return;
  }
  const style = window.getComputedStyle(manager.windows[0].node);
  const margin = (parseInt(style.marginLeft, 10) || 0) + (parseInt(style.marginRight, 10) || 0);
  const availableWidth = width - margin * manager.windows.length;
  if (manager.windowWidths.length !== manager.windows.length) manager._resetWindowWidths();
  let position = 0;
  manager.windows.forEach((windowComponent, index) => {
    const windowWidth = Math.floor(availableWidth * manager.windowWidths[index]);
    windowComponent.size(windowWidth, height);
    position += windowWidth + margin;
    if (index < manager.splitters.length) {
      manager.splitters[index].style.left = `${position - 4}px`;
      manager.splitters[index].style.height = `${height}px`;
    }
  });
}

export const getViewTransform = (viewBox, containerRect) => {
  const scale = Math.max(
    containerRect.width / viewBox.width,
    containerRect.height / viewBox.height
  );
  const offsetX = (containerRect.width - viewBox.width * scale) / 2;
  const offsetY = (containerRect.height - viewBox.height * scale) / 2;
  return { scale, offsetX, offsetY };
};

/** Container-relative screen px → SVG coordinate. */
export const screenToSvg = (px, py, viewBox, t) => ({
  x: viewBox.x + (px - t.offsetX) / t.scale,
  y: viewBox.y + (py - t.offsetY) / t.scale
});

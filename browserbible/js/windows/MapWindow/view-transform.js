/**
 * Maps SVG (viewBox) coordinates to and from on-screen container pixels.
 *
 * The SVG is rendered with preserveAspectRatio="xMidYMid slice" (cover): the viewBox
 * is scaled to FILL the container with no letterbox, cropping whatever overflows.
 * A single uniform scale plus a centring offset (≤ 0 when content overflows) describes
 * that mapping — markers (HTML overlay) and pointer math must use the same transform
 * as the SVG so they stay pixel-aligned with the basemap. Combined with viewBox-aspect
 * tracking (so the crop is near-zero) and a strict viewBox clamp (so the viewBox never
 * leaves the map), this guarantees the map always fills the panel with no empty bars
 * and no out-of-map void.
 */

/** `scale` is screen px per SVG unit; `offsetX/Y` centre it, going negative on overflow. */
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

export interface RenderedRect {
  width: number;
  height: number;
  left: number;
  top: number;
}

export interface SizeCm {
  w: number;
  h: number;
}

export interface OffsetCm {
  x: number;
  y: number;
}

/**
 * Calculates the actual rendered rectangle of an image within a container using object-fit: contain logic.
 */
export const computeRenderedRect = (
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number
): RenderedRect | null => {
  if (!naturalW || !naturalH || !containerW || !containerH) return null;

  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  const renderW = naturalW * scale;
  const renderH = naturalH * scale;
  const renderLeft = (containerW - renderW) / 2;
  const renderTop = (containerH - renderH) / 2;

  return {
    width: renderW,
    height: renderH,
    left: renderLeft,
    top: renderTop
  };
};

/**
 * Computes the CSS style for an overlay red box based on rendered image rect and cm values.
 */
export const computeOverlayStyle = (
  renderedRect: RenderedRect,
  specsWidthCm: number,
  specsHeightCm: number,
  sizeCm: SizeCm,
  offsetCm: OffsetCm
): React.CSSProperties => {
  const specsW = specsWidthCm || 10;
  const specsH = specsHeightCm || 10;

  const scaleX = renderedRect.width / specsW;
  const scaleY = renderedRect.height / specsH;

  return {
    display: 'block',
    position: 'absolute',
    border: '2px solid red',
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    width: `${sizeCm.w * scaleX}px`,
    height: `${sizeCm.h * scaleY}px`,
    left: `${renderedRect.left + offsetCm.x * scaleX}px`,
    top: `${renderedRect.top + offsetCm.y * scaleY}px`,
    pointerEvents: 'none',
    boxSizing: 'border-box',
    zIndex: 10
  };
};

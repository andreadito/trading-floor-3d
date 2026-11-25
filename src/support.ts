// Dependency-free capability checks, run before the 3D app (three, AG Grid, ECharts) is loaded.

export function supportsHtmlInCanvas(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('content', 'drawable');
  return (
    (canvas as HTMLCanvasElement & { content?: string }).content === 'drawable' &&
    typeof WebGL2RenderingContext !== 'undefined' &&
    'texElementSubImage2D' in WebGL2RenderingContext.prototype
  );
}

/**
 * Walking the floor needs a mouse or trackpad (pointer lock) and a keyboard. Only treat a
 * device as touch-only when it has touch input and no fine pointer at all: some desktop
 * environments (headless Chrome, remote sessions) report no pointer of either kind.
 */
export function isTouchOnly(): boolean {
  const hasTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  return hasTouch && !window.matchMedia('(any-pointer: fine)').matches;
}

export type Unsupported = 'browser' | 'touch';

export function unsupportedReason(): Unsupported | null {
  if (!supportsHtmlInCanvas()) return 'browser';
  if (isTouchOnly()) return 'touch';
  return null;
}

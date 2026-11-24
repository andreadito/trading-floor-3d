// Type declarations for Chrome's HTML-in-Canvas API (stable in Chrome 157).
// Surface verified against Chrome 158 by runtime introspection.

interface ElementImageSize {
  width: number;
  height: number;
}

interface ElementGeometryOptions {
  /** Maps element CSS px to the canvas's CSS box (origin: canvas top-left). 3D/perspective matrices are accepted. */
  canvasTransform?: DOMMatrix;
  /** Default false: the updated element moves to the top of the hit-test stack. */
  preserveHitTestOrder?: boolean;
}

interface CanvasPaintEvent extends Event {
  /** Drawable descendants whose rendering changed since the previous paint. */
  readonly changedElements: ReadonlyArray<Element>;
}

interface HTMLCanvasElement {
  content: string;
  onpaint: ((this: HTMLCanvasElement, ev: CanvasPaintEvent) => unknown) | null;
  requestPaint(): void;
  updateElementGeometry(element: Element, options: ElementGeometryOptions): void;
  clearElementGeometry(element: Element): void;
  /** Size in canvas-grid pixels. Throws until the element has a cached paint record. */
  getElementImageDefaultSize(element: Element): ElementImageSize;
}

interface HTMLElementEventMap {
  paint: CanvasPaintEvent;
}

interface WebGL2RenderingContext {
  texElementSubImage2D(target: GLenum, level: GLint, xoffset: GLint, yoffset: GLint, element: Element): void;
}

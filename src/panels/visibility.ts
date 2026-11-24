// Panels that are out of view don't need to redraw: DrawableSurfaces reports
// visibility every frame, and renders deferred while hidden run on reappearing.

const visible = new Map<string, boolean>();
const deferred = new Map<string, () => void>();

export function setPanelVisible(id: string, isVisible: boolean) {
  const was = visible.get(id);
  visible.set(id, isVisible);
  if (isVisible && !was) {
    const fn = deferred.get(id);
    if (fn) {
      deferred.delete(id);
      fn();
    }
  }
}

/** Run `render` now if the panel is visible (or unknown yet), otherwise once it comes into view. */
export function whenVisible(id: string, render: () => void) {
  if (visible.get(id) ?? true) render();
  else deferred.set(id, render);
}

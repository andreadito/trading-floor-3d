// Bridges Chrome's HTML-in-Canvas API and Three.js.
//
// Each panel is a `drawable` child of the WebGL canvas. When it repaints, the
// canvas fires `paint` with the changed elements; we mark those dirty and, in
// the render loop, upload them with `gl.texElementSubImage2D` into a WebGL
// texture we own (wrapped in THREE.ExternalTexture). Uploads are throttled by
// distance and skipped while a panel is off screen.
//
// Every frame we also project each panel's 3D quad back to the screen and call
// `canvas.updateElementGeometry` with that perspective matrix, so real mouse
// events, hover and focus reach the AG Grid / ECharts DOM where the panel is
// drawn in 3D.

import * as THREE from 'three';
import { setPanelVisible } from './panels/visibility';

export { supportsHtmlInCanvas } from './support';

export interface SurfaceSpec {
  id: string;
  label: string;
  element: HTMLElement;
  mesh: THREE.Mesh;
  /** World-space size of the plane the element is mapped onto. */
  planeWidth: number;
  planeHeight: number;
  /** Panels that are not a flat plane (the ticker ring) get no hit-test geometry. */
  interactive?: boolean;
  wrapRepeat?: boolean;
  /** Cap on uploads per second regardless of distance. */
  maxHz?: number;
}

export class Surface {
  readonly texture = new THREE.ExternalTexture(null);
  glTexture: WebGLTexture | null = null;
  texWidth = 0;
  texHeight = 0;
  dirty = true;
  hasImage = false;
  lastUpload = -Infinity;
  uploads = 0;
  geometryActive = false;
  distance = 0;
  visible = false;
  constructor(readonly spec: SurfaceSpec) {}
  get cssWidth() {
    return this.spec.element.offsetWidth || parseFloat(this.spec.element.style.width) || 0;
  }
  get cssHeight() {
    return this.spec.element.offsetHeight || parseFloat(this.spec.element.style.height) || 0;
  }
}

export interface SurfaceStats {
  uploadsPerSec: number;
  mbPerSec: number;
  textureMB: number;
  surfaces: number;
}

const FRAME_UPLOAD_BUDGET_BYTES = 48 * 1024 * 1024;

export class DrawableSurfaces {
  readonly surfaces: Surface[] = [];
  readonly stats: SurfaceStats = { uploadsPerSec: 0, mbPerSec: 0, textureMB: 0, surfaces: 0 };
  focusedId: string | null = null;

  private byElement = new Map<Element, Surface>();
  private gl: WebGL2RenderingContext;
  private maxAniso = 1;
  private anisoExt: EXT_texture_filter_anisotropic | null;
  private window = { start: performance.now(), uploads: 0, bytes: 0 };
  private lastGeometryKey = '';
  private frustum = new THREE.Frustum();
  private tmp = {
    m: new THREE.Matrix4(),
    vp: new THREE.Matrix4(),
    el: new THREE.Matrix4(),
    v4: new THREE.Vector4(),
    pos: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    toCam: new THREE.Vector3(),
    q: new THREE.Quaternion(),
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private renderer: THREE.WebGLRenderer,
  ) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.anisoExt = this.gl.getExtension('EXT_texture_filter_anisotropic');
    if (this.anisoExt) this.maxAniso = Math.min(8, this.gl.getParameter(this.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT));

    canvas.addEventListener('paint', (event) => {
      for (const el of event.changedElements) {
        const s = this.byElement.get(el);
        if (s) s.dirty = true;
      }
    });
  }

  add(spec: SurfaceSpec): Surface {
    spec.element.setAttribute('drawable', '');
    if (spec.element.parentElement !== this.canvas) this.canvas.appendChild(spec.element);
    const s = new Surface(spec);
    this.surfaces.push(s);
    this.byElement.set(spec.element, s);
    const mat = spec.mesh.material as THREE.ShaderMaterial;
    mat.uniforms.map.value = s.texture;
    this.stats.surfaces = this.surfaces.length;
    return s;
  }

  get(id: string) {
    return this.surfaces.find((s) => s.spec.id === id);
  }

  /**
   * Fix the hit-test stacking order, bottom to top. In Chrome 158 the stack order is set by the
   * order in which elements first receive geometry; later updates (and clears) never reorder them,
   * even without preserveHitTestOrder. So we assign a throwaway transform to every interactive
   * panel once, in the order we want, and clear it again before the first real frame.
   */
  establishStacking(bottomToTop: string[]) {
    const tiny = new DOMMatrix().scale(1e-4, 1e-4);
    for (const id of bottomToTop) {
      const s = this.get(id);
      if (!s || s.spec.interactive === false) continue;
      this.canvas.updateElementGeometry(s.spec.element, { canvasTransform: tiny });
      this.canvas.clearElementGeometry(s.spec.element);
    }
  }

  /** Force every panel to re-upload (after a resize or DPR change). */
  invalidateAll() {
    for (const s of this.surfaces) s.dirty = true;
    this.lastGeometryKey = '';
    this.canvas.requestPaint();
  }

  /** Call once per frame before rendering. */
  update(camera: THREE.PerspectiveCamera, now: number) {
    this.computeVisibility(camera);
    this.syncGeometry(camera);
    this.uploadDirty(now);
    this.rollStats(now);
  }

  private computeVisibility(camera: THREE.PerspectiveCamera) {
    const { m, pos, normal, toCam, q } = this.tmp;
    m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(m);
    for (const s of this.surfaces) {
      const mesh = s.spec.mesh;
      mesh.getWorldPosition(pos);
      s.distance = pos.distanceTo(camera.position);
      let visible = this.frustum.intersectsObject(mesh);
      if (visible && s.spec.interactive !== false) {
        normal.set(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(q));
        toCam.subVectors(camera.position, pos);
        visible = normal.dot(toCam) > 0;
      }
      s.visible = visible;
      setPanelVisible(s.spec.id, visible);
    }
  }

  private uploadDirty(now: number) {
    const focused = this.focusedId;
    const candidates = this.surfaces.filter((s) => {
      if (!s.dirty) return false;
      if (s.hasImage && !s.visible) return false; // stays dirty until it comes into view
      const isFocused = s.spec.id === focused;
      let hz = isFocused ? 60 : s.distance < 6 ? 12 : s.distance < 14 ? 6 : 3;
      if (s.spec.maxHz) hz = Math.min(hz, s.spec.maxHz);
      return now - s.lastUpload >= 1000 / hz - 1;
    });
    if (!candidates.length) return;
    candidates.sort((a, b) => (a.spec.id === focused ? -1 : b.spec.id === focused ? 1 : a.distance - b.distance));

    const gl = this.gl;
    let budget = FRAME_UPLOAD_BUDGET_BYTES;
    let touched = false;
    for (const s of candidates) {
      let size: ElementImageSize;
      try {
        size = this.canvas.getElementImageDefaultSize(s.spec.element);
      } catch {
        continue; // no paint record yet
      }
      const w = Math.max(1, Math.ceil(size.width));
      const h = Math.max(1, Math.ceil(size.height));
      const bytes = w * h * 4;
      if (bytes > budget && touched) break;
      if (w !== s.texWidth || h !== s.texHeight) this.allocate(s, w, h);
      gl.bindTexture(gl.TEXTURE_2D, s.glTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // match Three's UV convention (v=1 at the top)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      try {
        gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, s.spec.element);
      } catch (err) {
        console.warn(`[drawable] upload failed for ${s.spec.id}`, err);
        continue;
      }
      gl.generateMipmap(gl.TEXTURE_2D);
      touched = true;
      budget -= bytes;
      s.dirty = false;
      s.lastUpload = now;
      s.uploads++;
      this.window.uploads++;
      this.window.bytes += bytes;
      if (!s.hasImage) {
        s.hasImage = true;
        (s.spec.mesh.material as THREE.ShaderMaterial).uniforms.hasMap.value = 1;
      }
    }
    if (touched) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      this.renderer.resetState(); // we changed bindings behind Three's back
    }
  }

  private allocate(s: Surface, w: number, h: number) {
    const gl = this.gl;
    if (s.glTexture) gl.deleteTexture(s.glTexture);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const levels = Math.floor(Math.log2(Math.max(w, h))) + 1;
    gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, s.spec.wrapRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.anisoExt) gl.texParameterf(gl.TEXTURE_2D, this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, this.maxAniso);
    s.glTexture = tex;
    s.texWidth = w;
    s.texHeight = h;
    s.texture.sourceTexture = tex;
    this.stats.textureMB = this.surfaces.reduce((sum, x) => sum + (x.texWidth * x.texHeight * 4 * 4) / 3, 0) / (1024 * 1024);
  }

  /**
   * Hit-test geometry: element CSS px -> plane local -> world -> clip -> canvas CSS px,
   * as one 4x4 projective matrix (the same thing a CSS matrix3d() would be).
   */
  private syncGeometry(camera: THREE.PerspectiveCamera) {
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const { m, vp, el, v4 } = this.tmp;
    vp.set(cw / 2, 0, 0, cw / 2, 0, -ch / 2, 0, ch / 2, 0, 0, 1, 0, 0, 0, 0, 1);

    const placed: Array<{ s: Surface; matrix: THREE.Matrix4 }> = [];
    let key = `${cw}x${ch}`;
    for (const s of this.surfaces) {
      if (s.spec.interactive === false) continue;
      const W = s.cssWidth;
      const H = s.cssHeight;
      let ok = s.visible && W > 0 && H > 0;
      if (ok) {
        const { planeWidth: pw, planeHeight: ph } = s.spec;
        el.set(pw / W, 0, 0, -pw / 2, 0, -ph / H, 0, ph / 2, 0, 0, 1, 0, 0, 0, 0, 1);
        m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(s.spec.mesh.matrixWorld).multiply(el);
        // All four corners must be in front of the camera, otherwise the projective map folds.
        for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
          v4.set(x, y, 0, 1).applyMatrix4(m);
          if (v4.w <= camera.near) ok = false;
        }
        if (ok) {
          const full = new THREE.Matrix4().multiplyMatrices(vp, m);
          placed.push({ s, matrix: full });
          key += `|${s.spec.id}:${full.elements.map((e) => e.toFixed(4)).join(',')}`;
        }
      }
      if (!ok && s.geometryActive) {
        this.canvas.clearElementGeometry(s.spec.element);
        s.geometryActive = false;
        key += `|${s.spec.id}:off`;
      }
    }
    if (key === this.lastGeometryKey) return;
    this.lastGeometryKey = key;
    // Stacking where panels overlap on screen was fixed once by establishStacking().
    for (const { s, matrix } of placed) {
      this.canvas.updateElementGeometry(s.spec.element, { canvasTransform: DOMMatrix.fromFloat64Array(new Float64Array(matrix.elements)) });
      s.geometryActive = true;
    }
  }

  private rollStats(now: number) {
    const elapsed = now - this.window.start;
    if (elapsed < 1000) return;
    this.stats.uploadsPerSec = (this.window.uploads * 1000) / elapsed;
    this.stats.mbPerSec = (this.window.bytes * 1000) / elapsed / (1024 * 1024);
    this.window = { start: now, uploads: 0, bytes: 0 };
  }
}

/** Unlit material that shows a panel texture with its exact DOM colours. */
export function createScreenMaterial(opts: { idleColor?: THREE.ColorRepresentation; repeatX?: number } = {}) {
  const idle = new THREE.Color(opts.idleColor ?? 0x0b1220);
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: null },
      hasMap: { value: 0 },
      idleColor: { value: new THREE.Vector3(idle.r, idle.g, idle.b) },
      uvRepeat: { value: new THREE.Vector2(opts.repeatX ?? 1, 1) },
      uvOffset: { value: new THREE.Vector2(0, 0) },
      // Kept below the bloom threshold so text on the screens never blooms.
      brightness: { value: 0.86 },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float hasMap;
      uniform vec3 idleColor;
      uniform vec2 uvRepeat;
      uniform vec2 uvOffset;
      uniform float brightness;
      uniform float time;
      varying vec2 vUv;
      vec3 srgbToLinear(vec3 c) {
        return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
      }
      void main() {
        vec3 color;
        if (hasMap > 0.5) {
          // The panel texture holds sRGB bytes; the render pipeline works in linear and
          // OutputPass converts back, so panel colours come out exactly as in the DOM.
          color = srgbToLinear(texture2D(map, vUv * uvRepeat + uvOffset).rgb);
        } else {
          // Not painted yet: a soft scanning bar.
          float bar = smoothstep(0.08, 0.0, abs(fract(vUv.y - time * 0.4) - 0.5));
          color = srgbToLinear(idleColor + vec3(0.05, 0.09, 0.16) * bar);
        }
        gl_FragColor = vec4(color * brightness, 1.0);
      }`,
  });
}

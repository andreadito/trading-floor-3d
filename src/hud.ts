// Screen-space overlay (normal DOM, outside the canvas).

import type { FloorControls } from './controls';
import type { SurfaceStats } from './drawable';
import { AUTHOR } from './panels/sign';

export class Hud {
  private root: HTMLElement;
  private stats: HTMLElement;
  private hint: HTMLElement;
  private target: HTMLElement;
  private crosshair: HTMLElement;
  private intro: HTMLElement;
  private frames = 0;
  private fpsWindow = performance.now();
  private fps = 0;

  constructor(
    host: HTMLElement,
    private controls: FloorControls,
    supported: boolean,
  ) {
    host.innerHTML = `
      <div class="hud-title">
        <strong>Trading Floor 3D</strong>
        <span>Simulated market data · live AG Grid &amp; ECharts rendered with HTML-in-Canvas</span>
        <span class="hud-author">Built by ${AUTHOR} · <a href="how-it-was-built">How it was built</a></span>
      </div>
      <pre class="hud-stats" aria-hidden="true"></pre>
      <div class="hud-crosshair" aria-hidden="true"></div>
      <div class="hud-target"></div>
      <div class="hud-hint"></div>
      <div class="hud-intro">
        <div class="hud-card">
          <h1>Trading Floor 3D</h1>
          ${
            supported
              ? `<p>Every screen in the room is a live AG Grid, ECharts chart or HTML panel, drawn into WebGL with Chrome's HTML-in-Canvas API, and still clickable.</p>
                 <button type="button" class="hud-enter">Click to enter</button>`
              : `<p class="hud-warn">This browser does not support HTML-in-Canvas. Open the demo in Chrome 157 or later.</p>`
          }
          <p class="hud-how"><a href="how-it-was-built">How it was built →</a></p>
          <dl>
            <dt>W A S D</dt><dd>Walk (Shift to run)</dd>
            <dt>Mouse</dt><dd>Look around</dd>
            <dt>Click / E</dt><dd>Use the screen under the crosshair</dd>
            <dt>Q</dt><dd>Step back from a screen and keep walking</dd>
            <dt>Esc</dt><dd>Free the cursor</dd>
            <dt>Tour</dt><dd>Grids, charts and order ticket at the desks · risk controls and options on the back wall · analytics on the side walls</dd>
          </dl>
        </div>
      </div>`;
    this.root = host;
    this.stats = host.querySelector('.hud-stats')!;
    this.hint = host.querySelector('.hud-hint')!;
    this.target = host.querySelector('.hud-target')!;
    this.crosshair = host.querySelector('.hud-crosshair')!;
    this.intro = host.querySelector('.hud-intro')!;
    host.querySelector('.hud-enter')?.addEventListener('click', () => controls.lock());
    this.refresh();
  }

  refresh() {
    const c = this.controls;
    this.root.dataset.mode = c.mode;
    this.intro.hidden = c.mode !== 'intro';
    this.crosshair.hidden = c.mode !== 'walk';
    this.crosshair.classList.toggle('active', !!c.hovered);
    this.target.textContent = c.mode === 'walk' && c.hovered ? `Click or E · use ${c.hovered.label}` : '';
    this.hint.textContent =
      c.mode === 'walk'
        ? 'WASD to walk · Shift to run · Esc to free the cursor'
        : c.mode === 'focus'
          ? `${c.focused?.label ?? ''} · use it with the mouse and keyboard · Q or click empty space to walk · Esc to step back`
          : c.mode === 'paused'
            ? 'Screens are still live and clickable at any angle · click empty space to walk'
            : '';
  }

  tick(now: number, stats: SurfaceStats, renderer: { calls: number; triangles: number }) {
    this.frames++;
    if (now - this.fpsWindow < 500) return;
    this.fps = (this.frames * 1000) / (now - this.fpsWindow);
    this.frames = 0;
    this.fpsWindow = now;
    this.stats.textContent = [
      `fps        ${this.fps.toFixed(0)}`,
      `uploads/s  ${stats.uploadsPerSec.toFixed(1)}`,
      `upload     ${stats.mbPerSec.toFixed(0)} MB/s`,
      `textures   ${stats.textureMB.toFixed(0)} MB (${stats.surfaces} panels)`,
      `draw calls ${renderer.calls}`,
    ].join('\n');
  }
}

import * as THREE from 'three';
import './style.css';
import { FloorControls, type FocusTarget } from './controls';
import { DrawableSurfaces, supportsHtmlInCanvas } from './drawable';
import { MarketFeed } from './feed';
import { Hud } from './hud';
import { createCorrelation, createDepthChart, createExposureChart, createFlowSankey, createMarketMap, createPnlChart, createPriceChart, createVolSurface } from './panels/charts';
import { createAlerts, createTicker } from './panels/feeds';
import { createBlotter, createCrossAsset, createMarketWatch, createOptionsChain, createOrderBook, createPositions, createTimeAndSales, createWorkingOrders } from './panels/grids';
import type { Panel } from './panels/panel';
import { createSign } from './panels/sign';
import { createOrderTicket, createRiskControls } from './panels/trading';
import { BLOOM_STRENGTH, createPost } from './post';
import { buildWorld } from './world';

const canvas = document.querySelector<HTMLCanvasElement>('#floor')!;
const params = new URLSearchParams(location.search);
// Texture resolution follows the canvas pixel ratio (one texel per device pixel at 1:1).
// Default cap 1.5 keeps ~20 panels around 150 MB of texture; ?dpr=2 for full retina, ?dpr=1 to save memory.
const pixelRatio = Math.min(window.devicePixelRatio || 1, Number(params.get('dpr')) || 1.5);
// ?fx=low drops the floor reflection and bloom for weaker GPUs.
const lowFx = params.get('fx') === 'low';
const supported = supportsHtmlInCanvas();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NoToneMapping; // panel colours must come out exactly as in the DOM
renderer.info.autoReset = false; // count draw calls across all passes (reset once per frame)

const world = buildWorld(renderer, { reflections: !lowFx });
const { camera, scene } = world;
camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();
const post = createPost(renderer, scene, camera, { bloom: !lowFx });

const feed = new MarketFeed();
const panels: Panel[] = [
  createBlotter(feed),
  createPriceChart(feed),
  createPnlChart(feed),
  createCorrelation(feed),
  createExposureChart(feed),
  createVolSurface(feed),
  createMarketMap(feed),
  createAlerts(feed),
  createDepthChart(feed),
  createOptionsChain(feed),
  createRiskControls(feed),
  createFlowSankey(feed),
  createMarketWatch(feed),
  createOrderBook(feed),
  createPositions(feed),
  createOrderTicket(feed),
  createWorkingOrders(feed),
  createTimeAndSales(feed),
  createCrossAsset(feed),
];

const surfaces = new DrawableSurfaces(canvas, renderer);
const targets: FocusTarget[] = [];
for (const panel of panels) {
  const slot = world.slots.get(panel.id);
  if (!slot) throw new Error(`No screen placement for panel ${panel.id}`);
  surfaces.add({ id: panel.id, label: panel.label, element: panel.root, mesh: slot.mesh, planeWidth: slot.planeWidth, planeHeight: slot.planeHeight });
  targets.push({
    id: panel.id,
    label: panel.label,
    mesh: slot.mesh,
    planeWidth: slot.planeWidth,
    planeHeight: slot.planeHeight,
    cssWidth: parseFloat(panel.root.style.width),
    cssHeight: parseFloat(panel.root.style.height),
  });
}
surfaces.add({ id: 'ticker', label: 'Ticker', element: createTicker(feed), mesh: world.ticker.mesh, planeWidth: 0, planeHeight: 0, interactive: false, wrapRepeat: true, maxHz: 2 });
surfaces.add({ id: 'sign', label: 'Sign', element: createSign(), mesh: world.sign.mesh, planeWidth: 0, planeHeight: 0, interactive: false, maxHz: 1 });

const controls = new FloorControls(camera, canvas, targets, world.colliders);
const hud = new Hud(document.querySelector('#hud')!, controls, supported);
controls.onChange = () => {
  surfaces.focusedId = controls.focused?.id ?? null;
  for (const t of targets) {
    const accent = world.slots.get(t.id)!.accent;
    if (accent) accent.scale.y = t === controls.hovered || t === controls.focused ? 3 : 1;
  }
  hud.refresh();
};

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  controls.refit();
  surfaces.invalidateAll();
});

// Room mood: drifts with desk P&L direction over the last ~30s; red alarm while the kill switch is on.
let mood = 0;
const updateMood = () => {
  const h = feed.pnlHistory;
  if (h.length < 2) return;
  const delta = h[h.length - 1].total - h[Math.max(0, h.length - 30)].total;
  mood = Math.max(-1, Math.min(1, delta / 60_000));
};
feed.on('pnl', updateMood);

feed.start();
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  renderer.info.reset();
  controls.update(dt);
  camera.updateMatrixWorld();
  for (const m of world.screenMaterials) m.uniforms.time.value = t;
  world.ticker.material.uniforms.uvOffset.value.x = t * 0.012;
  world.update(t, mood, feed.risk.killed);
  // Ease the bloom off while using a screen, so nearby neon never haloes over its text.
  const bloomTarget = controls.mode === 'focus' ? 0.12 : BLOOM_STRENGTH;
  post.bloom.strength += (bloomTarget - post.bloom.strength) * Math.min(1, dt * 4);
  if (supported) surfaces.update(camera, now);
  post.render();
  hud.tick(now, surfaces.stats, renderer.info.render);
});

// Handle for debugging and for scripts/smoke.mjs.
Object.assign(window, {
  tradingFloor: {
    feed,
    surfaces,
    controls,
    supported,
    focus: (id: string) => {
      const t = targets.find((x) => x.id === id);
      if (t) controls.focus(t);
    },
    unfocus: () => controls.exitFocus(false),
    view: (from: [number, number, number], to: [number, number, number]) => controls.setPose(new THREE.Vector3(...from), new THREE.Vector3(...to)),
  },
});

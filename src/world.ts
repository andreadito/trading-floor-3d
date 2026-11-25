// The trading floor: room, screens, desks, ticker ring, sign and lighting.
//
// Lighting is built for the bloom pass in post.ts: neon strips, light bars and
// the floor grid are HDR (values > 1) so they glow, while panel screens stay
// below the bloom threshold so their text stays sharp. Accent colours follow a
// "mood" (desk P&L up / down, kill-switch alarm) via World.update().

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { createScreenMaterial } from './drawable';

export const ROOM = { halfX: 16, halfZ: 14, height: 8.5 };
export const EYE_HEIGHT = 1.7;

export interface ScreenSlot {
  id: string;
  mesh: THREE.Mesh;
  planeWidth: number;
  planeHeight: number;
  accent: THREE.Mesh | null;
}

interface Placement {
  /** CSS size of the panel; the plane keeps its aspect. */
  css: [number, number];
  width: number;
  position: [number, number, number];
  rotationY: number;
  accent: string;
  desk?: boolean;
  /** Screens that cast a soft area light into the room. */
  areaLight?: boolean;
}

const WALL: [number, number] = [1080, 608];
const DESK: [number, number] = [820, 600];
const BIG: [number, number] = [1440, 810];
// Front-row monitors face a point behind the desks so one trader sees all three.
const deskRot = (x: number, z: number) => Math.atan2(0 - x, 6.5 - z);
const POD = Math.PI / 2 - 0.3;

const PLACEMENTS: Record<string, Placement> = {
  // North wall
  blotter: { css: BIG, width: 9.6, position: [0, 4.6, -13.8], rotationY: 0, accent: '#3d8bfd', areaLight: true },
  'price-chart': { css: WALL, width: 5.4, position: [-8.9, 4.4, -12.9], rotationY: 0.32, accent: '#38bdf8' },
  'pnl-chart': { css: WALL, width: 5.4, position: [8.9, 4.4, -12.9], rotationY: -0.32, accent: '#a855f7' },
  // East wall
  correlation: { css: WALL, width: 5.4, position: [15.8, 3.6, -8], rotationY: -Math.PI / 2, accent: '#818cf8' },
  exposure: { css: WALL, width: 5.4, position: [15.8, 3.6, -2], rotationY: -Math.PI / 2, accent: '#14b8a6' },
  'vol-surface': { css: WALL, width: 5.4, position: [15.8, 3.6, 4], rotationY: -Math.PI / 2, accent: '#f472b6' },
  // West wall
  'market-map': { css: WALL, width: 5.4, position: [-15.8, 3.6, -8], rotationY: Math.PI / 2, accent: '#4ade80' },
  alerts: { css: WALL, width: 5.4, position: [-15.8, 3.6, -2], rotationY: Math.PI / 2, accent: '#ef4444' },
  'depth-chart': { css: WALL, width: 5.4, position: [-15.8, 3.6, 4], rotationY: Math.PI / 2, accent: '#fb923c' },
  // South wall
  'options-chain': { css: BIG, width: 9.6, position: [0, 4.6, 13.8], rotationY: Math.PI, accent: '#e879f9', areaLight: true },
  'risk-controls': { css: WALL, width: 5.4, position: [-8.9, 4.4, 12.9], rotationY: Math.PI - 0.32, accent: '#ef4444' },
  'flow-sankey': { css: WALL, width: 5.4, position: [8.9, 4.4, 12.9], rotationY: Math.PI + 0.32, accent: '#60a5fa' },
  // Front row of desks
  'market-watch': { css: DESK, width: 1.64, position: [-3.4, 1.47, 0.2], rotationY: deskRot(-3.4, 0.2), accent: '#22c55e', desk: true },
  'order-book': { css: DESK, width: 1.64, position: [0, 1.47, 0], rotationY: 0, accent: '#f59e0b', desk: true },
  positions: { css: DESK, width: 1.64, position: [3.4, 1.47, 0.2], rotationY: deskRot(3.4, 0.2), accent: '#a855f7', desk: true },
  // Side pods
  'order-ticket': { css: DESK, width: 1.64, position: [-8.2, 1.47, 1.4], rotationY: POD, accent: '#22d3ee', desk: true },
  'working-orders': { css: DESK, width: 1.64, position: [-8.2, 1.47, 4.8], rotationY: POD, accent: '#fbbf24', desk: true },
  'time-sales': { css: DESK, width: 1.64, position: [8.2, 1.47, 1.4], rotationY: -POD, accent: '#38bdf8', desk: true },
  'cross-asset': { css: DESK, width: 1.64, position: [8.2, 1.47, 4.8], rotationY: -POD, accent: '#2dd4bf', desk: true },
};

const BASE_NEON = new THREE.Color(0.25, 0.6, 1.0);
const MOOD_UP = new THREE.Color(0.1, 1.0, 0.55);
const MOOD_DOWN = new THREE.Color(1.0, 0.2, 0.4);
const ALARM = new THREE.Color(1.0, 0.05, 0.08);

export interface World {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  slots: Map<string, ScreenSlot>;
  ticker: { mesh: THREE.Mesh; material: THREE.ShaderMaterial };
  sign: { mesh: THREE.Mesh; material: THREE.ShaderMaterial };
  colliders: THREE.Box3[];
  screenMaterials: THREE.ShaderMaterial[];
  /** Per-frame animation. mood in [-1, 1] (desk P&L direction), alarm while the kill switch is on. */
  update(time: number, mood: number, alarm: boolean): void;
}

interface Animated {
  neon: Array<{ material: THREE.MeshBasicMaterial; intensity: number }>;
  moodLights: THREE.PointLight[];
  hemi: THREE.HemisphereLight;
}

type Uniform<T> = { value: T };

export function buildWorld(renderer: THREE.WebGLRenderer, opts: { reflections: boolean }): World {
  RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020309);
  scene.fog = new THREE.FogExp2(0x03050c, 0.014);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.12;

  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 120);
  camera.position.set(0, EYE_HEIGHT, 9.5);

  const anim: Animated = { neon: [], moodLights: [], hemi: new THREE.HemisphereLight(0x6f8fd8, 0x05070c, 0.3) };
  scene.add(anim.hemi);
  const moodColor: Uniform<THREE.Color> = { value: BASE_NEON.clone() };
  const time: Uniform<number> = { value: 0 };

  buildRoom(scene, anim, moodColor, time, opts.reflections, renderer);

  const slots = new Map<string, ScreenSlot>();
  const colliders: THREE.Box3[] = [];
  const screenMaterials: THREE.ShaderMaterial[] = [];
  for (const [id, p] of Object.entries(PLACEMENTS)) {
    const planeWidth = p.width;
    const planeHeight = (p.width * p.css[1]) / p.css[0];
    const group = new THREE.Group();
    group.position.set(...p.position);
    group.rotation.y = p.rotationY;
    scene.add(group);

    const material = createScreenMaterial();
    screenMaterials.push(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), material);
    mesh.name = `screen:${id}`;
    mesh.userData.screenId = id;
    group.add(mesh);

    const bezelDepth = p.desk ? 0.05 : 0.12;
    const bezelPad = p.desk ? 0.035 : 0.08;
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(planeWidth + bezelPad * 2, planeHeight + bezelPad * 2, bezelDepth),
      new THREE.MeshStandardMaterial({ color: 0x080b12, roughness: 0.3, metalness: 0.8 }),
    );
    bezel.position.z = -bezelDepth / 2 - 0.004;
    group.add(bezel);

    // HDR accent bar under each screen: blooms into a soft glow in the panel's colour.
    const accentMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.accent).multiplyScalar(p.desk ? 1.15 : 1.6) });
    const accent = new THREE.Mesh(new THREE.BoxGeometry(planeWidth * 0.98, p.desk ? 0.012 : 0.03, 0.02), accentMat);
    accent.position.set(0, -planeHeight / 2 - bezelPad - (p.desk ? 0.01 : 0.04), 0);
    group.add(accent);

    if (!p.desk) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(planeWidth * 0.6, 0.012, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.accent).multiplyScalar(1.15) }));
      top.position.set(0, planeHeight / 2 + bezelPad + 0.03, 0);
      group.add(top);
    }

    if (p.desk) addDesk(group, planeHeight, new THREE.Color(p.accent), colliders);
    if (p.areaLight) {
      const light = new THREE.RectAreaLight(new THREE.Color(p.accent).lerp(new THREE.Color(0xffffff), 0.5), 2.2, planeWidth, planeHeight);
      light.position.set(0, 0, 0.05);
      light.lookAt(0, 0, 1);
      group.add(light);
    }
    slots.set(id, { id, mesh, planeWidth, planeHeight, accent });
  }

  addDeskLighting(scene);
  addDust(scene, time);

  const ticker = buildTickerRing(scene, anim);
  screenMaterials.push(ticker.material);
  const sign = buildSign(scene);
  screenMaterials.push(sign.material);
  scene.updateMatrixWorld(true);

  const mood = new THREE.Color();
  return {
    scene,
    camera,
    slots,
    ticker,
    sign,
    colliders,
    screenMaterials,
    update(t, moodValue, alarm) {
      time.value = t;
      if (alarm) {
        const pulse = 0.55 + 0.45 * Math.sin(t * 6);
        mood.copy(ALARM).multiplyScalar(0.4 + pulse);
      } else {
        mood.copy(BASE_NEON).lerp(moodValue >= 0 ? MOOD_UP : MOOD_DOWN, Math.min(1, Math.abs(moodValue)) * 0.45);
      }
      moodColor.value.lerp(mood, alarm ? 0.35 : 0.04);
      for (const n of anim.neon) n.material.color.copy(moodColor.value).multiplyScalar(n.intensity);
      for (const l of anim.moodLights) l.color.copy(moodColor.value);
      anim.hemi.color.copy(moodColor.value).multiplyScalar(0.35);
    },
  };
}

// --------------------------------------------------------------------- room

function buildRoom(scene: THREE.Scene, anim: Animated, moodColor: Uniform<THREE.Color>, time: Uniform<number>, reflections: boolean, renderer: THREE.WebGLRenderer) {
  const { halfX, halfZ, height } = ROOM;

  // Floor: a glossy reflector with a glowing grid and a slow ripple from the centre.
  const floorGeo = new THREE.PlaneGeometry(halfX * 2, halfZ * 2);
  if (reflections) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const floor = new Reflector(floorGeo, {
      clipBias: 0.003,
      textureWidth: Math.round(size.x * 0.5),
      textureHeight: Math.round(size.y * 0.5),
      color: 0x0a0e18,
      multisample: 0,
      shader: floorShader(moodColor, time, true),
    });
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
  } else {
    const floor = new THREE.Mesh(floorGeo, new THREE.ShaderMaterial(floorShader(moodColor, time, false)));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
  }

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x070a12, roughness: 0.85, metalness: 0.25 });
  const walls: Array<[number, number, number, number]> = [
    // width, x, z, rotationY
    [halfX * 2, 0, -halfZ, 0],
    [halfX * 2, 0, halfZ, Math.PI],
    [halfZ * 2, -halfX, 0, Math.PI / 2],
    [halfZ * 2, halfX, 0, -Math.PI / 2],
  ];
  for (const [w, x, z, ry] of walls) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, height), wallMat);
    wall.position.set(x, height / 2, z);
    wall.rotation.y = ry;
    scene.add(wall);
    // Neon skirting and cove strips.
    for (const [y, k] of [[0.1, 1.5], [height - 0.15, 1.1]] as const) {
      const mat = new THREE.MeshBasicMaterial();
      anim.neon.push({ material: mat, intensity: k });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, 0.02), mat);
      strip.position.set(x, y, z);
      strip.rotation.y = ry;
      strip.translateZ(0.02);
      scene.add(strip);
    }
  }

  // Animated light bars between the screens on every wall.
  const bars: Array<[number, number, number]> = [];
  for (const x of [-12.2, -5.6, 5.6, 12.2]) bars.push([x, -halfZ + 0.03, 0], [x, halfZ - 0.03, Math.PI]);
  for (const z of [-11.3, -5, 1, 7.2, 11.5]) bars.push([halfX - 0.03, z, -Math.PI / 2], [-halfX + 0.03, z, Math.PI / 2]);
  bars.forEach(([x, z, ry], i) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: moodColor, time, phase: { value: (i * 0.37) % 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 color; uniform float time; uniform float phase; varying vec2 vUv;
        void main() {
          float band = exp(-pow((fract(vUv.y * 0.6 - time * 0.18 + phase) - 0.5) * 9.0, 2.0));
          gl_FragColor = vec4(color * (0.22 + 1.9 * band), 1.0);
        }`,
    });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, height - 1.2, 0.03), mat);
    bar.position.set(x, height / 2, z);
    bar.rotation.y = ry;
    scene.add(bar);
  });

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2, halfZ * 2), new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  scene.add(ceiling);
  for (let x = -12; x <= 12; x += 6) {
    const mat = new THREE.MeshBasicMaterial();
    anim.neon.push({ material: mat, intensity: 1.35 });
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, halfZ * 1.7), mat);
    s.position.set(x, height - 0.02, 0);
    scene.add(s);
  }

  // Coloured fill that follows the mood.
  for (const [x, z] of [[-10, -6], [10, -6], [-10, 8], [10, 8]]) {
    const l = new THREE.PointLight(0x4080ff, 9, 22, 1.5);
    l.position.set(x, height - 1.2, z);
    anim.moodLights.push(l);
    scene.add(l);
  }
}

// Reflector() ignores `defines`, so the reflective switch is baked into the shader source.
function floorShader(moodColor: Uniform<THREE.Color>, time: Uniform<number>, reflective: boolean) {
  return {
    name: 'NeonFloor',
    uniforms: {
      color: { value: new THREE.Color(0x0a0e18) },
      tDiffuse: { value: null },
      textureMatrix: { value: new THREE.Matrix4() },
      gridColor: moodColor,
      time,
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vReflUv;
      varying vec3 vWorld;
      void main() {
        vReflUv = textureMatrix * vec4(position, 1.0);
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform vec3 gridColor;
      uniform float time;
      varying vec4 vReflUv;
      varying vec3 vWorld;
      float gridLine(float x, float width) {
        float d = abs(fract(x - 0.5) - 0.5) / fwidth(x);
        return 1.0 - min(d / width, 1.0);
      }
      void main() {
        vec3 base = color;
        ${reflective ? '' : '/*'}
          // A small blur kernel turns the mirror into polished stone.
          vec2 uv = vReflUv.xy / vReflUv.w;
          float o = 0.0035;
          vec3 r = texture2D(tDiffuse, uv).rgb * 0.28;
          r += texture2D(tDiffuse, uv + vec2(o, 0.0)).rgb * 0.12;
          r += texture2D(tDiffuse, uv - vec2(o, 0.0)).rgb * 0.12;
          r += texture2D(tDiffuse, uv + vec2(0.0, o)).rgb * 0.12;
          r += texture2D(tDiffuse, uv - vec2(0.0, o)).rgb * 0.12;
          r += texture2D(tDiffuse, uv + vec2(o, o) * 1.6).rgb * 0.06;
          r += texture2D(tDiffuse, uv - vec2(o, o) * 1.6).rgb * 0.06;
          r += texture2D(tDiffuse, uv + vec2(o, -o) * 1.6).rgb * 0.06;
          r += texture2D(tDiffuse, uv - vec2(o, -o) * 1.6).rgb * 0.06;
          base += r * 0.55;
        ${reflective ? '' : '*/'}
        vec2 p = vWorld.xz;
        float major = max(gridLine(p.x / 2.0, 1.1), gridLine(p.y / 2.0, 1.1));
        float minor = max(gridLine(p.x / 0.5, 0.9), gridLine(p.y / 0.5, 0.9)) * 0.12;
        float d = length(p);
        float ripple = pow(0.5 + 0.5 * sin(d * 0.7 - time * 1.6), 6.0);
        float fade = smoothstep(19.0, 3.0, d) * 0.8 + 0.2;
        vec3 grid = gridColor * (major * (0.18 + 1.3 * ripple) + minor) * fade;
        gl_FragColor = vec4(base + grid, 1.0);
      }`,
  };
}

// -------------------------------------------------------------------- desks

function addDesk(group: THREE.Group, planeHeight: number, accent: THREE.Color, colliders: THREE.Box3[]) {
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x141b29, roughness: 0.35, metalness: 0.5 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x090d15, roughness: 0.5, metalness: 0.7 });
  const screenBottom = -planeHeight / 2;
  const deskTopY = -1.47 + 0.76; // desk top at 0.76m world height
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 1.1), deskMat);
  top.position.set(0, deskTopY, 0.45);
  group.add(top);
  for (const x of [-1.2, 1.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 1.0), legMat);
    leg.position.set(x, deskTopY - 0.39, 0.45);
    group.add(leg);
  }
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, screenBottom - deskTopY, 12), legMat);
  stand.position.set(0, (screenBottom + deskTopY) / 2, -0.06);
  group.add(stand);
  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.16), new THREE.MeshStandardMaterial({ color: 0x0d121b, roughness: 0.7 }));
  keyboard.position.set(0, deskTopY + 0.035, 0.55);
  group.add(keyboard);
  // Keyboard backlight.
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.12), new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(0.9) }));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, deskTopY + 0.046, 0.55);
  group.add(keys);
  // Under-desk neon strip and a glow pool on the floor.
  const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.015, 0.015), new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.6) }));
  glowStrip.position.set(0, deskTopY - 0.04, 0.98);
  group.add(glowStrip);
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.2),
    new THREE.ShaderMaterial({
      uniforms: { color: { value: accent.clone() } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 color; varying vec2 vUv;
        void main(){ vec2 d = (vUv - 0.5) * vec2(1.0, 1.6); float a = exp(-dot(d, d) * 9.0); gl_FragColor = vec4(color * a * 0.32, 1.0); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, -1.47 + 0.012, 0.75);
  group.add(pool);
  group.updateMatrixWorld(true);
  colliders.push(new THREE.Box3().setFromObject(top));
}

/** Spotlights over the desks, with fake volumetric cones. */
function addDeskLighting(scene: THREE.Scene) {
  const spots: Array<[number, number, number]> = [
    [0, 0.6, 0.85],
    [-7.6, 3.1, 0.6],
    [7.6, 3.1, 0.6],
  ];
  for (const [x, z, angle] of spots) {
    const spot = new THREE.SpotLight(0xcfe0ff, 70, 16, angle * 0.55, 0.6, 1.4);
    spot.position.set(x, ROOM.height - 0.1, z);
    spot.target.position.set(x, 0, z + 0.4);
    scene.add(spot, spot.target);

    const h = ROOM.height - 0.1;
    const radius = Math.tan(angle * 0.55) * h;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius, h, 48, 1, true),
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(0.55, 0.7, 1.0) } },
        vertexShader: `
          varying float vH; varying vec3 vN; varying vec3 vV;
          void main() {
            vH = uv.y;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 color; varying float vH; varying vec3 vN; varying vec3 vV;
          void main() {
            float edge = pow(abs(dot(vN, vV)), 2.0);
            float a = edge * mix(0.0, 0.16, smoothstep(0.0, 1.0, vH)) * smoothstep(0.0, 0.25, vH);
            gl_FragColor = vec4(color * a, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    cone.position.set(x, h / 2, z);
    scene.add(cone);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.12, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.8, 2.2) }));
    lamp.position.set(x, ROOM.height - 0.06, z);
    scene.add(lamp);
  }
}

function addDust(scene: THREE.Scene, time: Uniform<number>) {
  const n = 420;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * (ROOM.halfX - 0.5);
    pos[i * 3 + 1] = Math.random() * ROOM.height;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * (ROOM.halfZ - 0.5);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { time, height: { value: ROOM.height } },
      vertexShader: `
        uniform float time; uniform float height; attribute float seed; varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + time * (0.05 + seed * 0.08), height);
          p.x += sin(time * 0.3 + seed * 40.0) * 0.3;
          p.z += cos(time * 0.25 + seed * 30.0) * 0.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min(3.0, (1.0 + seed * 1.5) * (14.0 / -mv.z));
          vA = 0.25 + 0.5 * seed;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(vec3(0.6, 0.75, 1.0) * a * 0.35, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  points.frustumCulled = false;
  scene.add(points);
}

// ------------------------------------------------------- ticker ring & sign

function buildTickerRing(scene: THREE.Scene, anim: Animated) {
  // Inside a cylinder the U axis runs right-to-left, so a negative repeat un-mirrors the text.
  const material = createScreenMaterial({ idleColor: 0x05080f, repeatX: -2 });
  material.side = THREE.BackSide;
  const radius = 9.5;
  const circumference = 2 * Math.PI * radius;
  const height = circumference / 2 / (3072 / 56);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 192, 1, true), material);
  mesh.position.y = 7.45;
  mesh.name = 'ticker-ring';
  scene.add(mesh);
  for (const dy of [-height / 2 - 0.02, height / 2 + 0.02]) {
    const edgeMat = new THREE.MeshBasicMaterial();
    anim.neon.push({ material: edgeMat, intensity: 1.7 });
    const edge = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.016, 6, 192), edgeMat);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = mesh.position.y + dy;
    scene.add(edge);
  }
  return { mesh, material };
}

/** The world-clock board hanging over the desks, facing the entrance. Its texture is HDR-boosted so the digits glow. */
function buildSign(scene: THREE.Scene) {
  const planeWidth = 6.4;
  const planeHeight = planeWidth * (330 / 1920);
  const material = createScreenMaterial({ idleColor: 0x020309 });
  material.uniforms.brightness.value = 1.12; // just over the bloom threshold: a glow, still legible
  const group = new THREE.Group();
  group.position.set(0, 5.5, 0.4);
  scene.add(group);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), material);
  mesh.name = 'sign';
  group.add(mesh);
  const back = new THREE.Mesh(new THREE.BoxGeometry(planeWidth + 0.1, planeHeight + 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x07090f, roughness: 0.4, metalness: 0.8 }));
  back.position.z = -0.035;
  group.add(back);
  const cableMat = new THREE.MeshBasicMaterial({ color: 0x1a2232 });
  for (const x of [-planeWidth / 2 + 0.3, planeWidth / 2 - 0.3]) {
    const len = ROOM.height - group.position.y - planeHeight / 2;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 6), cableMat);
    cable.position.set(x, planeHeight / 2 + len / 2, -0.03);
    group.add(cable);
  }
  return { mesh, material };
}

// First-person walking plus a "focus" mode that flies to a screen and frees the
// cursor so the real HTML on that screen can be used.
//
//   intro  --click-->  walk  --click/E on a screen-->  focus
//   walk   --Esc-->    paused (cursor free; screens are still clickable in 3D)
//   focus  --Esc-->    paused,   focus --Q / click empty space-->  walk

import * as THREE from 'three';
import { EYE_HEIGHT, ROOM } from './world';

export type Mode = 'intro' | 'walk' | 'focus' | 'paused';

export interface FocusTarget {
  id: string;
  label: string;
  mesh: THREE.Mesh;
  planeWidth: number;
  planeHeight: number;
  cssWidth: number;
  cssHeight: number;
}

interface Pose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

const WALK_SPEED = 3.4;
const SPRINT = 2;
const RADIUS = 0.35;
const LOOK_SENSITIVITY = 0.0022;

export class FloorControls {
  mode: Mode = 'intro';
  hovered: FocusTarget | null = null;
  focused: FocusTarget | null = null;
  onChange: () => void = () => {};

  private yaw = 0;
  private pitch = -0.05;
  private keys = new Set<string>();
  private velocity = new THREE.Vector3();
  private returnPose: Pose | null = null;
  private tween: { from: Pose; to: Pose; t: number; duration: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private helperCam = new THREE.PerspectiveCamera();
  private center = new THREE.Vector2(0, 0);

  constructor(
    private camera: THREE.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
    private targets: FocusTarget[],
    private colliders: THREE.Box3[],
  ) {
    this.raycaster.far = 40;
    this.applyLook();

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) this.setMode('walk');
      else if (this.mode === 'walk') this.setMode('paused');
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || this.tween) return;
      this.yaw -= e.movementX * LOOK_SENSITIVITY;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * LOOK_SENSITIVITY, -1.35, 1.35);
    });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());

    // Clicks on a panel's HTML have the panel element as their target; only
    // clicks on empty canvas space reach us with target === canvas.
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.mode === 'walk' && document.pointerLockElement === canvas) {
        if (this.hovered) this.focus(this.hovered);
        return;
      }
      if (e.target !== canvas) return;
      if (this.mode === 'focus') this.exitFocus(true);
      else this.lock();
    });
  }

  /** Place the camera (debugging / screenshots). Keeps the current mode. */
  setPose(position: THREE.Vector3, lookAt: THREE.Vector3) {
    this.tween = null;
    this.camera.position.copy(position);
    this.helperCam.position.copy(position);
    this.helperCam.lookAt(lookAt);
    this.camera.quaternion.copy(this.helperCam.quaternion);
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
  }

  /** True while the camera is flying to or from a screen. */
  get animating() {
    return this.tween !== null;
  }

  lock() {
    // unadjustedMovement can be unsupported on some platforms; fall back to the plain request.
    const req = this.canvas.requestPointerLock({ unadjustedMovement: true }) as unknown as Promise<void> | undefined;
    req?.catch?.(() => (this.canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => this.setMode('paused')));
  }

  focus(target: FocusTarget) {
    if (this.mode !== 'focus') this.returnPose = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() };
    this.focused = target;
    this.setMode('focus');
    this.onChange(); // also when moving focus from one screen straight to another
    if (document.pointerLockElement) document.exitPointerLock();
    this.startTween(this.focusPose(target), 650);
  }

  exitFocus(relock: boolean) {
    if (this.mode !== 'focus') return;
    this.focused = null;
    this.setMode('paused');
    if (this.returnPose) this.startTween(this.returnPose, 550);
    if (relock) this.lock();
  }

  /** Re-fit the focused screen after the viewport changes. */
  refit() {
    if (this.focused && !this.tween) {
      const p = this.focusPose(this.focused);
      this.camera.position.copy(p.position);
      this.camera.quaternion.copy(p.quaternion);
    }
  }

  update(dt: number) {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + (dt * 1000) / tw.duration);
      const k = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(tw.from.position, tw.to.position, k);
      this.camera.quaternion.slerpQuaternions(tw.from.quaternion, tw.to.quaternion, k);
      if (tw.t >= 1) {
        this.tween = null;
        if (this.mode !== 'focus') {
          // Back from a focus: resume walking from the exact orientation we left.
          const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
          this.yaw = e.y;
          this.pitch = e.x;
        }
      }
      return;
    }
    if (this.mode === 'walk') {
      this.move(dt);
      this.applyLook();
      this.updateHover();
    }
  }

  private move(dt: number) {
    const forward = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const speed = WALK_SPEED * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? SPRINT : 1);
    const wish = new THREE.Vector3(strafe, 0, -forward);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.velocity.lerp(wish, 1 - Math.exp(-dt * 10));

    const pos = this.camera.position;
    pos.addScaledVector(this.velocity, dt);
    pos.x = THREE.MathUtils.clamp(pos.x, -ROOM.halfX + RADIUS + 0.4, ROOM.halfX - RADIUS - 0.4);
    pos.z = THREE.MathUtils.clamp(pos.z, -ROOM.halfZ + RADIUS + 0.4, ROOM.halfZ - RADIUS);
    pos.y = EYE_HEIGHT;
    // Push out of desks (2D circle vs. box on the floor plane).
    for (const box of this.colliders) {
      const cx = THREE.MathUtils.clamp(pos.x, box.min.x, box.max.x);
      const cz = THREE.MathUtils.clamp(pos.z, box.min.z, box.max.z);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        const d = Math.sqrt(d2) || 1e-4;
        pos.x = cx + (dx / d) * RADIUS;
        pos.z = cz + (dz / d) * RADIUS;
      }
    }
  }

  private applyLook() {
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  private updateHover() {
    this.raycaster.setFromCamera(this.center, this.camera);
    const hit = this.raycaster.intersectObjects(this.targets.map((t) => t.mesh), false)[0];
    const next = hit ? (this.targets.find((t) => t.mesh === hit.object) ?? null) : null;
    if (next !== this.hovered) {
      this.hovered = next;
      this.onChange();
    }
  }

  /**
   * Where to stand to read a screen: on its normal, at the distance where one CSS
   * pixel of the panel maps to one screen pixel (crisp text, 1:1 mouse movement),
   * backed off if needed so the whole panel fits with a margin.
   */
  private focusPose(target: FocusTarget): Pose {
    const mesh = target.mesh;
    const center = mesh.getWorldPosition(new THREE.Vector3());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
    const vw = this.canvas.clientWidth;
    const vh = this.canvas.clientHeight;
    const fit = 0.9;
    const pxHeight = Math.min(target.cssHeight, vh * fit, (vw * fit * target.cssHeight) / target.cssWidth);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const distance = (target.planeHeight * vh) / (2 * tanHalf * pxHeight);
    const position = center.clone().addScaledVector(normal, distance);
    this.helperCam.position.copy(position);
    this.helperCam.lookAt(center);
    return { position, quaternion: this.helperCam.quaternion.clone() };
  }

  private startTween(to: Pose, duration: number) {
    this.tween = { from: { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() }, to, t: 0, duration };
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    if (down && this.mode === 'focus') {
      if (e.code === 'Escape') this.exitFocus(false);
      else if (e.code === 'KeyQ' && !typing) this.exitFocus(true);
      return;
    }
    if (this.mode !== 'walk') return;
    if (down && e.code === 'KeyE' && this.hovered) {
      this.focus(this.hovered);
      return;
    }
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
  }

  private setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode !== 'walk') {
      this.keys.clear();
      this.velocity.set(0, 0, 0);
      this.hovered = null;
    }
    this.onChange();
  }
}

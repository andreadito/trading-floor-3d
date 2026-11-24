// Render pipeline: scene -> HDR target (MSAA) -> selective-by-threshold bloom -> sRGB output.
// Screens are drawn below the bloom threshold (see createScreenMaterial), so only
// the HDR neon, light bars, floor grid and the attribution sign glow.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export const BLOOM_STRENGTH = 0.6;

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, opts: { bloom: boolean }) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), BLOOM_STRENGTH, 0.35, 0.9);
  if (opts.bloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(pr);
  composer.setSize(size.x, size.y);
  return {
    bloom,
    render: () => composer.render(),
    setSize(width: number, height: number, pixelRatio: number) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    },
  };
}

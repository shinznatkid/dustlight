import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, HueSaturationEffect, BrightnessContrastEffect, SMAAEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { ShaftsPass, ShaftsCompositeEffect } from './atmos.js';

const TONES = { agx: ToneMappingMode.AGX, aces: ToneMappingMode.ACES_FILMIC, neutral: ToneMappingMode.NEUTRAL };

// HDR chain: scene (4x MSAA) -> AO -> sun shafts (half-res, blurred) + exposure ->
// bloom -> tone map -> light grade -> vignette -> SMAA. Grade stays gentle: pushing
// contrast/saturation after the tone mapper clips bright plaster to white.
// SMAA alone left stair-steps on every straight edge (playtest 2026-09-29); MSAA
// fixes geometry edges, SMAA what's left in textures and shading.
// spot: a room's extra light for the shafts (atmos.js ShaftsPass; none = exactly as before)
export function createPost(renderer, scene, camera, sun, roomBox, { tone = 'agx', spot = null } = {}) {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 4 });
  composer.addPass(new RenderPass(scene, camera));

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const ao = new N8AOPostPass(scene, camera, size.x, size.y);
  ao.configuration.aoRadius = 0.5;
  ao.configuration.distanceFalloff = 1.0;
  ao.configuration.intensity = 2.2;
  ao.configuration.color = new THREE.Color(0.16, 0.1, 0.06);
  ao.configuration.gammaCorrection = false;
  ao.configuration.transparencyAware = false;
  ao.setQualityMode('High');
  composer.addPass(ao);

  const shafts = new ShaftsPass(camera, sun, roomBox, { spot });
  composer.addPass(shafts);
  const composite = new ShaftsCompositeEffect(shafts);
  composer.addPass(new EffectPass(camera, composite));

  const bloom = new BloomEffect({
    intensity: 0.55,
    luminanceThreshold: 1.25,
    luminanceSmoothing: 0.35,
    mipmapBlur: true,
    radius: 0.65,
  });
  const toneFx = new ToneMappingEffect({ mode: TONES[tone] ?? TONES.agx });
  const sat = new HueSaturationEffect({ saturation: tone === 'agx' ? 0.16 : 0.06 });
  const contrast = new BrightnessContrastEffect({ contrast: tone === 'agx' ? 0.1 : 0.03 });
  const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.5 });
  composer.addPass(new EffectPass(camera, bloom, toneFx, sat, contrast, vignette));
  composer.addPass(new EffectPass(camera, new SMAAEffect()));

  return { composer, ao, shafts, bloom, exposure: composite.uniforms.get('exposure') };
}

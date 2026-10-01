import * as THREE from 'three';

// Probe-grid global illumination ("DDGI-lite", no ray tracing).
//
// A grid of probes fills the room. Each probe renders a tiny HDR cube map of the
// lit scene, and a shader projects it onto L1 spherical harmonics (4 RGB
// coefficients). Every PBR material then adds the trilinearly interpolated
// probe irradiance to its indirect diffuse term. Captures read the previous
// sweep's result, so each sweep adds one more light bounce: sunlight hitting
// the floor bounces up onto the walls, the walls bounce back, and so on.
//
// Layers: 0 = seen by everything · CAPTURE (3) = seen only by probes (the fake
// ceiling and the missing cutaway walls, so the room behaves like a closed
// interior) · MAIN_ONLY (2) = small props, dust and FX that GI can ignore.
export const LAYER_MAIN_ONLY = 2;
export const LAYER_CAPTURE = 3;

const PROJ_FRAG = /* glsl */ `
precision highp float;
uniform samplerCube cube;
uniform sampler2D prevAtlas;
uniform float probeIndex;
uniform float blend;
uniform float validity;
#define N 16

vec3 faceDir(int f, vec2 uv) {
  if (f == 0) return vec3(1.0, uv.y, uv.x);
  if (f == 1) return vec3(-1.0, uv.y, uv.x);
  if (f == 2) return vec3(uv.x, 1.0, uv.y);
  if (f == 3) return vec3(uv.x, -1.0, uv.y);
  if (f == 4) return vec3(uv.x, uv.y, 1.0);
  return vec3(uv.x, uv.y, -1.0);
}

void main() {
  int row = int(gl_FragCoord.y);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int f = 0; f < 6; f++) {
    for (int j = 0; j < N; j++) {
      for (int i = 0; i < N; i++) {
        vec2 uv = (vec2(float(i), float(j)) + 0.5) / float(N) * 2.0 - 1.0;
        vec3 d = faceDir(f, uv);
        float w = 1.0 / pow(dot(d, d), 1.5); // texel solid angle on a unit cube
        d = normalize(d);
        vec3 c = textureLod(cube, d, 1.0).rgb;
        float basis = row == 0 ? 0.282095
          : row == 1 ? 0.488603 * d.y
          : row == 2 ? 0.488603 * d.z
          : 0.488603 * d.x;
        acc += c * basis * w;
        wsum += w;
      }
    }
  }
  acc *= 4.0 * 3.14159265 / wsum;
  vec3 prev = texelFetch(prevAtlas, ivec2(int(probeIndex), row), 0).rgb;
  gl_FragColor = vec4(mix(prev, acc, blend), validity);
}
`;

// Fragment-side GI sampling injected into MeshStandard/Physical materials.
const GI_PARS = /* glsl */ `
uniform sampler2D giAtlas;
uniform vec3 giMin;
uniform vec3 giMax;
uniform vec3 giCounts;
uniform float giIntensity;
uniform float giEnabled;
uniform float giEnvDiffuse;
uniform float giNormalBias;
varying vec3 vGiWorldPos;

vec3 giProbeIrradiance(int idx, vec3 n) {
  vec3 c0 = texelFetch(giAtlas, ivec2(idx, 0), 0).rgb;
  vec3 c1 = texelFetch(giAtlas, ivec2(idx, 1), 0).rgb;
  vec3 c2 = texelFetch(giAtlas, ivec2(idx, 2), 0).rgb;
  vec3 c3 = texelFetch(giAtlas, ivec2(idx, 3), 0).rgb;
  return max(vec3(0.0), c0 * 0.886227 + 1.023328 * (c1 * n.y + c2 * n.z + c3 * n.x));
}

vec3 giIrradiance(vec3 p, vec3 n) {
  vec3 cells = giCounts - 1.0;
  vec3 ext = giMax - giMin;
  vec3 g = clamp((p + n * giNormalBias - giMin) / ext, 0.0, 1.0) * cells;
  vec3 b = min(floor(g), cells - 1.0);
  vec3 f = g - b;
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 8; i++) {
    vec3 o = vec3(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1));
    vec3 c = b + o;
    vec3 tri = mix(1.0 - f, f, o);
    float w = tri.x * tri.y * tri.z;
    vec3 toProbe = giMin + c / cells * ext - p;
    float d = length(toProbe);
    // probes behind the surface contribute little (cuts light leaking)
    float facing = d > 1e-4 ? dot(toProbe / d, n) * 0.5 + 0.5 : 1.0;
    w *= facing * facing + 0.02;
    int idx = int(c.x + c.y * giCounts.x + c.z * giCounts.x * giCounts.y + 0.5);
    w *= texelFetch(giAtlas, ivec2(idx, 0), 0).a; // probes buried in furniture are invalid
    sum += giProbeIrradiance(idx, n) * w;
    wsum += w;
  }
  return sum / max(wsum, 1e-5);
}
`;

export class ProbeGI {
  constructor(renderer, scene, { min, max, counts, cubeSize = 32 }) {
    this.renderer = renderer;
    this.scene = scene;
    this.min = min.clone();
    this.max = max.clone();
    this.counts = counts.clone();
    this.count = counts.x * counts.y * counts.z;
    this.positions = [];
    for (let z = 0; z < counts.z; z++) {
      for (let y = 0; y < counts.y; y++) {
        for (let x = 0; x < counts.x; x++) {
          this.positions.push(new THREE.Vector3(
            THREE.MathUtils.lerp(min.x, max.x, x / (counts.x - 1)),
            THREE.MathUtils.lerp(min.y, max.y, y / (counts.y - 1)),
            THREE.MathUtils.lerp(min.z, max.z, z / (counts.z - 1)),
          ));
        }
      }
    }
    this.valid = new Float32Array(this.count).fill(1);

    const atlasOpts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      generateMipmaps: false,
    };
    this.read = new THREE.WebGLRenderTarget(this.count, 4, atlasOpts);
    this.write = new THREE.WebGLRenderTarget(this.count, 4, atlasOpts);

    this.cubeRT = new THREE.WebGLCubeRenderTarget(cubeSize, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cubeCam = new THREE.CubeCamera(0.03, 40, this.cubeRT);
    for (const c of this.cubeCam.children) {
      c.layers.set(0);
      c.layers.enable(LAYER_CAPTURE);
    }

    this.projMat = new THREE.ShaderMaterial({
      uniforms: {
        cube: { value: this.cubeRT.texture },
        prevAtlas: { value: this.read.texture },
        probeIndex: { value: 0 },
        blend: { value: 1 },
        validity: { value: 1 },
      },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: PROJ_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.projMat);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.uniforms = {
      giAtlas: { value: this.read.texture },
      giMin: { value: this.min },
      giMax: { value: this.max },
      giCounts: { value: this.counts },
      giIntensity: { value: 1 },
      giEnabled: { value: 1 },
      giEnvDiffuse: { value: 0 },
      giNormalBias: { value: 0.22 },
    };

    this.captureBackground = new THREE.Color(0x000000);
    this.cursor = 0;
    this.sweepsLeft = 0;
    this.blend = 1;
    this.sweepsDone = 0;
    this.clearAtlas(this.read);
    this.clearAtlas(this.write);
  }

  clearAtlas(rt) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 1);
    r.clear(true, false, false);
    r.setClearColor(prevColor, prevAlpha);
    r.setRenderTarget(prev);
  }

  // A probe inside furniture would only see the inside of a mesh (black). Marking
  // it invalid leaves holes where every neighbour is buried too, so instead the
  // capture point is pushed out through the nearest face of the blocker (DDGI
  // "probe relocation"); interpolation still uses the nominal grid position.
  setBlockers(boxes, margin = 0.08) {
    this.capturePos = this.positions.map((p) => p.clone());
    for (const p of this.capturePos) {
      for (let pass = 0; pass < 3; pass++) {
        const b = boxes.find((bb) => bb.containsPoint(p));
        if (!b) break;
        const exits = [
          [p.x - b.min.x, 'x', b.min.x - margin], [b.max.x - p.x, 'x', b.max.x + margin],
          [p.y - b.min.y, 'y', b.min.y - margin], [b.max.y - p.y, 'y', b.max.y + margin],
          [p.z - b.min.z, 'z', b.min.z - margin], [b.max.z - p.z, 'z', b.max.z + margin],
        ].filter(([, axis, v]) => axis !== 'y' || v > 0.05);
        exits.sort((a, c) => a[0] - c[0]);
        p[exits[0][1]] = exits[0][2];
      }
    }
  }

  // queue n full sweeps (= n more bounces); blend < 1 smooths lighting changes
  invalidate(sweeps = 3, blend = 0.6) {
    this.sweepsLeft = Math.max(this.sweepsLeft, sweeps);
    this.blend = blend;
  }

  get busy() {
    return this.sweepsLeft > 0;
  }

  update(budget = 12) {
    if (this.sweepsLeft <= 0) return;
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.shadowMap.autoUpdate;
    const prevNeeds = r.shadowMap.needsUpdate;
    const prevAutoClear = r.autoClear;
    const prevBg = this.scene.background;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = false;
    this.scene.background = this.captureBackground;

    for (let k = 0; k < budget && this.sweepsLeft > 0; k++) {
      const i = this.cursor;
      this.cubeCam.position.copy((this.capturePos ?? this.positions)[i]);
      this.cubeCam.updateMatrixWorld(true);
      r.autoClear = true;
      this.cubeCam.update(r, this.scene);

      const u = this.projMat.uniforms;
      u.prevAtlas.value = this.read.texture;
      u.probeIndex.value = i;
      u.blend.value = this.blend;
      u.validity.value = this.valid[i];
      this.write.viewport.set(i, 0, 1, 4);
      this.write.scissor.set(i, 0, 1, 4);
      this.write.scissorTest = true;
      r.autoClear = false;
      r.setRenderTarget(this.write);
      r.render(this.quadScene, this.quadCam);

      this.cursor++;
      if (this.cursor >= this.count) {
        this.cursor = 0;
        [this.read, this.write] = [this.write, this.read];
        this.uniforms.giAtlas.value = this.read.texture;
        this.sweepsLeft--;
        this.sweepsDone++;
      }
    }

    this.scene.background = prevBg;
    r.autoClear = prevAutoClear;
    r.shadowMap.autoUpdate = prevAuto;
    r.shadowMap.needsUpdate = prevNeeds;
    r.setRenderTarget(prevTarget);
  }

  patch(material) {
    if (!material || material.userData.giPatched) return;
    if (!(material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) return;
    material.userData.giPatched = true;
    const uniforms = this.uniforms;
    const prevHook = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      prevHook?.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGiWorldPos;')
        .replace('#include <project_vertex>', [
          '#include <project_vertex>',
          '{',
          '  vec4 giP = vec4( transformed, 1.0 );',
          '  #ifdef USE_BATCHING',
          '  giP = batchingMatrix * giP;',
          '  #endif',
          '  #ifdef USE_INSTANCING',
          '  giP = instanceMatrix * giP;',
          '  #endif',
          '  vGiWorldPos = ( modelMatrix * giP ).xyz;',
          '}',
        ].join('\n'));
      const maps = THREE.ShaderChunk.lights_fragment_maps.replace(
        'iblIrradiance += getIBLIrradiance( geometryNormal );',
        'iblIrradiance += getIBLIrradiance( geometryNormal ) * giEnvDiffuse;',
      );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GI_PARS}`)
        .replace('#include <lights_fragment_maps>', [
          maps,
          '#if defined( RE_IndirectDiffuse )',
          'if ( giEnabled > 0.5 ) {',
          '  vec3 giN = inverseTransformDirection( geometryNormal, viewMatrix );',
          '  irradiance += giIrradiance( vGiWorldPos, giN ) * giIntensity;',
          '}',
          '#endif',
        ].join('\n'));
    };
    const prevKey = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => `gi1|${prevKey ? prevKey() : ''}`;
    material.needsUpdate = true;
  }

  patchScene(root) {
    root.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.patch(m);
    });
  }
}

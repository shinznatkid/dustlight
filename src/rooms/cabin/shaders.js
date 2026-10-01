// The cabin's view out of the windows: a pine forest instead of level 1's rolling
// hills — the fragment shader its sky card (../kit.js skyCard) takes. The card's
// uniforms and the other shared shaders (flame, probe-only sky dome) live in kit.js.

export const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 glow;
uniform vec3 treeCol;
uniform float glowZ;
uniform float glowY;
varying vec3 vW;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
// a row of pine trees: a triangle per cell, random height, a hint of tiers
float pines(float z, float y, float cell, float base, float hgt, float seed) {
  float c = floor(z / cell);
  float best = 0.0;
  for (int k = -1; k <= 1; k++) {
    float ci = c + float(k);
    float cz = (ci + 0.3 + 0.4 * h1(ci + seed)) * cell;
    float tip = base + hgt * (0.65 + 0.5 * h1(ci * 1.7 + seed));
    float d = abs(z - cz);
    float up = tip - y;
    float tier = 1.0 - 0.18 * fract(up / (hgt * 0.22));
    float w = up * 0.36 * tier;
    best = max(best, smoothstep(w + 0.012, w - 0.012, d) * step(0.0, up));
  }
  return best;
}
void main() {
  vec3 sky = mix(horizon, top, smoothstep(0.4, 3.4, vW.y));
  float g = exp(-length(vec2((vW.z - glowZ) * 0.7, (vW.y - glowY) * 1.1)) * 1.4);
  sky += glow * g;
  float far = pines(vW.z + 7.3, vW.y, 0.32, 0.55, 0.6, 3.0);
  float near = pines(vW.z, vW.y, 0.55, 0.1, 1.1, 11.0);
  vec3 col = mix(sky, mix(sky, treeCol, 0.5), far);
  col = mix(col, treeCol, near * 0.92);
  gl_FragColor = vec4(col, 1.0);
}
`;

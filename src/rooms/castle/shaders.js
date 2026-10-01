// The castle's view out of its windows: from high up a tower — mostly sky, far blue hills low
// down, a green valley with a river of light, a distant turret. The fragment shader its sky card
// (../kit.js skyCard) takes; the card's uniforms (top, horizon, glow, treeCol, glowZ, glowY)
// are driven by world.js applyTime like every room's.

export const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 glow;
uniform vec3 treeCol;
uniform float glowZ;
uniform float glowY;
varying vec3 vW;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main() {
  vec3 sky = mix(horizon, top, smoothstep(0.7, 3.2, vW.y));
  float g = exp(-length(vec2((vW.z - glowZ) * 0.7, (vW.y - glowY) * 1.1)) * 1.4);
  sky += glow * g;
  // a few soft clouds
  float cl = smoothstep(0.62, 0.8, n1(vW.z * 1.3 + 4.0) * 0.6 + n1(vW.z * 3.1 + vW.y * 2.0) * 0.4) * smoothstep(1.6, 2.2, vW.y) * smoothstep(2.9, 2.4, vW.y);
  sky = mix(sky, horizon * 1.05 + glow * g * 0.5, cl * 0.45);
  // far hills (hazy), then the nearer valley side
  float far = 0.95 + 0.25 * n1(vW.z * 0.9 + 2.0) + 0.1 * n1(vW.z * 3.3);
  float near = 0.62 + 0.22 * n1(vW.z * 1.4 + 9.0) + 0.05 * n1(vW.z * 7.0);
  vec3 haze = mix(sky, treeCol * 1.6 + horizon * 0.25, 0.35);
  vec3 col = mix(sky, haze, smoothstep(far + 0.01, far - 0.01, vW.y));
  // a distant turret on the far ridge
  float tz = abs(vW.z + 0.55);
  float turret = step(tz, 0.05) * step(vW.y, far + 0.24) + step(tz, 0.075) * step(far + 0.24, vW.y) * step(vW.y, far + 0.33) * step(0.0, far + 0.33 - vW.y - (tz * 1.3));
  col = mix(col, haze * 0.8, turret * 0.9);
  col = mix(col, treeCol * (0.85 + 0.3 * n1(vW.z * 9.0 + vW.y * 4.0)), smoothstep(near + 0.02, near - 0.02, vW.y));
  gl_FragColor = vec4(col, 1.0);
}
`;

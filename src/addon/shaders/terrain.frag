precision highp float;

/**
 * Procedural terrain designed to showcase liquid pooling and flow.
 *
 * Topology (intentionally shaped so water visibly cascades):
 *
 *   - A flat-topped plateau on the left side. The plateau top is SMOOTH
 *     (noise is suppressed on its interior) so water placed there doesn't
 *     get trapped in local dips. Water accumulates and overflows the rim,
 *     cascading down the slope.
 *
 *   - A carved channel running from the plateau rim down to a central
 *     basin. This is the "spillway" that water follows on its way down.
 *
 *   - A central basin (low area) where water naturally pools.
 *
 *   - A second smaller basin on the opposite side as a satellite pool.
 *
 *   - Low-frequency mountain noise everywhere for visual richness, but
 *     kept below the plateau top so the plateau is the highest point.
 *
 *   - High-frequency detail everywhere EXCEPT on the plateau top.
 */

varying vec2 vUv;

uniform float uSeed;
uniform float uRoughness;
uniform float uMountainHeight;
uniform float uPlateauHeight;
uniform float uBasinDepth;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int octaves) {
  float v = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    v += amp * noise(p * freq);
    amp *= 0.5;
    freq *= 2.0;
  }
  return v;
}

void main() {
  vec2 p = vUv * 3.0 + uSeed * 17.0;

  // --- Plateau (flat top, smooth rim) ---
  vec2 plateauCenter = vec2(0.22, 0.72);
  float plateauDist = distance(vUv, plateauCenter);
  // Smooth flat top: full height inside radius 0.10, fall off to 0 by 0.22
  float plateauMask = smoothstep(0.22, 0.10, plateauDist);
  float plateau = uPlateauHeight * plateauMask;

  // --- Central basin (low area for water to pool) ---
  vec2 basinCenter = vec2(0.62, 0.38);
  float basinDist = distance(vUv, basinCenter);
  float basin = -uBasinDepth * exp(-basinDist * basinDist * 14.0);

  // --- Smaller satellite basin ---
  vec2 satCenter = vec2(0.82, 0.78);
  float satDist = distance(vUv, satCenter);
  float satBasin = -uBasinDepth * 0.55 * exp(-satDist * satDist * 30.0);

  // --- Carved channel from plateau rim to central basin ---
  // Walk a quadratic bezier-ish path between plateau rim and basin center.
  vec2 a = plateauCenter + vec2(0.08, -0.05); // rim of plateau, facing basin
  vec2 b = basinCenter;
  vec2 pa = vUv - a;
  vec2 ba = b - a;
  float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  vec2 closest = a + ba * t;
  float channelDist = distance(vUv, closest);
  // Carve a U-shaped channel
  float channelWidth = 0.05;
  float channelDepth = 0.20;
  float channel = -channelDepth * smoothstep(channelWidth, 0.0, channelDist);

  // --- Background mountains (kept below plateau) ---
  float mountain = fbm(p * 0.8, 4) * uMountainHeight;

  // --- Surface detail (suppressed on plateau top so water doesn't pool in noise) ---
  float detailNoise = (fbm(p * 4.0, 4) - 0.5) * uRoughness * 0.3;
  // Suppress detail where plateau mask is high (interior of plateau)
  detailNoise *= (1.0 - plateauMask * 0.85);

  float h = mountain + plateau + basin + satBasin + channel + detailNoise;
  h = clamp(h, 0.0, 1.0);

  gl_FragColor = vec4(h, 0.0, 0.0, 1.0);
}

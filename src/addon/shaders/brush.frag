precision highp float;

/**
 * Input / brush shader.
 * Applies a brush operation at the cursor position. Operation codes:
 *   0 = add water       (raise R channel)
 *   1 = remove water    (lower R channel)
 *   2 = raise terrain   (raise terrain height R)
 *   3 = lower terrain   (lower terrain height R)
 *   4 = smooth terrain  (blur terrain with a small kernel)
 *
 * The brush is a smooth radial falloff. The same shader is used both for
 * editing the water state texture (ops 0/1) and the terrain texture (ops 2/3/4)
 * by passing different input/output bindings.
 */

uniform sampler2D tPrev;
uniform vec2 uCenter;        // brush center in UV space
uniform float uRadius;       // brush radius in UV space
uniform float uStrength;     // brush strength
uniform int uOp;             // operation code (see above)
uniform vec2 texel;
uniform float uDelta;        // for smoothing

varying vec2 vUv;

void main() {
  vec4 prev = texture2D(tPrev, vUv);
  float d = distance(vUv, uCenter);

  // Smooth radial falloff (cosine bell)
  float falloff = 0.0;
  if (d < uRadius) {
    float t = d / uRadius;
    falloff = 0.5 * (cos(t * 3.14159265) + 1.0);
  }

  vec4 outColor = prev;

  if (uOp == 0) {
    // Add water (strength is normalized: 1.0 ≈ 5cm per stroke at peak)
    outColor.r = max(0.0, prev.r + uStrength * falloff * 0.05);
  } else if (uOp == 1) {
    // Remove water (drain)
    outColor.r = max(0.0, prev.r - uStrength * falloff * 0.05);
  } else if (uOp == 2) {
    // Raise terrain (smaller scale since terrain is normalized 0..1)
    outColor.r = clamp(prev.r + uStrength * falloff * 0.02, 0.0, 1.0);
  } else if (uOp == 3) {
    // Lower terrain
    outColor.r = clamp(prev.r - uStrength * falloff * 0.02, 0.0, 1.0);
  } else if (uOp == 4) {
    // Smooth terrain (small gaussian blur)
    float k = 0.15 * falloff;
    float c = prev.r;
    float n = texture2D(tPrev, vUv + vec2(texel.x, 0.0)).r;
    float s = texture2D(tPrev, vUv - vec2(texel.x, 0.0)).r;
    float e = texture2D(tPrev, vUv + vec2(0.0, texel.y)).r;
    float w = texture2D(tPrev, vUv - vec2(0.0, texel.y)).r;
    float avg = 0.25 * (n + s + e + w);
    outColor.r = mix(c, avg, k);
  }

  gl_FragColor = outColor;
}

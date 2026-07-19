precision highp float;

/**
 * Compute water surface normals from the water depth texture.
 * Surface = terrain + waterDepth.
 * We sample neighbors and compute the gradient, then write the normal
 * to a separate texture that the renderer can read.
 */

uniform sampler2D tWater;    // water state (R = depth)
uniform sampler2D tTerrain;  // terrain height (R channel, normalized)
uniform vec2 texel;
uniform float terrainScale;
uniform float cellSize;

varying vec2 vUv;

void main() {
  float depthC = max(0.0, texture2D(tWater, vUv).r);
  float depthR = max(0.0, texture2D(tWater, vUv + vec2(texel.x, 0.0)).r);
  float depthL = max(0.0, texture2D(tWater, vUv - vec2(texel.x, 0.0)).r);
  float depthU = max(0.0, texture2D(tWater, vUv + vec2(0.0, texel.y)).r);
  float depthD = max(0.0, texture2D(tWater, vUv - vec2(0.0, texel.y)).r);

  float tC = texture2D(tTerrain, vUv).r * terrainScale;
  float tR = texture2D(tTerrain, vUv + vec2(texel.x, 0.0)).r * terrainScale;
  float tL = texture2D(tTerrain, vUv - vec2(texel.x, 0.0)).r * terrainScale;
  float tU = texture2D(tTerrain, vUv + vec2(0.0, texel.y)).r * terrainScale;
  float tD = texture2D(tTerrain, vUv - vec2(0.0, texel.y)).r * terrainScale;

  float sC = tC + depthC;
  float sR = tR + depthR;
  float sL = tL + depthL;
  float sU = tU + depthU;
  float sD = tD + depthD;

  // Gradients in world space
  float dhdx = (sR - sL) / (2.0 * cellSize);
  float dhdz = (sU - sD) / (2.0 * cellSize);

  // Surface normal: (-dhdx, 1, -dhdz) normalized
  vec3 n = normalize(vec3(-dhdx, 1.0, -dhdz));

  // Pack into RGB. Also write water depth in alpha for the renderer to use
  // for foam/shoreline coloring.
  gl_FragColor = vec4(n * 0.5 + 0.5, depthC);
}

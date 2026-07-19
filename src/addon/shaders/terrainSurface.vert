precision highp float;

/**
 * Terrain vertex shader.
 * Displaces vertices along Y using the terrain heightmap and computes
 * a face normal for cheap shading.
 */

uniform sampler2D tTerrain;
uniform float uTerrainScale;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
  vUv = uv;
  float h = texture2D(tTerrain, uv).r * uTerrainScale;

  vec3 pos = position;
  pos.y = h;

  // Approximate normal using neighbor samples
  float texel = 1.0 / 256.0; // matches simulation resolution; oversized on purpose
  float hL = texture2D(tTerrain, uv - vec2(texel, 0.0)).r * uTerrainScale;
  float hR = texture2D(tTerrain, uv + vec2(texel, 0.0)).r * uTerrainScale;
  float hD = texture2D(tTerrain, uv - vec2(0.0, texel)).r * uTerrainScale;
  float hU = texture2D(tTerrain, uv + vec2(0.0, texel)).r * uTerrainScale;
  vNormal = normalize(vec3(hL - hR, 0.1, hD - hU));

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}

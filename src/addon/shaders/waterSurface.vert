precision highp float;

/**
 * Water surface vertex shader.
 *
 * Displaces the plane vertices along Y using the surface height
 * (terrain + water depth) sampled from the simulation textures.
 * Also passes through world position and UV for the fragment shader.
 */

uniform sampler2D tWater;
uniform sampler2D tTerrain;
uniform float uTerrainScale;
uniform float uWorldSize;

attribute vec2 uv2;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;

void main() {
  vUv = uv;

  float depth = max(0.0, texture2D(tWater, uv).r);
  float terrainH = texture2D(tTerrain, uv).r * uTerrainScale;

  // The plane geometry was rotated -90deg around X so its XY plane became XZ.
  // After rotation, geometry-local Y maps to world Z; we displace along world Y
  // by setting position.z (which after the rotateX equals original position.y?).
  // To keep things simple we displace the *pre-rotation* Y attribute using a
  // vec3 built here. We rely on `position` being the post-rotation attribute
  // because geometry.rotateX bakes the rotation into vertex positions.
  //
  // PlaneGeometry vertices have x and y varying; after rotateX(-90deg) those
  // become x and z. So world Y is what we set here as the displacement.
  vec3 pos = position;
  pos.y = terrainH + depth;

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;
  vViewDir = cameraPosition - worldPos.xyz;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}

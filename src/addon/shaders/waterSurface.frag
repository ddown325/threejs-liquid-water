precision highp float;

/**
 * Water surface fragment shader.
 *
 * Inputs:
 *   tWater   - water state texture (R = depth in world units)
 *   tTerrain - terrain heightmap (R = normalized 0..1)
 *   tNormals - computed surface normals (RGB = normal, A = depth)
 *   uTerrainScale - converts normalized terrain to world height
 *   uWorldSize    - size of the simulation domain in world units
 *   uTime         - elapsed time for animated normals
 *   uShallowColor, uDeepColor - water tint at shallow vs deep
 *   uOpacity      - overall water opacity
 *   uFoamStrength - shoreline foam intensity
 *
 * The water surface is rendered as a flat plane displaced to (terrain + depth)
 * in the vertex shader. The fragment shader then:
 *   1. Discards fragments where water depth is below a threshold (no water)
 *   2. Computes a depth-based color blend (shallow -> deep)
 *   3. Adds small animated ripples perturbing the surface normal
 *   4. Computes a simple fresnel-style reflection color (sky-ish)
 *   5. Adds shoreline foam where depth is small but > 0
 *
 * The result is a believable water surface that visibly sits on top of terrain
 * and shows pooling at multiple elevations.
 */

uniform sampler2D tWater;
uniform sampler2D tTerrain;
uniform sampler2D tNormals;
uniform float uTerrainScale;
uniform float uWorldSize;
uniform float uTime;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uSkyColor;
uniform float uOpacity;
uniform float uFoamStrength;
uniform float uWaveStrength;
uniform float uSpecularStrength;
uniform vec3 uLightDir;
uniform vec3 uCameraPos;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;

// Simple hash for noise
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  float depth = texture2D(tWater, vUv).r;
  depth = max(0.0, depth);

  // Discard fragments with effectively no water
  if (depth < 0.002) discard;

  // Read surface normal (already includes terrain slope contribution)
  vec3 normal = texture2D(tNormals, vUv).rgb * 2.0 - 1.0;
  normal = normalize(normal);

  // Animate the normal with small scrolling noise for "shimmer"
  vec2 rippleUv1 = vUv * 18.0 + uTime * 0.35;
  vec2 rippleUv2 = vUv * 22.0 - uTime * 0.28;
  float r1 = noise2(rippleUv1) - 0.5;
  float r2 = noise2(rippleUv2) - 0.5;
  vec3 tangentRipple = vec3(r1, 0.0, r2) * uWaveStrength;
  normal = normalize(normal + tangentRipple);

  // Depth-based color blend
  float depthFactor = clamp(depth / 1.5, 0.0, 1.0);
  vec3 waterColor = mix(uShallowColor, uDeepColor, depthFactor);

  // View direction
  vec3 viewDir = normalize(uCameraPos - vWorldPos);

  // Fresnel (Schlick) - more reflective at grazing angles
  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
  fresnel = mix(0.02, 1.0, fresnel);

  // Sky reflection color
  vec3 reflectDir = reflect(-viewDir, normal);
  float skyGradient = clamp(reflectDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 skyColor = mix(uSkyColor * 0.6, uSkyColor, skyGradient);

  // Specular highlight from the sun
  vec3 lightDir = normalize(uLightDir);
  vec3 halfDir = normalize(viewDir + lightDir);
  float spec = pow(max(dot(normal, halfDir), 0.0), 64.0) * uSpecularStrength;

  // Shoreline foam: where depth is small but nonzero
  float foamMask = 1.0 - smoothstep(0.0, 0.25, depth);
  float foamNoise = noise2(vUv * 60.0 + uTime * 0.6) * 0.6 + 0.4;
  vec3 foamColor = vec3(0.95, 0.97, 1.0) * foamNoise * foamMask * uFoamStrength;

  // Combine base water + reflection + specular + foam
  vec3 color = mix(waterColor, skyColor, fresnel * 0.6);
  color += spec * vec3(1.0, 0.95, 0.85);
  color += foamColor;

  // Alpha: more opaque when deeper, slight transparency when shallow
  float alpha = mix(uOpacity * 0.7, uOpacity, depthFactor);
  alpha = clamp(alpha + foamMask * 0.3, 0.0, 1.0);

  gl_FragColor = vec4(color, alpha);
}

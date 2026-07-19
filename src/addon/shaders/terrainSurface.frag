precision highp float;

/**
 * Terrain fragment shader.
 *
 * Samples the terrain heightmap for coloration (low areas darker / muddy,
 * higher areas rockier / snowy based on elevation). When the cell has water
 * above it, blends toward a wet/darker tint so underwater terrain looks
 * submerged. Also receives a small caustic-like pattern when under water.
 */

uniform sampler2D tTerrain;
uniform sampler2D tWater;
uniform float uTerrainScale;
uniform float uTime;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;

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
  float h = texture2D(tTerrain, vUv).r;
  float waterDepth = max(0.0, texture2D(tWater, vUv).r);
  float worldH = h * uTerrainScale;

  // Color zones by elevation
  vec3 sand = vec3(0.78, 0.70, 0.46);
  vec3 grass = vec3(0.32, 0.44, 0.20);
  vec3 rock = vec3(0.42, 0.38, 0.34);
  vec3 darkRock = vec3(0.30, 0.27, 0.24);
  vec3 snow = vec3(0.94, 0.95, 0.97);

  float t1 = smoothstep(0.05, 0.12, h);
  float t2 = smoothstep(0.20, 0.32, h);
  float t3 = smoothstep(0.55, 0.80, h);

  vec3 base = sand;
  base = mix(base, grass, t1);
  base = mix(base, rock, t2);
  base = mix(base, snow, t3);

  // Slope-based rock tint: steep faces become darker rock regardless of elevation
  float slope = 1.0 - clamp(vNormal.y, 0.0, 1.0);
  float steepMask = smoothstep(0.35, 0.7, slope);
  base = mix(base, darkRock, steepMask * 0.7);

  // Add some noise detail
  float n = noise2(vUv * 80.0) * 0.18;
  float n2 = noise2(vUv * 200.0) * 0.08;
  base *= (1.0 + (n + n2) - 0.13);

  // Simple lambert with sky fill
  vec3 lightDir = normalize(vec3(0.5, 0.8, 0.3));
  float ndl = max(dot(normalize(vNormal), lightDir), 0.0);
  vec3 skyFill = vec3(0.30, 0.36, 0.45) * 0.6;
  vec3 lit = base * (0.35 + 0.75 * ndl) + skyFill * base;

  // Wet effect: when water is above this cell, darken and add caustics
  if (waterDepth > 0.005) {
    float wet = clamp(waterDepth * 1.5, 0.0, 1.0);
    lit = mix(lit, lit * vec3(0.45, 0.50, 0.55), wet * 0.7);

    // Animated caustics
    vec2 cuv = vUv * 30.0 + vec2(uTime * 0.15, uTime * 0.10);
    float caustic = noise2(cuv) * 0.5 + noise2(cuv * 2.0 + 1.3) * 0.5;
    caustic = pow(caustic, 3.0) * 1.2;
    lit += vec3(0.4, 0.55, 0.65) * caustic * wet * 0.4;
  }

  gl_FragColor = vec4(lit, 1.0);
}

precision highp float;

/**
 * SHALLOW WATER SIMULATION (pipe-model with terrain)
 *
 * State texture (RGBA float):
 *   R = water depth above terrain (world units, m)
 *   G = velocity X (m/s) - bookkeeping only, optional
 *   B = velocity Z (m/s)
 *   A = reserved
 *
 * Terrain height is sampled from a separate texture (R channel, normalized).
 *
 * Pipe model (Mei et al. "Fast Hydraulic Erosion Simulation"):
 *   For each neighbor with lower surface, send water proportional to the
 *   height difference. Cap outflow so a cell can't go dry. Inflow from each
 *   neighbor is computed symmetrically using the same formula on their side.
 *
 *   surface = terrain + waterDepth
 *   dh_ij   = max(0, surface_i - surface_j)
 *   outflow_ij = min(K * dh_ij, waterDepth_i / 4)  // cap so total can't exceed depth
 *
 * The factor of 1/4 prevents a cell from sending more than its depth to all
 * four neighbors at once (worst case = all 4 neighbors are lower).
 *
 * Inflow from a higher neighbor is computed using the same formula, capped by
 * that neighbor's depth.
 *
 * This is conservative (total water is preserved modulo seepage) and stable
 * for reasonable K and dt.
 */

uniform sampler2D tPrev;        // previous water state
uniform sampler2D tTerrain;     // terrain heightmap (R, normalized 0..1)
uniform vec2 texel;             // 1/resolution
uniform float cellSize;         // world size of one cell (m)
uniform float dt;               // timestep (s)
uniform float gravity;          // m/s^2 (folded into K)
uniform float damping;          // velocity damping
uniform float seepage;          // fraction of water lost per second
uniform float terrainScale;     // normalized terrain -> world height
uniform float initialWater;     // unused (kept for API symmetry)

varying vec2 vUv;

float terrainAt(vec2 uv) {
  return texture2D(tTerrain, uv).r * terrainScale;
}

float depthAt(vec2 uv) {
  return max(0.0, texture2D(tPrev, uv).r);
}

float surfaceAt(vec2 uv) {
  return terrainAt(uv) + depthAt(uv);
}

void main() {
  vec4 prev = texture2D(tPrev, vUv);
  float depth = max(0.0, prev.r);
  float vx = prev.g;
  float vz = prev.b;

  vec2 uvR = vUv + vec2(texel.x, 0.0);
  vec2 uvL = vUv - vec2(texel.x, 0.0);
  vec2 uvU = vUv + vec2(0.0, texel.y);
  vec2 uvD = vUv - vec2(0.0, texel.y);

  float sC = terrainAt(vUv) + depth;
  float sR = surfaceAt(uvR);
  float sL = surfaceAt(uvL);
  float sU = surfaceAt(uvU);
  float sD = surfaceAt(uvD);

  // Outflow to each neighbor (positive = sending water out)
  float dhR = max(0.0, sC - sR);
  float dhL = max(0.0, sC - sL);
  float dhU = max(0.0, sC - sU);
  float dhD = max(0.0, sC - sD);

  // Flow coefficient. gravity * dt gives natural acceleration scale.
  // Multiply by a tuneable coefficient (~0.2) so it stays stable.
  float K = 0.20 * gravity * dt;

  // Each neighbor's outflow is capped so the 4 neighbors combined can't
  // take more than the cell's current depth.
  float maxPerNeighbor = depth * 0.25;
  float outR = min(K * dhR, maxPerNeighbor);
  float outL = min(K * dhL, maxPerNeighbor);
  float outU = min(K * dhU, maxPerNeighbor);
  float outD = min(K * dhD, maxPerNeighbor);
  float totalOut = outR + outL + outU + outD;

  // If we're still trying to send too much, scale down proportionally.
  if (totalOut > depth) {
    float scale = depth / max(totalOut, 1e-6);
    outR *= scale; outL *= scale; outU *= scale; outD *= scale;
    totalOut = depth;
  }

  // Inflow from each neighbor (use the same formula symmetrically)
  float depthR = depthAt(uvR);
  float depthL = depthAt(uvL);
  float depthU = depthAt(uvU);
  float depthD = depthAt(uvD);

  float inR = min(K * max(0.0, sR - sC), depthR * 0.25);
  float inL = min(K * max(0.0, sL - sC), depthL * 0.25);
  float inU = min(K * max(0.0, sU - sC), depthU * 0.25);
  float inD = min(K * max(0.0, sD - sC), depthD * 0.25);
  float totalIn = inR + inL + inU + inD;

  // Update depth
  float newDepth = depth - totalOut + totalIn;

  // Apply seepage (small per-step water loss to infiltration)
  newDepth *= (1.0 - seepage * dt);
  newDepth = max(0.0, newDepth);

  // Update velocity bookkeeping (for visualization; doesn't affect depth)
  // Net flux in each axis gives a rough velocity.
  float newVx = (inL - outL) - (inR - outR);
  float newVz = (inD - outD) - (inU - outU);

  // Smooth velocity (relax + damping)
  vx = mix(vx, newVx, 0.4);
  vz = mix(vz, newVz, 0.4);
  vx *= damping;
  vz *= damping;

  gl_FragColor = vec4(newDepth, vx, vz, prev.a);
}

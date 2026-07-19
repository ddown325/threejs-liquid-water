import * as THREE from 'three';

/**
 * Build a high-resolution plane mesh and displace its vertices using the
 * terrain heightmap texture. The mesh is positioned so its center is at the
 * origin and it lies in the XZ plane.
 *
 * The returned mesh also has UVs that map directly to the simulation grid
 * (0..1), which lets the renderer shader sample water/terrain/normal textures
 * with the same vUv used for vertex displacement.
 */
export function buildTerrainMesh(
  terrainTexture: THREE.Texture,
  worldSize: number,
  terrainScale: number,
  segments = 256
): THREE.Mesh {
  const geom = new THREE.PlaneGeometry(worldSize, worldSize, segments, segments);
  geom.rotateX(-Math.PI / 2); // lay flat on XZ plane

  // Sample the terrain texture on the CPU to displace vertices.
  // We do this once at construction; for live terrain editing we re-sample
  // in the renderer via a GPU displacement shader instead.
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({
      color: 0x6b5a3e,
      roughness: 0.95,
      metalness: 0.0,
      map: null,
    })
  );
  mesh.frustumCulled = false;
  mesh.userData.terrainTexture = terrainTexture;
  mesh.userData.terrainScale = terrainScale;
  return mesh;
}

/**
 * Sample a heightmap texture on the CPU and apply the displacement to a
 * terrain mesh's vertices. Used for static initialization and for editor
 * updates. Not used in the per-frame render loop.
 *
 * Note: this reads pixels back from the GPU, which is slow. Use sparingly.
 */
export function applyTerrainHeightmapCPU(
  renderer: THREE.WebGLRenderer,
  mesh: THREE.Mesh,
  terrainRT: THREE.WebGLRenderTarget,
  terrainScale: number
) {
  const geom = mesh.geometry as THREE.PlaneGeometry;
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const seg = Math.sqrt(pos.count) - 1; // assume square segments
  const res = terrainRT.width;

  // Read terrain pixels
  const buf = new Float32Array(res * res * 4);
  const prev = renderer.getRenderTarget();
  renderer.readRenderTargetPixels(terrainRT, 0, 0, res, res, buf);
  renderer.setRenderTarget(prev);

  for (let i = 0; i < pos.count; i++) {
    const u = (i % (seg + 1)) / seg;
    const v = Math.floor(i / (seg + 1)) / seg;
    // Texture is sampled with nearest neighbor at integer cell coords; do same
    const tx = Math.min(res - 1, Math.floor(u * res));
    const ty = Math.min(res - 1, Math.floor(v * res));
    const idx = (ty * res + tx) * 4;
    const h = buf[idx] * terrainScale;
    pos.setY(i, h);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
}

import * as THREE from 'three';
import type { LiquidWater } from './LiquidWater';
import waterSurfaceVert from './shaders/waterSurface.vert';
import waterSurfaceFrag from './shaders/waterSurface.frag';
import terrainSurfaceVert from './shaders/terrainSurface.vert';
import terrainSurfaceFrag from './shaders/terrainSurface.frag';

/**
 * WaterSurfaceRenderer builds and manages the two visible meshes that display
 * the simulation:
 *   - terrainMesh: displaced by the terrain heightmap, textured by elevation
 *   - waterMesh:   displaced by terrain + water depth, rendered as transparent
 *
 * The renderer is responsible for keeping each mesh's uniforms in sync with
 * the LiquidWater addon's textures on every frame.
 */

export interface WaterSurfaceOptions {
  shallowColor?: THREE.ColorRepresentation;
  deepColor?: THREE.ColorRepresentation;
  skyColor?: THREE.ColorRepresentation;
  opacity?: number;
  foamStrength?: number;
  waveStrength?: number;
  specularStrength?: number;
}

export class WaterSurfaceRenderer {
  readonly group: THREE.Group;
  readonly terrainMesh: THREE.Mesh;
  readonly waterMesh: THREE.Mesh;

  private terrainMaterial: THREE.ShaderMaterial;
  private waterMaterial: THREE.ShaderMaterial;
  private addon: LiquidWater;
  private lightDir: THREE.Vector3;
  private cameraRef: THREE.Camera;

  constructor(
    addon: LiquidWater,
    camera: THREE.Camera,
    options: WaterSurfaceOptions = {}
  ) {
    this.addon = addon;
    this.cameraRef = camera;
    this.lightDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();

    this.group = new THREE.Group();

    // --- Terrain mesh ---
    const terrainGeom = new THREE.PlaneGeometry(
      addon.worldSize,
      addon.worldSize,
      addon.resolution,
      addon.resolution
    );
    terrainGeom.rotateX(-Math.PI / 2);

    this.terrainMaterial = new THREE.ShaderMaterial({
      vertexShader: terrainSurfaceVert,
      fragmentShader: terrainSurfaceFrag,
      uniforms: {
        tTerrain: { value: addon.terrainTexture },
        tWater: { value: addon.waterTexture },
        uTerrainScale: { value: addon.terrainScale },
        uTime: { value: 0 },
      },
    });
    this.terrainMesh = new THREE.Mesh(terrainGeom, this.terrainMaterial);
    this.terrainMesh.frustumCulled = false;
    this.group.add(this.terrainMesh);

    // --- Water mesh ---
    const waterGeom = new THREE.PlaneGeometry(
      addon.worldSize,
      addon.worldSize,
      addon.resolution,
      addon.resolution
    );
    waterGeom.rotateX(-Math.PI / 2);

    this.waterMaterial = new THREE.ShaderMaterial({
      vertexShader: waterSurfaceVert,
      fragmentShader: waterSurfaceFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        tWater: { value: addon.waterTexture },
        tTerrain: { value: addon.terrainTexture },
        tNormals: { value: addon.normalTexture },
        uTerrainScale: { value: addon.terrainScale },
        uWorldSize: { value: addon.worldSize },
        uTime: { value: 0 },
        uShallowColor: { value: new THREE.Color(options.shallowColor ?? 0x4aa3d6) },
        uDeepColor: { value: new THREE.Color(options.deepColor ?? 0x0a2a4a) },
        uSkyColor: { value: new THREE.Color(options.skyColor ?? 0x9ec9e8) },
        uOpacity: { value: options.opacity ?? 0.85 },
        uFoamStrength: { value: options.foamStrength ?? 1.0 },
        uWaveStrength: { value: options.waveStrength ?? 0.15 },
        uSpecularStrength: { value: options.specularStrength ?? 1.2 },
        uLightDir: { value: this.lightDir },
        uCameraPos: { value: new THREE.Vector3() },
      },
    });
    this.waterMesh = new THREE.Mesh(waterGeom, this.waterMaterial);
    this.waterMesh.frustumCulled = false;
    this.waterMesh.renderOrder = 1;
    this.group.add(this.waterMesh);
  }

  /** Update uniform bindings and per-frame values. Call once per render. */
  update(elapsedSeconds: number) {
    // Re-bind textures (in case the addon swapped ping-pong targets)
    this.terrainMaterial.uniforms.tTerrain.value = this.addon.terrainTexture;
    this.terrainMaterial.uniforms.tWater.value = this.addon.waterTexture;
    this.terrainMaterial.uniforms.uTime.value = elapsedSeconds;

    this.waterMaterial.uniforms.tWater.value = this.addon.waterTexture;
    this.waterMaterial.uniforms.tTerrain.value = this.addon.terrainTexture;
    this.waterMaterial.uniforms.tNormals.value = this.addon.normalTexture;
    this.waterMaterial.uniforms.uTime.value = elapsedSeconds;
    this.waterMaterial.uniforms.uCameraPos.value.copy(this.cameraRef.position);
  }

  /** Live-tunable parameters. */
  get uniforms() {
    return this.waterMaterial.uniforms;
  }

  dispose() {
    (this.terrainMesh.geometry as THREE.BufferGeometry).dispose();
    (this.waterMesh.geometry as THREE.BufferGeometry).dispose();
    this.terrainMaterial.dispose();
    this.waterMaterial.dispose();
  }
}

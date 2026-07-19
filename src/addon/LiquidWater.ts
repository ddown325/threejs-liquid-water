import * as THREE from 'three';
import passthroughVert from './shaders/passthrough.vert';
import simFrag from './shaders/sim.frag';
import brushFrag from './shaders/brush.frag';
import normalsFrag from './shaders/normals.frag';
import terrainFrag from './shaders/terrain.frag';

/**
 * LiquidWater — terrain-aware shallow water simulation addon for three.js.
 *
 * Unlike the original Wallace/jeantimex wave-equation water (which assumes a
 * single flat pool), this addon models water sitting on top of a 2D heightmap
 * terrain and flowing downhill under gravity. It supports:
 *
 *   - Multiple pool levels: water on a plateau will cascade into lower basins
 *   - Procedurally editable terrain (raise / lower / smooth brushes)
 *   - Water source / drain brushes
 *   - Surface normals exported for refraction/reflection rendering
 *   - Plug-in renderer: pass the water state textures to your own shader
 *
 * Simulation runs on a configurable grid (default 256x256). Each cell stores:
 *   R = water depth above terrain (world units)
 *   G = velocity X
 *   B = velocity Z
 *   A = reserved
 *
 * Terrain is stored in a separate texture as a normalized heightmap. The
 * `terrainScale` uniform converts normalized height to world height.
 */

export type BrushOp = 'water' | 'drain' | 'raise' | 'lower' | 'smooth';

export interface LiquidWaterOptions {
  /** Simulation grid resolution. Must be a power of two for clean mip levels. */
  resolution?: number;
  /** World size of the simulation domain (square, in meters). */
  worldSize?: number;
  /** Multiplier that converts normalized terrain height (0..1) to world height. */
  terrainScale?: number;
  /** Gravity for the shallow-water pipe model, in m/s^2. */
  gravity?: number;
  /** Velocity damping factor per simulation step (0..1). */
  damping?: number;
  /** Water lost per second to infiltration (small positive number). */
  seepage?: number;
  /** Simulation timestep per step (seconds). */
  dt?: number;
}

const DEFAULTS: Required<LiquidWaterOptions> = {
  resolution: 256,
  worldSize: 20,
  terrainScale: 4.0,
  gravity: 9.81,
  damping: 0.985,
  seepage: 0.015,
  dt: 0.05,
};

export class LiquidWater {
  readonly resolution: number;
  readonly worldSize: number;
  readonly terrainScale: number;
  gravity: number;
  damping: number;
  seepage: number;
  dt: number;

  /** Water state ping-pong targets (RGBA float). */
  waterA: THREE.WebGLRenderTarget;
  waterB: THREE.WebGLRenderTarget;
  /** Static terrain heightmap (R = normalized height 0..1). */
  terrain: THREE.WebGLRenderTarget;
  /** Surface normals computed from water + terrain (RGB = normal, A = depth). */
  normals: THREE.WebGLRenderTarget;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;

  private simMaterial: THREE.ShaderMaterial;
  private brushMaterial: THREE.ShaderMaterial;
  private normalMaterial: THREE.ShaderMaterial;
  private terrainMaterial: THREE.ShaderMaterial;

  private terrainDirty = true;

  constructor(renderer: THREE.WebGLRenderer, options: LiquidWaterOptions = {}) {
    const opts = { ...DEFAULTS, ...options };
    this.renderer = renderer;
    this.resolution = opts.resolution;
    this.worldSize = opts.worldSize;
    this.terrainScale = opts.terrainScale;
    this.gravity = opts.gravity;
    this.damping = opts.damping;
    this.seepage = opts.seepage;
    this.dt = opts.dt;

    const size = this.resolution;
    const textureType = this.pickTextureType();
    const rtOptions: THREE.RenderTargetOptions = {
      type: textureType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
      depthBuffer: false,
    };

    this.waterA = new THREE.WebGLRenderTarget(size, size, rtOptions);
    this.waterB = new THREE.WebGLRenderTarget(size, size, rtOptions);
    this.terrain = new THREE.WebGLRenderTarget(size, size, {
      ...rtOptions,
      // Terrain benefits from linear filtering for nicer surface meshing
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.normals = new THREE.WebGLRenderTarget(size, size, {
      ...rtOptions,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    const geom = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geom, new THREE.ShaderMaterial());
    this.scene.add(this.quad);

    const texel = new THREE.Vector2(1 / size, 1 / size);

    this.simMaterial = new THREE.ShaderMaterial({
      vertexShader: passthroughVert,
      fragmentShader: simFrag,
      uniforms: {
        tPrev: { value: null },
        tTerrain: { value: this.terrain.texture },
        texel: { value: texel },
        cellSize: { value: this.worldSize / size },
        dt: { value: this.dt },
        gravity: { value: this.gravity },
        damping: { value: this.damping },
        seepage: { value: this.seepage },
        terrainScale: { value: this.terrainScale },
        initialWater: { value: 0.0 },
      },
    });

    this.brushMaterial = new THREE.ShaderMaterial({
      vertexShader: passthroughVert,
      fragmentShader: brushFrag,
      uniforms: {
        tPrev: { value: null },
        uCenter: { value: new THREE.Vector2() },
        uRadius: { value: 0.04 },
        uStrength: { value: 1.0 },
        uOp: { value: 0 },
        texel: { value: texel },
        uDelta: { value: 0.0 },
      },
    });

    this.normalMaterial = new THREE.ShaderMaterial({
      vertexShader: passthroughVert,
      fragmentShader: normalsFrag,
      uniforms: {
        tWater: { value: this.waterA.texture },
        tTerrain: { value: this.terrain.texture },
        texel: { value: texel },
        terrainScale: { value: this.terrainScale },
        cellSize: { value: this.worldSize / size },
      },
    });

    this.terrainMaterial = new THREE.ShaderMaterial({
      vertexShader: passthroughVert,
      fragmentShader: terrainFrag,
      uniforms: {
        uSeed: { value: Math.random() },
        uRoughness: { value: 1.0 },
        uMountainHeight: { value: 0.45 },
        uPlateauHeight: { value: 0.45 },
        uBasinDepth: { value: 0.30 },
      },
    });

    this.generateTerrain();
  }

  private pickTextureType(): THREE.TextureDataType {
    const supportsFloat =
      this.renderer.capabilities.isWebGL2 &&
      this.renderer.extensions.has('EXT_color_buffer_float');
    return supportsFloat ? THREE.FloatType : THREE.HalfFloatType;
  }

  /** Regenerate the procedural terrain. Call after changing terrainMaterial uniforms. */
  generateTerrain(seed?: number) {
    if (seed !== undefined) {
      this.terrainMaterial.uniforms.uSeed.value = seed;
    }
    this.renderToTarget(this.terrainMaterial, this.terrain);
    this.terrainDirty = true;
  }

  /** Terrain generation parameters (live uniforms). Tweak then call generateTerrain(). */
  get terrainParams() {
    return this.terrainMaterial.uniforms;
  }

  /**
   * Apply a brush at the given UV coordinates.
   * @param op Operation to apply
   * @param uv Center of the brush in UV space [0..1]
   * @param radius Brush radius in UV space
   * @param strength Strength multiplier
   */
  applyBrush(op: BrushOp, uv: THREE.Vector2, radius: number, strength: number) {
    const opCode = { water: 0, drain: 1, raise: 2, lower: 3, smooth: 4 }[op];
    this.brushMaterial.uniforms.uOp.value = opCode;
    this.brushMaterial.uniforms.uRadius.value = radius;
    this.brushMaterial.uniforms.uStrength.value = strength;

    if (op === 'water' || op === 'drain') {
      // Edit water state
      this.brushMaterial.uniforms.tPrev.value = this.waterA.texture;
      this.brushMaterial.uniforms.uCenter.value.copy(uv);
      this.renderToTarget(this.brushMaterial, this.waterB);
      this.swapWater();
    } else {
      // Edit terrain
      this.brushMaterial.uniforms.tPrev.value = this.terrain.texture;
      this.brushMaterial.uniforms.uCenter.value.copy(uv);
      this.renderToTarget(this.brushMaterial, this.waterB); // reuse B as scratch
      // Copy back into terrain target
      this.copyTexture(this.waterB.texture, this.terrain);
      this.terrainDirty = true;
    }
  }

  /** Step the simulation forward by one tick. */
  step() {
    // Update water simulation
    this.simMaterial.uniforms.tPrev.value = this.waterA.texture;
    this.simMaterial.uniforms.tTerrain.value = this.terrain.texture;
    this.simMaterial.uniforms.dt.value = this.dt;
    this.simMaterial.uniforms.gravity.value = this.gravity;
    this.simMaterial.uniforms.damping.value = this.damping;
    this.simMaterial.uniforms.seepage.value = this.seepage;
    this.renderToTarget(this.simMaterial, this.waterB);
    this.swapWater();

    // Recompute surface normals
    this.normalMaterial.uniforms.tWater.value = this.waterA.texture;
    this.normalMaterial.uniforms.tTerrain.value = this.terrain.texture;
    this.renderToTarget(this.normalMaterial, this.normals);
  }

  /** Read the current water depth texture (for use by your renderer). */
  get waterTexture(): THREE.Texture {
    return this.waterA.texture;
  }

  /** Read the terrain heightmap (normalized 0..1, in R channel). */
  get terrainTexture(): THREE.Texture {
    return this.terrain.texture;
  }

  /** Read the latest computed surface normals (RGB = normal, A = water depth). */
  get normalTexture(): THREE.Texture {
    return this.normals.texture;
  }

  /** Reset water state to empty (depth = 0 everywhere). */
  clearWater() {
    this.clearTarget(this.waterA);
    this.clearTarget(this.waterB);
  }

  /** Fill the entire terrain with a uniform water depth (world units). */
  fillWater(depth: number) {
    const previousTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.waterA);
    this.renderer.setClearColor(new THREE.Color(depth, 0, 0), 1);
    this.renderer.clear(true, false, false);
    this.renderer.setRenderTarget(this.waterB);
    this.renderer.clear(true, false, false);
    this.renderer.setRenderTarget(previousTarget);
  }

  // ---- internals ----

  private swapWater() {
    const t = this.waterA;
    this.waterA = this.waterB;
    this.waterB = t;
  }

  private renderToTarget(material: THREE.Material, target: THREE.WebGLRenderTarget) {
    const prev = this.renderer.getRenderTarget();
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);
  }

  private copyTexture(src: THREE.Texture, dst: THREE.WebGLRenderTarget) {
    // Reuse brushMaterial? Simpler: a tiny inline copy via the sim material isn't possible.
    // Instead we use a ScreenPass-like trick: temporarily set terrainMaterial? No - we
    // need a generic copy. Implement with a minimal ShaderMaterial.
    if (!this.copyMaterial) {
      this.copyMaterial = new THREE.ShaderMaterial({
        vertexShader: passthroughVert,
        fragmentShader: `
          precision highp float;
          uniform sampler2D tSrc;
          varying vec2 vUv;
          void main() { gl_FragColor = texture2D(tSrc, vUv); }
        `,
        uniforms: { tSrc: { value: null } },
      });
    }
    this.copyMaterial.uniforms.tSrc.value = src;
    this.renderToTarget(this.copyMaterial, dst);
  }
  private copyMaterial: THREE.ShaderMaterial | null = null;

  private clearTarget(rt: THREE.WebGLRenderTarget) {
    const prev = this.renderer.getRenderTarget();
    const prevColor = new THREE.Color();
    this.renderer.getClearColor(prevColor);
    const prevAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(rt);
    this.renderer.clear(true, false, false);
    this.renderer.setRenderTarget(prev);
    this.renderer.setClearColor(prevColor, prevAlpha);
  }

  dispose() {
    this.waterA.dispose();
    this.waterB.dispose();
    this.terrain.dispose();
    this.normals.dispose();
    this.simMaterial.dispose();
    this.brushMaterial.dispose();
    this.normalMaterial.dispose();
    this.terrainMaterial.dispose();
    this.copyMaterial?.dispose();
    (this.quad.geometry as THREE.BufferGeometry).dispose();
  }
}

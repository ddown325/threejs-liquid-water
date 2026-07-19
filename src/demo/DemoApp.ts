import * as THREE from 'three';
import GUI from 'lil-gui';
import { LiquidWater } from '../addon/LiquidWater';
import { WaterSurfaceRenderer } from '../addon/WaterSurfaceRenderer';
import { OrbitController } from './OrbitController';
import { BrushController, BrushMode } from './BrushController';

/**
 * Demo scene that exercises the LiquidWater addon.
 *
 * - Creates a renderer, scene, and camera
 * - Instantiates the addon and the surface renderer
 * - Sets up an environment (sky, ground, sun direction)
 * - Wires up orbit + brush controls
 * - Provides a lil-gui panel for tweaking simulation/render parameters
 * - Animates the demo loop
 */
export class DemoApp {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private orbit: OrbitController;
  private brush: BrushController;
  private addon: LiquidWater;
  private surface: WaterSurfaceRenderer;
  private gui: GUI;
  stepsPerFrame = 2;
  autoRain = false;
  private rainCenter = new THREE.Vector2(0.25, 0.7);

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(0x9ec9e8, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9ec9e8, 30, 80);

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      200
    );

    this.orbit = new OrbitController(this.camera, this.renderer.domElement);

    // Addon + surface renderer
    this.addon = new LiquidWater(this.renderer, {
      resolution: 256,
      worldSize: 20,
      terrainScale: 4.0,
      dt: 0.05,
    });

    this.surface = new WaterSurfaceRenderer(this.addon, this.camera, {
      shallowColor: 0x6cc2e8,
      deepColor: 0x0c2747,
      skyColor: 0xa8cfe8,
      opacity: 0.88,
      foamStrength: 1.5,
      waveStrength: 0.20,
      specularStrength: 2.4,
    });
    this.scene.add(this.surface.group);

    // Environment: a large sky dome
    const skyGeo = new THREE.SphereGeometry(100, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec3 dir = normalize(vWorldPos);
          float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 horizon = vec3(0.78, 0.85, 0.92);
          vec3 zenith = vec3(0.30, 0.55, 0.85);
          vec3 col = mix(horizon, zenith, t);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);

    // Directional "sun" light for specularity on water
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.0);
    sun.position.set(8, 12, 5);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x6a7a8a, 0.5));

    // Brush controller
    this.brush = new BrushController(this.renderer.domElement, this.camera, this.addon);

    // Keyboard shortcuts to switch brush mode
    window.addEventListener('keydown', this.onKey);

    // lil-gui panel
    this.gui = new GUI({ title: 'Liquid Water Controls' });
    this.setupGUI();

    // Seed an initial water puddle on the plateau so users immediately see flow
    setTimeout(() => this.seedInitialWater(), 200);

    window.addEventListener('resize', this.onResize);
  }

  private onKey = (e: KeyboardEvent) => {
    const map: Record<string, BrushMode> = {
      '1': 'water',
      '2': 'raise',
      '3': 'lower',
      '4': 'drain',
      '5': 'smooth',
    };
    if (map[e.key]) {
      this.brush.setMode(map[e.key]);
      this.gui.controllersRecursive().forEach((c) => c.updateDisplay());
    }
  };

  private seedInitialWater() {
    // Add a puddle on the plateau (top-left) — it should fill up and
    // cascade down the channel into the basin.
    const plateauUV = new THREE.Vector2(0.22, 0.72);
    for (let i = 0; i < 8; i++) {
      this.addon.applyBrush('water', plateauUV, 0.08, 1.0);
    }
    // Also seed a small puddle in the basin to show pooling immediately.
    const basinUV = new THREE.Vector2(0.62, 0.38);
    for (let i = 0; i < 4; i++) {
      this.addon.applyBrush('water', basinUV, 0.10, 1.0);
    }
  }

  private setupGUI() {
    const simFolder = this.gui.addFolder('Simulation');
    simFolder
      .add(this, 'stepsPerFrame', 1, 6, 1)
      .name('steps per frame');
    simFolder
      .add(this.addon, 'gravity', 1.0, 30.0, 0.1)
      .name('gravity');
    simFolder
      .add(this.addon, 'damping', 0.9, 1.0, 0.001)
      .name('damping');
    simFolder
      .add(this.addon, 'seepage', 0.0, 0.1, 0.001)
      .name('seepage');
    simFolder
      .add(this.addon, 'dt', 0.01, 0.15, 0.005)
      .name('timestep');

    const brushFolder = this.gui.addFolder('Brush');
    const brushState = {
      mode: 'water' as BrushMode,
      radius: this.brush.radius,
      strength: this.brush.strength,
    };
    brushFolder
      .add(brushState, 'mode', ['water', 'drain', 'raise', 'lower', 'smooth'])
      .name('mode')
      .onChange((v: BrushMode) => this.brush.setMode(v));
    brushFolder
      .add(brushState, 'radius', 0.01, 0.2, 0.005)
      .name('radius')
      .onChange((v: number) => (this.brush.radius = v));
    brushFolder
      .add(brushState, 'strength', 0.1, 2.0, 0.05)
      .name('strength')
      .onChange((v: number) => (this.brush.strength = v));

    const terrainFolder = this.gui.addFolder('Terrain');
    const terrainParams = this.addon.terrainParams;
    const terrainActions = {
      mountain: terrainParams.uMountainHeight.value,
      plateau: terrainParams.uPlateauHeight.value,
      basin: terrainParams.uBasinDepth.value,
      roughness: terrainParams.uRoughness.value,
      regenerate: () => {
        this.addon.generateTerrain(Math.random());
      },
      flatten: () => {
        // Overwrite terrain with flat heightmap
        const prev = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget((this.addon as any).terrain);
        this.renderer.setClearColor(new THREE.Color(0.3, 0, 0), 1);
        this.renderer.clear(true, false, false);
        this.renderer.setRenderTarget(prev);
      },
    };
    terrainFolder.add(terrainActions, 'mountain', 0.0, 0.8, 0.01).name('mountain h').onChange((v: number) => {
      terrainParams.uMountainHeight.value = v;
      this.addon.generateTerrain();
    });
    terrainFolder.add(terrainActions, 'plateau', 0.0, 0.8, 0.01).name('plateau h').onChange((v: number) => {
      terrainParams.uPlateauHeight.value = v;
      this.addon.generateTerrain();
    });
    terrainFolder.add(terrainActions, 'basin', 0.0, 0.6, 0.01).name('basin depth').onChange((v: number) => {
      terrainParams.uBasinDepth.value = v;
      this.addon.generateTerrain();
    });
    terrainFolder.add(terrainActions, 'roughness', 0.0, 2.0, 0.05).name('roughness').onChange((v: number) => {
      terrainParams.uRoughness.value = v;
      this.addon.generateTerrain();
    });
    terrainFolder.add(terrainActions, 'regenerate').name('randomize terrain');
    terrainFolder.add(terrainActions, 'flatten').name('flatten terrain');

    const waterFolder = this.gui.addFolder('Water Appearance');
    const waterUniforms = this.surface.uniforms;
    const waterState = {
      shallow: '#' + new THREE.Color(waterUniforms.uShallowColor.value).getHexString(),
      deep: '#' + new THREE.Color(waterUniforms.uDeepColor.value).getHexString(),
      sky: '#' + new THREE.Color(waterUniforms.uSkyColor.value).getHexString(),
      opacity: waterUniforms.uOpacity.value,
      foam: waterUniforms.uFoamStrength.value,
      wave: waterUniforms.uWaveStrength.value,
      specular: waterUniforms.uSpecularStrength.value,
    };
    waterFolder.addColor(waterState, 'shallow').name('shallow color').onChange((v: string) => {
      waterUniforms.uShallowColor.value.set(v);
    });
    waterFolder.addColor(waterState, 'deep').name('deep color').onChange((v: string) => {
      waterUniforms.uDeepColor.value.set(v);
    });
    waterFolder.addColor(waterState, 'sky').name('sky color').onChange((v: string) => {
      waterUniforms.uSkyColor.value.set(v);
      this.renderer.setClearColor(new THREE.Color(v), 1);
    });
    waterFolder.add(waterState, 'opacity', 0.3, 1.0, 0.01).name('opacity').onChange((v: number) => {
      waterUniforms.uOpacity.value = v;
    });
    waterFolder.add(waterState, 'foam', 0.0, 3.0, 0.05).name('foam').onChange((v: number) => {
      waterUniforms.uFoamStrength.value = v;
    });
    waterFolder.add(waterState, 'wave', 0.0, 0.5, 0.01).name('ripple').onChange((v: number) => {
      waterUniforms.uWaveStrength.value = v;
    });
    waterFolder.add(waterState, 'specular', 0.0, 3.0, 0.05).name('specular').onChange((v: number) => {
      waterUniforms.uSpecularStrength.value = v;
    });

    const actions = {
      clearWater: () => this.addon.clearWater(),
      fillBasin: () => {
        // Add a large water source at the basin to show pooling
        const basinUV = new THREE.Vector2(0.6, 0.4);
        for (let i = 0; i < 25; i++) {
          this.addon.applyBrush('water', basinUV, 0.20, 1.0);
        }
      },
      rain: () => {
        this.autoRain = !this.autoRain;
      },
      reset: () => {
        this.addon.clearWater();
        this.addon.generateTerrain(0.42);
        setTimeout(() => this.seedInitialWater(), 100);
      },
    };
    this.gui.add(actions, 'clearWater').name('clear water');
    this.gui.add(actions, 'fillBasin').name('fill main basin');
    this.gui.add(actions, 'rain').name('toggle rain');
    this.gui.add(actions, 'reset').name('reset scene');
  }

  private onResize = () => {
    const c = this.renderer.domElement.parentElement!;
    this.camera.aspect = c.clientWidth / c.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(c.clientWidth, c.clientHeight);
  };

  private animate = () => {
    requestAnimationFrame(this.animate);
    const t = this.clock.getElapsedTime();

    // Auto-rain: drop water at the plateau
    if (this.autoRain) {
      const jitter = new THREE.Vector2(
        this.rainCenter.x + (Math.random() - 0.5) * 0.1,
        this.rainCenter.y + (Math.random() - 0.5) * 0.1
      );
      this.addon.applyBrush('water', jitter, 0.02, 0.3);
    }

    for (let i = 0; i < this.stepsPerFrame; i++) {
      this.addon.step();
    }
    this.surface.update(t);
    this.renderer.render(this.scene, this.camera);
  };

  start() {
    this.animate();
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    this.orbit.dispose();
    this.brush.dispose();
    this.surface.dispose();
    this.addon.dispose();
    this.gui.destroy();
    this.renderer.dispose();
    this.renderer.domElement.parentElement?.removeChild(this.renderer.domElement);
  }
}

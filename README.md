# threejs-liquid-water

A terrain-aware shallow-water simulation addon for [three.js](https://threejs.org/).
Unlike a single-pool wave-equation water (such as the excellent
[`jeantimex/threejs-water`](https://github.com/jeantimex/threejs-water) this
project builds on), this addon models water sitting on top of a 2D heightmap
terrain and flowing downhill under gravity. Water on an elevated plateau
cascades over the rim and pools in lower basins.

## What's new vs. the original

| Original (jeantimex/threejs-water) | This addon |
| --- | --- |
| Wave equation on a flat rectangular pool | Pipe-model shallow water on a heightmap terrain |
| Water surface is a single horizontal plane | Water surface conforms to terrain, with multiple pool levels |
| No terrain — just pool walls | Procedural terrain with plateaus, channels, and basins |
| Spheres/cubes displace the surface | Brushes add water, drain it, or edit the terrain live |
| Reflections/refractions via cubemap | Depth-based color, fresnel sky reflection, foam, caustics |

The simulation is a GPU pipe-model shallow-water solver (Mei et al. style)
running on a 256×256 grid. Each cell stores:

- `R` — water depth above terrain (world units)
- `G` — velocity X (bookkeeping / visualization)
- `B` — velocity Z
- `A` — reserved

Per step, each cell exchanges flux with its 4 neighbors proportional to the
height difference of their water surfaces, capped so a cell can't go dry.
Inflow from each higher neighbor is computed symmetrically. This conserves
water volume (modulo seepage) and is unconditionally stable for the default
parameters.

## Quick start

```bash
npm install
npm run dev    # http://localhost:5173
```

## Controls

- **Left-drag** — paint with the active brush (default: add water)
- **Right-drag** (or Shift+Left-drag) — orbit camera
- **Wheel** — zoom
- **1** — water source brush
- **2** — raise terrain brush
- **3** — lower terrain brush
- **4** — drain water brush
- **5** — smooth terrain brush

The lil-gui panel exposes simulation parameters (gravity, damping, seepage,
timestep, steps-per-frame), brush parameters (mode, radius, strength), terrain
parameters (mountain height, plateau height, basin depth, roughness), water
appearance (shallow/deep/sky colors, opacity, foam, ripple, specular), and
action buttons (clear water, fill main basin, toggle rain, reset scene).

## Using the addon in your own project

The addon lives under `src/addon/` and is self-contained. Copy the
`src/addon/` folder into your project (or import the files directly).

```ts
import * as THREE from 'three';
import { LiquidWater, WaterSurfaceRenderer } from './addon';

// 1. Create the addon — runs the GPU simulation
const addon = new LiquidWater(renderer, {
  resolution: 256,
  worldSize: 20,      // meters
  terrainScale: 4.0,  // normalized terrain (0..1) -> world height
  gravity: 9.81,
  damping: 0.985,
  seepage: 0.015,
  dt: 0.05,
});

// 2. Create the visible mesh — terrain + water surface
const surface = new WaterSurfaceRenderer(addon, camera, {
  shallowColor: 0x5fb5e6,
  deepColor: 0x0c2747,
  skyColor: 0x9ec9e8,
  opacity: 0.85,
  foamStrength: 1.2,
});
scene.add(surface.group);

// 3. Per-frame: step the simulation, then update the renderer
function animate(t: number) {
  requestAnimationFrame(animate);
  addon.step();
  surface.update(t * 0.001);
  renderer.render(scene, camera);
}

// 4. Interactivity: apply a brush at a UV coordinate
addon.applyBrush('water', new THREE.Vector2(0.5, 0.5), 0.05, 1.0);
```

## Addon API

### `class LiquidWater`

```ts
new LiquidWater(renderer: THREE.WebGLRenderer, options?: LiquidWaterOptions)
```

**Options:**

| Option | Default | Description |
| --- | --- | --- |
| `resolution` | `256` | Grid resolution (power of two recommended) |
| `worldSize` | `20` | World size of the simulation domain in meters |
| `terrainScale` | `4.0` | Multiplier converting normalized terrain height (0..1) to world height |
| `gravity` | `9.81` | Gravity for the pipe model (m/s²) |
| `damping` | `0.985` | Velocity damping per step (0..1) |
| `seepage` | `0.015` | Fraction of water lost per second to infiltration |
| `dt` | `0.05` | Simulation timestep per step (seconds) |

**Methods:**

- `step()` — advance the simulation by one tick (call once or multiple times per frame)
- `applyBrush(op, uv, radius, strength)` — apply a brush at a UV coordinate
  - `op`: `'water'` | `'drain'` | `'raise'` | `'lower'` | `'smooth'`
  - `uv`: `THREE.Vector2` in [0, 1]²
  - `radius`: brush radius in UV units
  - `strength`: brush strength (1.0 ≈ 5cm water per stroke at peak)
- `generateTerrain(seed?)` — regenerate the procedural terrain
- `clearWater()` — drain all water
- `fillWater(depth)` — fill the entire terrain with a uniform water depth
- `dispose()` — free GPU resources

**Properties:**

- `waterTexture` — current water state (R = depth)
- `terrainTexture` — terrain heightmap (R = normalized 0..1)
- `normalTexture` — surface normals (RGB = normal, A = depth)
- `terrainParams` — live uniforms for the terrain generator (tweak then call `generateTerrain()`)

### `class WaterSurfaceRenderer`

```ts
new WaterSurfaceRenderer(addon: LiquidWater, camera: THREE.Camera, options?: WaterSurfaceOptions)
```

**Options:** `shallowColor`, `deepColor`, `skyColor`, `opacity`, `foamStrength`,
`waveStrength`, `specularStrength`

**Methods:**

- `update(elapsedSeconds)` — bind textures and per-frame uniforms; call once per render
- `dispose()` — free GPU resources

**Properties:**

- `group` — `THREE.Group` containing the terrain and water meshes; add it to your scene
- `terrainMesh` / `waterMesh` — direct mesh references
- `uniforms` — live uniforms for the water shader

## Architecture

```
src/
├── addon/                       # the reusable library
│   ├── LiquidWater.ts           # simulation orchestrator
│   ├── WaterSurfaceRenderer.ts  # builds the visible meshes
│   ├── TerrainMesh.ts           # CPU-side helpers (optional)
│   ├── index.ts                 # public exports
│   └── shaders/
│       ├── passthrough.vert     # full-screen quad vertex shader
│       ├── sim.frag             # pipe-model shallow water update
│       ├── brush.frag           # radial brush for water/terrain editing
│       ├── normals.frag         # surface normal from water+terrain
│       ├── terrain.frag         # procedural terrain generator
│       ├── waterSurface.vert    # water mesh displacement
│       ├── waterSurface.frag    # water shading (fresnel, foam, caustics)
│       ├── terrainSurface.vert  # terrain mesh displacement
│       └── terrainSurface.frag  # terrain shading by elevation
└── demo/                        # demo scene wiring
    ├── DemoApp.ts               # main app
    ├── OrbitController.ts       # camera controls
    ├── BrushController.ts       # mouse -> UV picking
    └── ...
```

## Implementation notes

**Pipe model stability.** Each cell's outflow per neighbor is capped at
`depth / 4`, so the four neighbors combined can never drain more than the
cell's current depth in one step. Inflow is capped by the *source* cell's
depth using the same rule. This guarantees positivity and volume conservation.

**Terrain flat-top.** The procedural terrain suppresses high-frequency noise
on the plateau interior (via `plateauMask`). Without this, water placed on the
plateau gets trapped in noise-induced local minima and never cascades.

**Normal reconstruction.** Surface normals are computed in a separate render
pass from the water depth + terrain heightmap (centered differences). This
decouples the simulation step from the renderer — you can run multiple sim
steps per frame and only update normals once for rendering.

**iOS / WebGL2 float targets.** The addon prefers `FloatType` render targets
when `EXT_color_buffer_float` is available, and falls back to `HalfFloatType`
otherwise. The simulation is numerically stable in both modes for the default
parameters.

## Credits

- Original [`jeantimex/threejs-water`](https://github.com/jeantimex/threejs-water)
  by Yong Su, itself a port of [Evan Wallace's WebGL Water](http://madebyevan.com/webgl-water/).
- Pipe-model shallow water based on Mei, Decaudin, Hu, Wang, Chen,
  *"Fast Hydraulic Erosion Simulation"*, 2007.

## License

MIT

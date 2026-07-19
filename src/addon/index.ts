/**
 * threejs-liquid-water
 * Made by Kantasu
 *
 * A terrain-aware shallow water simulation addon for three.js.
 *
 * LiquidWater runs a GPU pipe-model shallow-water simulation on top of a
 * heightmap terrain. Water on elevated plateaus cascades downhill and pools
 * in lower basins. The simulation exposes its water/terrain/normal textures
 * so a custom renderer (such as WaterSurfaceRenderer) can display the surface
 * with refraction, reflection, foam, and depth-based color.
 *
 * Quick start:
 *   import { LiquidWater, WaterSurfaceRenderer } from './addon';
 *   const addon = new LiquidWater(renderer);
 *   const surface = new WaterSurfaceRenderer(addon, camera);
 *   scene.add(surface.group);
 *   // each frame:
 *   addon.step();
 *   surface.update(t);
 *
 * Brush API (for interactivity):
 *   addon.applyBrush('water', uv, 0.04, 0.5);
 *
 * Author: Kantasu
 * License: MIT
 */

export { LiquidWater } from './LiquidWater';
export type { LiquidWaterOptions, BrushOp } from './LiquidWater';
export { WaterSurfaceRenderer } from './WaterSurfaceRenderer';
export type { WaterSurfaceOptions } from './WaterSurfaceRenderer';

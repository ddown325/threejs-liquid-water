import * as THREE from 'three';
import type { LiquidWater, BrushOp } from '../addon/LiquidWater';

/**
 * Maps pointer events on the canvas to UV coordinates on the simulation
 * grid by raycasting against an invisible ground plane (the simulation
 * domain, centered at the origin, lying on the XZ plane).
 *
 * Supports multiple brush modes; the active mode is changed via setMode()
 * or by pressing 1-4.
 */

export type BrushMode = BrushOp;

export class BrushController {
  mode: BrushMode = 'water';
  radius = 0.05; // in UV units
  strength = 0.6;

  private dom: HTMLElement;
  private camera: THREE.PerspectiveCamera;
  private addon: LiquidWater;
  private worldSize: number;
  private raycaster = new THREE.Raycaster();
  private groundPlane: THREE.Plane;
  private isDown = false;
  private ndc = new THREE.Vector2();
  private lastApplyTime = 0;
  private applyInterval = 16; // ms between applies when dragging

  constructor(
    dom: HTMLElement,
    camera: THREE.PerspectiveCamera,
    addon: LiquidWater
  ) {
    this.dom = dom;
    this.camera = camera;
    this.addon = addon;
    this.worldSize = addon.worldSize;
    // Ground plane at y=0 covering the simulation domain.
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    dom.addEventListener('pointerdown', this.onDown);
    dom.addEventListener('pointermove', this.onMove);
    dom.addEventListener('pointerup', this.onUp);
    dom.addEventListener('pointercancel', this.onUp);
    dom.addEventListener('pointerleave', this.onUp);
  }

  setMode(m: BrushMode) {
    this.mode = m;
  }

  private updateNDC(e: PointerEvent) {
    const rect = this.dom.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /** Convert current NDC to a UV on the simulation grid, or null if the
   *  ray misses the ground plane. */
  private pickUV(out: THREE.Vector2): boolean {
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return false;
    // Simulation domain spans [-worldSize/2, worldSize/2] in X and Z.
    // Map to [0, 1] UV. Note: the plane geometry was rotated so its original
    // +Y (top of plane) maps to world -Z, which means v increases toward -Z.
    const u = (hit.x + this.worldSize / 2) / this.worldSize;
    const v = 1.0 - (hit.z + this.worldSize / 2) / this.worldSize;
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    out.set(u, v);
    return true;
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return; // only left button paints
    if (e.shiftKey) return; // shift = orbit
    this.isDown = true;
    this.updateNDC(e);
    this.applyAt();
  };

  private onMove = (e: PointerEvent) => {
    this.updateNDC(e);
    if (!this.isDown) return;
    const now = performance.now();
    if (now - this.lastApplyTime < this.applyInterval) return;
    this.lastApplyTime = now;
    this.applyAt();
  };

  private onUp = () => {
    this.isDown = false;
  };

  private applyAt() {
    const uv = new THREE.Vector2();
    if (!this.pickUV(uv)) return;
    this.addon.applyBrush(this.mode, uv, this.radius, this.strength);
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this.onDown);
    this.dom.removeEventListener('pointermove', this.onMove);
    this.dom.removeEventListener('pointerup', this.onUp);
    this.dom.removeEventListener('pointercancel', this.onUp);
    this.dom.removeEventListener('pointerleave', this.onUp);
  }
}

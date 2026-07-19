import * as THREE from 'three';

/**
 * A minimal orbit-style camera controller for the demo.
 * Left-drag (with shift) or right-drag rotates, wheel zooms.
 * Plain left-drag is reserved for painting water/terrain.
 */
export class OrbitController {
  target = new THREE.Vector3(0, 0, 0);
  spherical = new THREE.Spherical(22, Math.PI * 0.32, Math.PI * 0.25);
  minRadius = 4;
  maxRadius = 60;
  minPolar = 0.05;
  maxPolar = Math.PI * 0.49;

  private camera: THREE.PerspectiveCamera;
  private dom: HTMLElement;
  private rotateButton: number; // right mouse button
  private isRotating = false;
  private lastX = 0;
  private lastY = 0;

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.camera = camera;
    this.dom = dom;
    this.rotateButton = 2; // right button

    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', this.onDown);
    dom.addEventListener('pointermove', this.onMove);
    dom.addEventListener('pointerup', this.onUp);
    dom.addEventListener('pointercancel', this.onUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });

    this.apply();
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== this.rotateButton && !(e.button === 0 && e.shiftKey)) return;
    this.isRotating = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.dom.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.isRotating) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.spherical.theta -= dx * 0.005;
    this.spherical.phi -= dy * 0.005;
    this.spherical.phi = Math.max(this.minPolar, Math.min(this.maxPolar, this.spherical.phi));
    this.apply();
  };

  private onUp = (e: PointerEvent) => {
    this.isRotating = false;
    try {
      this.dom.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const scale = Math.exp(e.deltaY * 0.0015);
    this.spherical.radius = Math.max(
      this.minRadius,
      Math.min(this.maxRadius, this.spherical.radius * scale)
    );
    this.apply();
  };

  private apply() {
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this.onDown);
    this.dom.removeEventListener('pointermove', this.onMove);
    this.dom.removeEventListener('pointerup', this.onUp);
    this.dom.removeEventListener('pointercancel', this.onUp);
    this.dom.removeEventListener('wheel', this.onWheel);
  }
}

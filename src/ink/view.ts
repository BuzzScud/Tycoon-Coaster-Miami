// One ink world: its own renderer and scene, drawn with the flat camera. Static things are baked once;
// the carousel, coaster trains and every guest move each frame from the live game state.
import * as THREE from 'three';
import type { GameState } from '../sim/types';
import { type InkStyle, type InkCamera, setLineResolution } from './kit';
import { InkTerrainView, InkSceneryView, InkPeepsView, InkRidesView } from './views';

export class InkView {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); peeps: InkPeepsView; rides: InkRidesView;
  constructor(public canvas: HTMLCanvasElement, public g: GameState, public s: InkStyle, public cam: InkCamera) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene.background = new THREE.Color(s.bg);
    new InkTerrainView(this.scene, g, s); new InkSceneryView(this.scene, g, s);
    this.rides = new InkRidesView(this.scene, g, s); this.peeps = new InkPeepsView(this.scene, g, s);
  }
  resize(w: number, h: number) { this.renderer.setSize(w, h, false); setLineResolution(w, h); }
  frame(t: number) { this.rides.sync(t); this.peeps.update(t); this.renderer.render(this.scene, this.cam.camera); }
}

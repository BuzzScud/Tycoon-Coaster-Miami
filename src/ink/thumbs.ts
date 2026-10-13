// Drawn previews for the scenery picker: each piece rendered once in ink, from the game's own angle, on a small
// off-screen canvas, and kept as a picture. Made on demand (a tab's pieces the first time it opens).
import * as THREE from 'three';
import { FINE, buildGroup, setLineResolution } from './kit';
import { scenerySketch } from './models';
import { drawPiece, isPieceKind } from './views';

const cache = new Map<string, string>(); let renderer: THREE.WebGLRenderer | null = null; const W = 176, H = 132;
/** The picture for a kind, or '' while it has not been drawn yet. */
export const thumb = (kind: string) => cache.get(kind) ?? '';
/** Draw every missing picture now; returns true when it drew any (the picker then redraws). */
export function makeThumbs(kinds: string[], screen: { w: number; h: number }): boolean {
  const missing = kinds.filter(k => !cache.has(k)); if (!missing.length) return false;
  try {
    renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(2); renderer.setSize(W, H, false); renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
    setLineResolution(W, H);
    for (const kind of missing) {
      const scene = new THREE.Scene(); const obj = isPieceKind(kind) ? drawPiece(kind, FINE, 0.4).group : buildGroup(scenerySketch(kind), FINE); scene.add(obj);
      const box = new THREE.Box3().setFromObject(obj); const c = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3());
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400); const half = Math.max(size.y * 0.62, Math.hypot(size.x, size.z) * 0.42, 0.5) * 1.08;
      cam.left = -half * (W / H); cam.right = half * (W / H); cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
      const e = Math.PI / 6, hd = Math.PI / 4; cam.position.set(c.x + Math.sin(hd) * Math.cos(e) * 100, c.y + Math.sin(e) * 100, c.z + Math.cos(hd) * Math.cos(e) * 100); cam.lookAt(c);
      renderer.render(scene, cam); cache.set(kind, renderer.domElement.toDataURL('image/png'));
      obj.traverse(o => (o as THREE.Mesh).geometry?.dispose());
    }
  } catch { for (const k of missing) cache.set(k, ''); }
  setLineResolution(screen.w, screen.h);   // the game's lines go back to the game's canvas
  return true;
}

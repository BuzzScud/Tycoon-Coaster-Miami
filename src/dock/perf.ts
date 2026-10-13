// Keeping frames quick on any screen: when frames run slow the picture is drawn with fewer pixels (Retina 2× → 1.5× →
// 1.25× → 1×), and when they are quick again it steps back up. After a step down it waits 30 s before trying that
// sharper level again, so it does not flicker between two levels.
export const RES_STEPS = [2, 1.5, 1.25, 1];
export const SLOW_MS = 22;    // a minute of frames averaging slower than this (under ~45 fps) steps the resolution down
export const QUICK_MS = 18;   // averaging quicker than this (a 60 Hz screen keeping up) lets it step back up
const WINDOW = 60, SETTLE_MS = 2000, HOLD_MS = 30000;

export class ResController {
  readonly steps: number[]; level = 0;
  private samples: number[] = []; private lastChange = -Infinity; private holdLevel = -1; private holdUntil = -Infinity;
  constructor(maxRatio: number) { this.steps = RES_STEPS.filter(r => r <= maxRatio + 1e-6); if (!this.steps.length || this.steps[0] < maxRatio - 1e-6) this.steps.unshift(maxRatio); }
  get ratio() { return this.steps[this.level]; }
  get max() { return this.steps[0]; }
  /** One drawn frame's length (ms). Returns the new pixel ratio when it should change, otherwise null. */
  sample(ms: number, now: number): number | null {
    this.samples.push(ms); if (this.samples.length > WINDOW) this.samples.shift();
    if (this.samples.length < WINDOW || now - this.lastChange < SETTLE_MS) return null;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    if (avg > SLOW_MS && this.level < this.steps.length - 1) { this.holdLevel = this.level; this.holdUntil = now + HOLD_MS; return this.go(this.level + 1, now); }
    if (avg < QUICK_MS && this.level > 0 && !(this.level - 1 <= this.holdLevel && now < this.holdUntil)) return this.go(this.level - 1, now);
    return null;
  }
  /** Back to full sharpness (auto switched off, or a fresh start). */
  reset() { this.level = 0; this.samples = []; this.lastChange = -Infinity; this.holdLevel = -1; this.holdUntil = -Infinity; return this.ratio; }
  private go(level: number, now: number) { this.level = level; this.lastChange = now; this.samples = []; return this.ratio; }
}

// Tiny synthesized sound set (no files). Nothing plays until the first click unlocks the context.
class Audio {
  ctx: AudioContext | null = null; on = true; unlocked = false;
  unlock() { if (this.unlocked) return; try { this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); this.unlocked = true; } catch { this.ctx = null; } }
  tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.05, slide = 0) {
    if (!this.on || !this.ctx) return; const c = this.ctx; if (c.state === 'suspended') c.resume().catch(() => {});
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = freq; if (slide) o.frequency.linearRampToValueAtTime(freq + slide, c.currentTime + dur);
    g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  }
  click() { this.tone(900, 0.03, 'square', 0.03); }
  build() { this.tone(300, 0.08, 'square', 0.04); setTimeout(() => this.tone(420, 0.08, 'square', 0.04), 60); }
  error() { this.tone(160, 0.18, 'sawtooth', 0.05); }
  money() { this.tone(1200, 0.05, 'square', 0.03); setTimeout(() => this.tone(1600, 0.07, 'square', 0.03), 50); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'square', 0.04), i * 110)); }
  scream() { this.tone(700, 0.5, 'sawtooth', 0.02, -400); }
  breakdown() { this.tone(220, 0.3, 'square', 0.04); setTimeout(() => this.tone(180, 0.4, 'square', 0.04), 300); }
  crash() { this.tone(90, 0.6, 'sawtooth', 0.08, -60); }
}
export const audio = new Audio();

// Unit tests for the speed pieces that run without a browser: the resolution steps and the compressed save format.
import { describe, it, expect } from 'vitest';
import { ResController, SLOW_MS, QUICK_MS } from '../src/dock/perf';
import { packSave, unpackSave, toB64, fromB64, serialize, deserialize } from '../src/sim/save';
import { newGame, tick } from '../src/sim/game';

const feed = (c: ResController, ms: number, n: number, t0: number) => { let r: number | null = null; for (let i = 0; i < n; i++) { const x = c.sample(ms, t0 + i * ms); if (x !== null) r = x; } return r; };

describe('auto resolution', () => {
  it('a Retina screen steps 2× → 1.5× → 1.25× → 1×; a plain screen has nothing to step', () => {
    expect(new ResController(2).steps).toEqual([2, 1.5, 1.25, 1]); expect(new ResController(1).steps).toEqual([1]); expect(new ResController(1.5).steps).toEqual([1.5, 1.25, 1]);
  });
  it('slow frames step down once per two seconds, never below 1×', () => {
    const c = new ResController(2); expect(feed(c, SLOW_MS + 10, 60, 0)).toBe(1.5);
    expect(feed(c, SLOW_MS + 10, 30, 1000)).toBeNull();   // waits for a full minute of samples after a change
    expect(feed(c, SLOW_MS + 10, 70, 4000)).toBe(1.25); feed(c, SLOW_MS + 10, 70, 8000); expect(c.ratio).toBe(1); feed(c, SLOW_MS + 10, 70, 12000); expect(c.ratio).toBe(1);
  });
  it('quick frames step back up, but not to a level that was just too slow (30 s hold)', () => {
    const c = new ResController(2); feed(c, SLOW_MS + 10, 60, 0); expect(c.ratio).toBe(1.5);
    expect(feed(c, QUICK_MS - 2, 70, 3000)).toBeNull(); expect(c.ratio).toBe(1.5);   // 2× was slow a moment ago
    expect(feed(c, QUICK_MS - 2, 70, 40000)).toBe(2);                              // after the hold it tries again
  });
  it('steady frames in between change nothing; reset returns to full sharpness', () => {
    const c = new ResController(2); expect(feed(c, (SLOW_MS + QUICK_MS) / 2, 200, 0)).toBeNull(); feed(c, SLOW_MS + 10, 60, 10000); expect(c.ratio).toBe(1.5); expect(c.reset()).toBe(2);
  });
});

describe('compressed saves', () => {
  it('a park packs to a fraction of its JSON and unpacks to the same park', async () => {
    const g = newGame({ name: 'Packed', size: 'medium', cash: 1000000, loan: 0, maxLoan: 0, difficulty: 'normal', sandbox: true, seed: 3 }); for (let i = 0; i < 3000; i++) tick(g);
    const text = serialize(g); const p = await packSave(text);
    expect(p.gz).toBe(true); expect(p.data.byteLength).toBeLessThan(text.length / 5);
    const back = deserialize(await unpackSave(p)); expect(back.tick).toBe(g.tick); expect(back.tiles.length).toBe(g.tiles.length);
  });
  it('the localStorage fallback (base64) round-trips bytes exactly', async () => {
    const p = await packSave('{"v":1,"g":"x".repeat}' + 'abc'.repeat(50000)); const again = fromB64(toB64(p.data));
    expect(new Uint8Array(again)).toEqual(new Uint8Array(p.data)); expect(await unpackSave({ gz: true, data: again })).toBe(await unpackSave(p));
  });
});

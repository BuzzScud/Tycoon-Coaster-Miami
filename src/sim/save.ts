// Saving: the whole GameState is JSON. Slots live in localStorage (guarded), files are plain .json downloads.
import type { GameState } from './types';
import { RIDE_TYPES } from './rides';
import { unlockEverything } from './research';

export const SAVE_VERSION = 1;
export interface SaveMeta { name: string; date: string; savedAt: number; guests: number; cash: number; }
export const serialize = (g: GameState) => JSON.stringify({ v: SAVE_VERSION, g });
export function deserialize(s: string): GameState {
  const o = JSON.parse(s); if (!o || !o.g || typeof o.g.w !== 'number' || !Array.isArray(o.g.tiles)) throw new Error('Not a saved park');
  const g = o.g as GameState;
  if (g.tiles.length !== g.w * g.h) throw new Error('Saved park is damaged');
  // parks saved before sloped land and stacked paths: one path a tile at the land's height, water one step above the land
  for (const t of g.tiles as (typeof g.tiles[number] & { path?: any })[]) {
    if (!t.paths) { t.paths = t.path ? [{ ...t.path, z: t.h }] : []; delete t.path; }
    if (t.water && t.wz === undefined) t.wz = t.h + 2;
  }
  // parks saved before RCT's other ride types: research knows of them too (water and transport research their own)
  const pri = g.finance.researchPriorities; if (pri.transport === undefined) pri.transport = true; if (pri.water === undefined) pri.water = true;
  if (g.research) { const known = new Set([...g.research.invented, ...g.research.queue, ...(g.research.current ? [g.research.current] : [])]);
    for (const d of RIDE_TYPES) if (!known.has(d.key)) g.research.queue.push(d.key);
    if (g.research.stage === 'done' && g.research.queue.length) g.research.stage = 'initial'; }
  if (g.research && !g.research.invented.includes('scenery:space')) g.research.invented.push('scenery:space');   /* parks saved before the Space set get it too */
  if (g.research && (!g.goals || g.noMoney)) unlockEverything(g);   /* free play and sandbox: everything available, older saves included */
  return g;
}
const KEY = (slot: string) => `rct.save.${slot}`;
// Where a park lives: its small label (name, date, guests, cash) stays in localStorage so the title screen can list
// slots at once; the park itself is gzip-compressed (about a tenth of the JSON) into IndexedDB, which has no 5 MB wall.
// If IndexedDB is unavailable (some private windows, some file:// pages) the compressed park goes to localStorage as base64.
export const SLOTS = ['autosave', '1', '2', '3'];
export interface Packed { gz: boolean; data: ArrayBuffer }
export async function packSave(text: string): Promise<Packed> {
  if (typeof CompressionStream === 'undefined') return { gz: false, data: new TextEncoder().encode(text).buffer as ArrayBuffer };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip')); return { gz: true, data: await new Response(stream).arrayBuffer() };
}
export async function unpackSave(p: Packed): Promise<string> {
  if (!p.gz) return new TextDecoder().decode(p.data);
  const stream = new Blob([p.data]).stream().pipeThrough(new DecompressionStream('gzip')); return await new Response(stream).text();
}
export function toB64(buf: ArrayBuffer): string { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }
export function fromB64(s: string): ArrayBuffer { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer; }
let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  return dbp ??= new Promise(res => { try { const r = indexedDB.open('rct', 1); r.onupgradeneeded = () => r.result.createObjectStore('saves'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null); } catch { res(null); } });
}
const idb = <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> => db().then(d => d && new Promise<T | undefined>((res, rej) => { try { const rq = f(d.transaction('saves', mode).objectStore('saves')); rq.onsuccess = () => res(rq.result as T); rq.onerror = () => rej(rq.error); } catch (e) { rej(e); } }) || undefined);
const B64 = (slot: string) => KEY(slot) + '.gz';
async function putPacked(slot: string, p: Packed): Promise<void> {
  try { if (await db()) { await idb('readwrite', s => s.put(p, slot)); localStorage.removeItem(B64(slot)); return; } } catch { /* fall through to localStorage */ }
  localStorage.setItem(B64(slot), (p.gz ? 'g' : 'p') + toB64(p.data));
}
async function getPacked(slot: string): Promise<Packed | null> {
  try { const p = await idb<Packed>('readonly', s => s.get(slot)); if (p) return p; } catch { /* try localStorage */ }
  const b = localStorage.getItem(B64(slot)); return b ? { gz: b[0] === 'g', data: fromB64(b.slice(1)) } : null;
}
export async function writeSlot(slot: string, g: GameState, name: string, date: string): Promise<string | null> {
  try {
    await putPacked(slot, await packSave(serialize(g))); localStorage.removeItem(KEY(slot));   // the old plain copy, if any
    const meta: SaveMeta = { name, date, savedAt: Date.now(), guests: g.guestsInPark, cash: g.finance.cash }; localStorage.setItem(KEY(slot) + '.meta', JSON.stringify(meta)); return null;
  } catch { return 'Could not save in this browser (storage full or blocked)'; }
}
export async function readSlot(slot: string): Promise<GameState | null> {
  try { const p = await getPacked(slot); if (p) return deserialize(await unpackSave(p)); const s = localStorage.getItem(KEY(slot)); return s ? deserialize(s) : null; } catch { return null; }
}
export function slotMeta(slot: string): SaveMeta | null { try { const s = localStorage.getItem(KEY(slot) + '.meta'); return s ? JSON.parse(s) : null; } catch { return null; } }
export async function clearSlot(slot: string) { try { await idb('readwrite', s => s.delete(slot)); } catch { /* ignore */ } try { localStorage.removeItem(KEY(slot)); localStorage.removeItem(B64(slot)); localStorage.removeItem(KEY(slot) + '.meta'); } catch { /* ignore */ } }
/** Saves from before compression (plain JSON in localStorage) move into the new store once, freeing the space. */
export async function migrateSaves(): Promise<number> {
  let moved = 0;
  for (const slot of SLOTS) { try { const s = localStorage.getItem(KEY(slot)); if (!s) continue; deserialize(s); await putPacked(slot, await packSave(s)); localStorage.removeItem(KEY(slot)); moved++; } catch { /* leave it where it is */ } }
  return moved;
}
export function downloadFile(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function pickFile(accept: string): Promise<string | null> {
  return new Promise(res => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.onchange = () => { const f = inp.files?.[0]; if (!f) return res(null); f.text().then(res, () => res(null)); }; inp.click(); });
}

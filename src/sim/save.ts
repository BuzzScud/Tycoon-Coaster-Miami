// Saving: the whole GameState is JSON. Slots live in localStorage (guarded), files are plain .json downloads.
import type { GameState } from './types';

export const SAVE_VERSION = 1;
export interface SaveMeta { name: string; date: string; savedAt: number; guests: number; cash: number; }
export const serialize = (g: GameState) => JSON.stringify({ v: SAVE_VERSION, g });
export function deserialize(s: string): GameState {
  const o = JSON.parse(s); if (!o || !o.g || typeof o.g.w !== 'number' || !Array.isArray(o.g.tiles)) throw new Error('Not a saved park');
  const g = o.g as GameState;
  if (g.tiles.length !== g.w * g.h) throw new Error('Saved park is damaged');
  return g;
}
const KEY = (slot: string) => `rct.save.${slot}`;
export function writeSlot(slot: string, g: GameState, name: string, date: string): string | null {
  try { localStorage.setItem(KEY(slot), serialize(g)); const meta: SaveMeta = { name, date, savedAt: Date.now(), guests: g.guestsInPark, cash: g.finance.cash }; localStorage.setItem(KEY(slot) + '.meta', JSON.stringify(meta)); return null; }
  catch (e) { return 'Could not save in this browser (storage full or blocked)'; }
}
export function readSlot(slot: string): GameState | null { try { const s = localStorage.getItem(KEY(slot)); return s ? deserialize(s) : null; } catch { return null; } }
export function slotMeta(slot: string): SaveMeta | null { try { const s = localStorage.getItem(KEY(slot) + '.meta'); return s ? JSON.parse(s) : null; } catch { return null; } }
export function clearSlot(slot: string) { try { localStorage.removeItem(KEY(slot)); localStorage.removeItem(KEY(slot) + '.meta'); } catch { /* ignore */ } }
export function downloadFile(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function pickFile(accept: string): Promise<string | null> {
  return new Promise(res => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.onchange = () => { const f = inp.files?.[0]; if (!f) return res(null); f.text().then(res, () => res(null)); }; inp.click(); });
}

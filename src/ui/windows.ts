// Classic-style floating windows: title bar with the close box on the left, icon tabs, draggable, z-ordered.
import { svg, hydrateIcons } from './icons';

export interface WinOpts { id: string; title: string; cls?: string; x?: number; y?: number; w?: number; h?: number; tabs?: { icon: string; tip: string }[]; tab?: number; }
export class Win {
  el: HTMLElement; body: HTMLElement; titleEl: HTMLElement; tabsEl: HTMLElement | null = null;
  tab = 0; update: (() => void) | null = null; onClose: (() => void) | null = null; onTab: ((i: number) => void) | null = null; lastHtml = '';
  constructor(public wm: WindowManager, public opts: WinOpts) {
    this.el = document.createElement('div'); this.el.className = 'win rct ' + (opts.cls ?? ''); this.el.dataset.id = opts.id;
    this.el.style.left = (opts.x ?? 60) + 'px'; this.el.style.top = (opts.y ?? 60) + 'px'; if (opts.w) this.el.style.width = opts.w + 'px'; if (opts.h) this.el.style.height = opts.h + 'px';
    this.titleEl = document.createElement('div'); this.titleEl.className = 'title';
    this.titleEl.innerHTML = `<span class="x" title="Close">×</span><span class="tt">${opts.title}</span>`;
    this.el.appendChild(this.titleEl);
    if (opts.tabs) { this.tabsEl = document.createElement('div'); this.tabsEl.className = 'tabsrow'; this.el.appendChild(this.tabsEl); this.tab = opts.tab ?? 0; this.renderTabs(); }
    this.body = document.createElement('div'); this.body.className = 'body'; this.el.appendChild(this.body);
    this.titleEl.querySelector('.x')!.addEventListener('mousedown', e => e.stopPropagation());
    this.titleEl.querySelector('.x')!.addEventListener('click', () => this.close());
    this.titleEl.addEventListener('mousedown', e => this.drag(e));
    this.el.addEventListener('mousedown', () => this.focus());
  }
  renderTabs() {
    if (!this.tabsEl || !this.opts.tabs) return;
    this.tabsEl.innerHTML = this.opts.tabs.map((t, i) => `<i class="${i === this.tab ? 'on' : ''}" title="${t.tip}" data-tab="${i}">${svg(t.icon)}</i>`).join('');
    this.tabsEl.querySelectorAll('i').forEach(el => el.addEventListener('click', () => { this.tab = +el.dataset.tab!; this.renderTabs(); this.lastHtml = ''; this.onTab?.(this.tab); this.update?.(); }));
  }
  setTitle(t: string) { const tt = this.titleEl.querySelector('.tt')!; if (tt.textContent !== t) tt.textContent = t; }
  /** Replace the body only when the markup changed (keeps clicks cheap and avoids flicker). */
  html(h: string) { if (h === this.lastHtml) return false; if (this.el.contains(document.activeElement) && (document.activeElement as HTMLElement).tagName === 'INPUT') return false; this.lastHtml = h; this.body.innerHTML = h; hydrateIcons(this.body); return true; }
  drag(e: MouseEvent) {
    const r = this.el.getBoundingClientRect(), pr = this.el.parentElement!.getBoundingClientRect(); const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const mv = (ev: MouseEvent) => { this.el.style.left = Math.max(-r.width + 40, Math.min(pr.width - 40, ev.clientX - pr.left - dx)) + 'px'; this.el.style.top = Math.max(0, Math.min(pr.height - 20, ev.clientY - pr.top - dy)) + 'px'; };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); e.preventDefault();
  }
  focus() { this.wm.bringToFront(this); }
  close() { this.el.remove(); this.wm.wins.delete(this.opts.id); this.onClose?.(); }
}
export class WindowManager {
  wins = new Map<string, Win>(); z = 10;
  constructor(public root: HTMLElement) {}
  open(opts: WinOpts): Win {
    const ex = this.wins.get(opts.id); if (ex) { ex.focus(); return ex; }
    const w = new Win(this, opts); this.wins.set(opts.id, w); this.root.appendChild(w.el); this.bringToFront(w);
    // keep inside the viewport
    requestAnimationFrame(() => { const r = w.el.getBoundingClientRect(), pr = this.root.getBoundingClientRect(); if (r.right > pr.right - 8) w.el.style.left = Math.max(0, pr.width - r.width - 8) + 'px'; if (r.bottom > pr.bottom - 8) w.el.style.top = Math.max(0, pr.height - r.height - 8) + 'px'; });
    return w;
  }
  bringToFront(w: Win) { w.el.style.zIndex = String(++this.z); }
  close(id: string) { this.wins.get(id)?.close(); }
  get(id: string) { return this.wins.get(id) ?? null; }
  closeAll() { for (const w of [...this.wins.values()]) w.close(); }
  updateAll() { for (const w of this.wins.values()) w.update?.(); }
}

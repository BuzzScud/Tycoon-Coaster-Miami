// After `vite build`, copy the single-file build to the Desktop top level so it opens with a double-click.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const src = path.resolve('dist/index.html');
if (!fs.existsSync(src)) { console.error('dist/index.html missing: run vite build first'); process.exit(1); }
let html = fs.readFileSync(src, 'utf8');
if (!/<meta charset="utf-8">/i.test(html)) html = html.replace('<head>', '<head><meta charset="utf-8">');
const out = path.join(os.homedir(), 'Desktop', 'rollercoaster-tycoon.html');
fs.writeFileSync(out, html);
console.log(`delivered ${out} (${(html.length / 1024).toFixed(0)} KB)`);

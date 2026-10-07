import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: 'es2022', cssCodeSplit: false, assetsInlineLimit: 100000000, reportCompressedSize: false, chunkSizeWarningLimit: 3000, rollupOptions: { output: { inlineDynamicImports: true } } },
  server: { port: 8841, strictPort: false },
});

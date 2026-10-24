import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, type Plugin} from 'vite';

// pdf.js'in yazı tipi eşlemeleri (cMap) ve standart yazı tipleri: bunlar olmadan bazı
// fiyat listesi PDF'lerinin yazısı boş okunur. Derlemede /pdfjs/ altına kopyalanır.
function pdfjsAssets(): Plugin {
  const src = path.resolve(__dirname, 'node_modules/pdfjs-dist');
  const dirs = ['cmaps', 'standard_fonts', 'wasm'];
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const file = path.join(src, decodeURIComponent((req.url || '').split('?')[0]));
        if (!file.startsWith(src) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return next();
        fs.createReadStream(file).pipe(res);
      });
    },
    writeBundle(opts) {
      const out = opts.dir || path.resolve(__dirname, 'dist');
      for (const d of dirs) fs.cpSync(path.join(src, d), path.join(out, 'pdfjs', d), {recursive: true});
    },
  };
}

export default defineConfig(() => {
  // Sürüm etiketi: hangi commit'in yayında olduğu uygulamada (Kullanım kılavuzu altında) görünür
  const sha = (process.env.WORKERS_CI_COMMIT_SHA || '').slice(0, 7);
  const built = new Date().toLocaleString('tr-TR', {timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
  return {
    define: {__APP_BUILD__: JSON.stringify([sha, built].filter(Boolean).join(' · '))},
    plugins: [react(), tailwindcss(), pdfjsAssets()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

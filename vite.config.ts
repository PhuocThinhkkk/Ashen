import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

function audioScannerPlugin(): Plugin {
  function scanAudioFiles(): string[] {
    const audioDir = path.resolve(process.cwd(), 'public/audio');
    if (!fs.existsSync(audioDir)) return [];
    return fs
      .readdirSync(audioDir)
      .filter((file) => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file))
      .map((file) => `/audio/${file}`);
  }

  function writeManifest() {
    const files = scanAudioFiles();
    const manifestPath = path.resolve(process.cwd(), 'public/audio/manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(files, null, 2), 'utf-8');
  }

  return {
    name: 'audio-scanner',
    buildStart() {
      writeManifest();
    },
    configureServer(server) {
      writeManifest();
      server.middlewares.use('/api/audio-files', (_req, res) => {
        writeManifest();
        const files = scanAudioFiles();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(JSON.stringify(files));
      });
    },
  };
}

export default defineConfig({
  plugins: [audioScannerPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
    watch: {
      ignored: ['**/dist/**', '**/artifacts/**', '**/test-results/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: 'index.html',
        assetTest: 'asset-test.html',
      },
    },
  },
});

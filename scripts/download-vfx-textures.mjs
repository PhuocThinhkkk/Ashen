import fs from 'fs';
import path from 'path';
import https from 'https';
import { PNG } from 'pngjs';

const outDir = path.resolve('public/textures/vfx');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const textures = [
  {
    name: 'smoke_soft.png',
    url: 'https://raw.githubusercontent.com/Calinou/kenney-particle-pack/master/addons/kenney_particle_pack/smoke_04.png',
    fallback: generateSmokeTexture,
  },
  {
    name: 'droplet_streak.png',
    url: 'https://raw.githubusercontent.com/Calinou/kenney-particle-pack/master/addons/kenney_particle_pack/trace_01.png',
    fallback: generateDropletStreakTexture,
  },
  {
    name: 'blood_splat.png',
    url: 'https://raw.githubusercontent.com/Calinou/kenney-particle-pack/master/addons/kenney_particle_pack/dirt_02.png',
    fallback: generateBloodSplatTexture,
  },
  {
    name: 'spark_streak.png',
    url: 'https://raw.githubusercontent.com/Calinou/kenney-particle-pack/master/addons/kenney_particle_pack/trace_01.png',
    fallback: generateSparkStreakTexture,
  },
  {
    name: 'shockwave_ring.png',
    url: 'https://raw.githubusercontent.com/Calinou/kenney-particle-pack/master/addons/kenney_particle_pack/circle_05.png',
    fallback: generateShockwaveRingTexture,
  },
];

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => resolve(true));
        });
      } else {
        reject(new Error(`Status ${res.statusCode}`));
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function generateSmokeTexture(destPath) {
  const size = 256;
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / (size * 0.48);
      let alpha = 0;
      if (dist < 1.0) {
        alpha = Math.pow(Math.cos(dist * Math.PI * 0.5), 1.8);
      }
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
      png.data[idx + 3] = Math.round(alpha * 255);
    }
  }
  fs.writeFileSync(destPath, PNG.sync.write(png));
}

function generateDropletStreakTexture(destPath) {
  const size = 256;
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dx = Math.abs(x - cx) / (size * 0.16);
      const dy = (y / size);
      let alpha = 0;
      if (dx < 1.0) {
        const widthFalloff = Math.cos(dx * Math.PI * 0.5);
        const lengthFalloff = Math.sin(dy * Math.PI);
        alpha = widthFalloff * lengthFalloff;
      }
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
      png.data[idx + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  fs.writeFileSync(destPath, PNG.sync.write(png));
}

function generateBloodSplatTexture(destPath) {
  const size = 256;
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / (size * 0.45);
      let alpha = 0;
      if (dist < 1.0) {
        alpha = Math.max(0, 1.0 - Math.pow(dist, 1.2));
      }
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
      png.data[idx + 3] = Math.round(alpha * 255);
    }
  }
  fs.writeFileSync(destPath, PNG.sync.write(png));
}

function generateSparkStreakTexture(destPath) {
  const size = 256;
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dx = Math.abs(x - cx) / (size * 0.08);
      const dy = y / size;
      let alpha = 0;
      if (dx < 1.0) {
        const wf = Math.pow(Math.cos(dx * Math.PI * 0.5), 3.0);
        const lf = Math.sin(dy * Math.PI);
        alpha = wf * lf;
      }
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
      png.data[idx + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  fs.writeFileSync(destPath, PNG.sync.write(png));
}

function generateShockwaveRingTexture(destPath) {
  const size = 256;
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / (size * 0.48);
      let alpha = 0;
      // Ring peak at dist = 0.75
      if (dist > 0.35 && dist < 1.0) {
        const ringDist = Math.abs(dist - 0.72) / 0.28;
        alpha = Math.max(0, Math.cos(ringDist * Math.PI * 0.5));
      }
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
      png.data[idx + 3] = Math.round(alpha * 255);
    }
  }
  fs.writeFileSync(destPath, PNG.sync.write(png));
}

async function main() {
  console.log('Downloading/generating VFX textures in public/textures/vfx...');
  for (const tex of textures) {
    const dest = path.join(outDir, tex.name);
    try {
      console.log(`Downloading ${tex.name} from ${tex.url}...`);
      await downloadFile(tex.url, dest);
      console.log(`✓ Saved ${tex.name}`);
    } catch (err) {
      console.warn(`! Download failed for ${tex.name} (${err.message}). Generating fallback...`);
      tex.fallback(dest);
      console.log(`✓ Generated procedural fallback for ${tex.name}`);
    }
  }
  console.log('All VFX textures are ready in public/textures/vfx');
}

main();

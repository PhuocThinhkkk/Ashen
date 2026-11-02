import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('public/assets/sfx');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Processing SFX into:', outDir);

const tasks = [
  {
    name: 'sword_swing_light.mp3',
    input: 'assets/raw/sfx/swing.mp3',
    // Trim 0.138s leading silence, fade out tail
    filter: 'atrim=start=0.135:end=0.55,asetpts=PTS-STARTPTS,afade=t=out:st=0.32:d=0.09,volume=1.8',
  },
  {
    name: 'sword_swing_heavy.mp3',
    input: 'assets/raw/sfx/737748__squirrel_404__large-sword-swing.wav',
    // Trim 0.055s leading silence, fade tail
    filter: 'atrim=start=0.055:end=0.50,asetpts=PTS-STARTPTS,afade=t=out:st=0.34:d=0.10,volume=1.6',
  },
  {
    name: 'sword_clash_heavy.mp3',
    input: 'assets/raw/sfx/sword-clash-heavy-gfx-sounds-1-1-00-00.mp3',
    filter: 'atrim=start=0:end=0.45,asetpts=PTS-STARTPTS,afade=t=out:st=0.35:d=0.10,volume=1.4',
  },
  {
    name: 'ground_slam.mp3',
    input: 'assets/raw/sfx/Ground Crash Sound Effects.mp3',
    // Cut the colossal crash spike at 3.0s - 4.45s, boost low-end bass and volume
    filter: 'atrim=start=3.00:end=4.45,asetpts=PTS-STARTPTS,bass=g=4:f=110,afade=t=out:st=1.15:d=0.30,volume=1.8',
  },
  {
    name: 'damage_grunt.mp3',
    input: 'assets/raw/sfx/437651__dersuperanton__damage-hit-voice-vocal.wav',
    filter: 'atrim=start=0.06:end=0.52,asetpts=PTS-STARTPTS,afade=t=out:st=0.36:d=0.10,volume=1.5',
  },
  {
    name: 'footstep_heavy.mp3',
    input: 'assets/raw/sfx/110099__ronaldvanwonderen__heavy_footstep.wav',
    filter: 'atrim=start=0.015:end=0.135,asetpts=PTS-STARTPTS,afade=t=out:st=0.09:d=0.03,volume=1.6',
  },
];

for (const t of tasks) {
  const inPath = path.resolve(t.input);
  const outPath = path.join(outDir, t.name);
  console.log(`Exporting ${t.name}...`);
  const cmd = `ffmpeg -y -i "${inPath}" -vn -af "${t.filter}" -b:a 192k "${outPath}"`;
  execSync(cmd, { stdio: 'inherit' });
}

console.log('All SFX processed successfully!');

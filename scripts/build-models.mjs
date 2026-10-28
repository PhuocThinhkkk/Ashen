#!/usr/bin/env node
/**
 * scripts/build-models.mjs
 * Automated Zero-Config 3D Asset Pipeline Orchestrator for souls-browser.
 *
 * Reads:
 *   - assets/raw/players/<player_id>/ (base mesh FBX) + assets/raw/anims/player_shared/
 *   - assets/raw/bosses/<boss_id>/ (base mesh FBX) + assets/raw/anims/boss_shared/
 *
 * Outputs:
 *   - public/assets/models/players/<player_id>.glb
 *   - public/assets/models/bosses/<boss_id>.glb
 *
 * Features:
 *   - Incremental build: compares timestamps (mtime) and skips up-to-date models.
 *   - Fresh recompile: --clean / --fresh wipes outputs and re-exports everything.
 *   - Live watcher: --watch monitors raw directories and triggers rebuilds.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const PATHS = {
  root: ROOT_DIR,
  raw: path.join(ROOT_DIR, 'assets', 'raw'),
  playersRaw: path.join(ROOT_DIR, 'assets', 'raw', 'players'),
  bossesRaw: path.join(ROOT_DIR, 'assets', 'raw', 'bosses'),
  playerSharedAnims: path.join(ROOT_DIR, 'assets', 'raw', 'anims', 'player_shared'),
  bossSharedAnims: path.join(ROOT_DIR, 'assets', 'raw', 'anims', 'boss_shared'),
  modelsOut: path.join(ROOT_DIR, 'public', 'assets', 'models'),
  playersOut: path.join(ROOT_DIR, 'public', 'assets', 'models', 'players'),
  bossesOut: path.join(ROOT_DIR, 'public', 'assets', 'models', 'bosses'),
  compilerScript: path.join(ROOT_DIR, 'scripts', 'process_mixamo.py'),
};

/**
 * Resolves the Blender executable across platforms and standard install locations.
 */
export function resolveBlenderPath() {
  if (process.env.BLENDER_PATH && fs.existsSync(process.env.BLENDER_PATH)) {
    return process.env.BLENDER_PATH;
  }

  // 1. Check if 'blender' in PATH
  try {
    const res = spawnSync('blender', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
    if (res.status === 0) return 'blender';
  } catch {
    // Not in PATH
  }

  // 2. Windows paths
  if (process.platform === 'win32') {
    const bfDir = 'C:\\Program Files\\Blender Foundation';
    if (fs.existsSync(bfDir)) {
      const candidates = fs
        .readdirSync(bfDir)
        .map((sub) => path.join(bfDir, sub, 'blender.exe'))
        .filter((exe) => fs.existsSync(exe));
      if (candidates.length > 0) {
        candidates.sort();
        return candidates[candidates.length - 1];
      }
    }
  }

  // 3. macOS paths
  if (process.platform === 'darwin') {
    const macPath = '/Applications/Blender.app/Contents/MacOS/Blender';
    if (fs.existsSync(macPath)) return macPath;
  }

  // 4. Linux paths
  if (process.platform === 'linux') {
    for (const p of ['/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender']) {
      if (fs.existsSync(p)) return p;
    }
  }

  return 'blender';
}

/**
 * Discovers character entities in a category directory (players or bosses).
 */
export function discoverEntities(categoryDir, sharedAnimsDir, outDir, category) {
  if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true });
    return [];
  }

  const entries = fs.readdirSync(categoryDir, { withFileTypes: true });
  const entities = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entityId = entry.name;
    const entityDir = path.join(categoryDir, entityId);

    // Find base FBX in root of entityDir
    const files = fs.readdirSync(entityDir, { withFileTypes: true });
    const fbxFiles = files
      .filter((f) => f.isFile() && f.name.toLowerCase().endsWith('.fbx'))
      .map((f) => f.name);

    if (fbxFiles.length === 0) {
      console.warn(`[Pipeline] Warning: No base .fbx found in ${entityDir}`);
      continue;
    }

    // Dynamic resolution of primary base model
    // Priority: base.fbx, <entityId>.fbx, or first alphabetical
    let baseFileName = fbxFiles.find((f) => f.toLowerCase() === 'base.fbx');
    if (!baseFileName) {
      baseFileName = fbxFiles.find((f) => f.toLowerCase() === `${entityId.toLowerCase()}.fbx`);
    }
    if (!baseFileName) {
      fbxFiles.sort();
      baseFileName = fbxFiles[0];
    }

    const baseFbx = path.join(entityDir, baseFileName);
    const targetGlb = path.join(outDir, `${entityId}.glb`);

    // Collect source files for timestamp check
    const sourceFiles = [baseFbx];

    if (fs.existsSync(sharedAnimsDir)) {
      const animFiles = fs.readdirSync(sharedAnimsDir, { withFileTypes: true });
      for (const a of animFiles) {
        if (a.isFile() && (a.name.toLowerCase().endsWith('.fbx') || a.name.toLowerCase().endsWith('.glb'))) {
          sourceFiles.push(path.join(sharedAnimsDir, a.name));
        }
      }
    }

    entities.push({
      category,
      id: entityId,
      dir: entityDir,
      baseFbx,
      baseFileName,
      animsDir: sharedAnimsDir,
      targetGlb,
      sourceFiles,
    });
  }

  return entities;
}

/**
 * Checks if target GLB needs recompilation against source files.
 */
export function needsRebuild(entity, forceClean = false) {
  if (forceClean) {
    return { rebuild: true, reason: 'forced clean/fresh build' };
  }
  if (!fs.existsSync(entity.targetGlb)) {
    return { rebuild: true, reason: 'target output does not exist' };
  }

  const targetMtime = fs.statSync(entity.targetGlb).mtimeMs;

  for (const src of entity.sourceFiles) {
    if (!fs.existsSync(src)) continue;
    const srcMtime = fs.statSync(src).mtimeMs;
    if (srcMtime > targetMtime) {
      return {
        rebuild: true,
        reason: `source updated: ${path.basename(src)} (${new Date(srcMtime).toLocaleTimeString()} > ${new Date(targetMtime).toLocaleTimeString()})`,
      };
    }
  }

  if (fs.existsSync(PATHS.compilerScript)) {
    const scriptMtime = fs.statSync(PATHS.compilerScript).mtimeMs;
    if (scriptMtime > targetMtime) {
      return { rebuild: true, reason: 'process_mixamo.py updated' };
    }
  }

  return { rebuild: false, reason: 'up to date' };
}

/**
 * Compiles a single character entity using Blender.
 */
export function compileEntity(blenderPath, entity) {
  console.log(`\n------------------------------------------------------------`);
  console.log(`[Pipeline] Compiling [${entity.category}] "${entity.id}"`);
  console.log(`  Base FBX: ${entity.baseFileName}`);
  console.log(`  Shared Anims: ${path.relative(ROOT_DIR, entity.animsDir)}`);
  console.log(`  Target GLB:   ${path.relative(ROOT_DIR, entity.targetGlb)}`);

  fs.mkdirSync(path.dirname(entity.targetGlb), { recursive: true });

  const args = [
    '--background',
    '--python',
    PATHS.compilerScript,
    '--',
    '--base',
    entity.baseFbx,
    '--anims',
    entity.animsDir,
    '--output',
    entity.targetGlb,
    '--category',
    entity.category,
  ];

  const startTime = Date.now();
  const res = spawnSync(blenderPath, args, {
    stdio: 'inherit',
    encoding: 'utf8',
  });

  if (res.status !== 0) {
    throw new Error(
      `Failed to compile ${entity.category} "${entity.id}" (Blender exit code ${res.status})`,
    );
  }

  const sec = ((Date.now() - startTime) / 1000).toFixed(2);
  const sizeMb = fs.existsSync(entity.targetGlb)
    ? (fs.statSync(entity.targetGlb).size / (1024 * 1024)).toFixed(2)
    : '0';

  console.log(`[Pipeline] Compiled [${entity.category}] "${entity.id}" in ${sec}s (${sizeMb} MB)`);
}

/**
 * Wipes the categorized models directory.
 */
export function cleanOutputDir(outDir = PATHS.modelsOut) {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
    return 0;
  }
  let count = 0;
  for (const sub of ['players', 'bosses']) {
    const dir = path.join(outDir, sub);
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.glb')) {
          fs.unlinkSync(path.join(dir, f));
          count++;
        }
      }
    }
  }
  return count;
}

/**
 * Builds all players and bosses.
 */
export function buildAll(options = {}) {
  const { forceClean = false, entityId = null } = options;
  const blenderPath = resolveBlenderPath();

  console.log(`=== Souls Browser Zero-Config 3D Asset Pipeline ===`);
  console.log(`Blender: ${blenderPath}`);
  console.log(`Players: ${path.relative(ROOT_DIR, PATHS.playersRaw)}`);
  console.log(`Bosses:  ${path.relative(ROOT_DIR, PATHS.bossesRaw)}`);
  console.log(`Output:  ${path.relative(ROOT_DIR, PATHS.modelsOut)}`);

  if (forceClean) {
    const cleaned = cleanOutputDir(PATHS.modelsOut);
    console.log(`[Pipeline] Fresh build requested: removed ${cleaned} existing GLB(s).`);
  }

  // Ensure directories exist
  fs.mkdirSync(PATHS.playersOut, { recursive: true });
  fs.mkdirSync(PATHS.bossesOut, { recursive: true });
  fs.mkdirSync(PATHS.playerSharedAnims, { recursive: true });
  fs.mkdirSync(PATHS.bossSharedAnims, { recursive: true });

  const players = discoverEntities(PATHS.playersRaw, PATHS.playerSharedAnims, PATHS.playersOut, 'player');
  const bosses = discoverEntities(PATHS.bossesRaw, PATHS.bossSharedAnims, PATHS.bossesOut, 'boss');
  const all = [...players, ...bosses];

  if (all.length === 0) {
    console.log(`\n[Pipeline] No character models found.`);
    console.log(`[Pipeline] Place raw models in:`);
    console.log(`  assets/raw/players/<player_id>/base.fbx`);
    console.log(`  assets/raw/bosses/<boss_id>/base.fbx`);
    return { built: 0, skipped: 0, total: 0 };
  }

  let builtCount = 0;
  let skippedCount = 0;

  for (const entity of all) {
    if (entityId && entity.id !== entityId) continue;

    const status = needsRebuild(entity, forceClean);
    if (status.rebuild) {
      console.log(`[REBUILD] [${entity.category}] "${entity.id}" (${status.reason})`);
      compileEntity(blenderPath, entity);
      builtCount++;
    } else {
      console.log(`[SKIP]    [${entity.category}] "${entity.id}" (${status.reason})`);
      skippedCount++;
    }
  }

  console.log(`\n[Pipeline] Complete. Built: ${builtCount}, Skipped: ${skippedCount}, Total: ${all.length}\n`);
  return { built: builtCount, skipped: skippedCount, total: all.length };
}

/**
 * Starts the live watcher.
 */
export function startWatcher() {
  const blenderPath = resolveBlenderPath();

  console.log(`=== Souls Browser 3D Asset Pipeline [Watcher] ===`);
  console.log(`Watching: ${path.relative(ROOT_DIR, PATHS.raw)}`);
  console.log(`Blender:  ${blenderPath}`);

  buildAll({ forceClean: false });

  const debounceMap = new Map();
  console.log(`[Watcher] Ready. Monitoring for changes... (Press Ctrl+C to stop)`);

  const watcher = fs.watch(PATHS.raw, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const lower = filename.toLowerCase();
    if (!lower.endsWith('.fbx') && !lower.endsWith('.glb')) return;

    if (debounceMap.has('rebuild')) {
      clearTimeout(debounceMap.get('rebuild'));
    }

    debounceMap.set(
      'rebuild',
      setTimeout(() => {
        debounceMap.delete('rebuild');
        console.log(`\n[Watcher] Detected file event: ${filename} (${eventType})`);
        try {
          buildAll({ forceClean: false });
        } catch (err) {
          console.error(`[Watcher] Build error:`, err.message);
        }
      }, 350),
    );
  });

  return watcher;
}

// CLI Execution
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const isClean = args.includes('--clean') || args.includes('--fresh');
  const isWatch = args.includes('--watch');
  const isHelp = args.includes('--help') || args.includes('-h');

  let entityId = null;
  const idx = args.findIndex((a) => a === '--entity' || a === '-e' || a === '-c');
  if (idx !== -1 && args[idx + 1]) {
    entityId = args[idx + 1];
  }

  if (isHelp) {
    console.log(`
Usage:
  node scripts/build-models.mjs [options]

Options:
  --clean, --fresh         Wipe public/assets/models/ and recompile all models
  --watch                  Live watcher on assets/raw/
  --entity, -e <id>        Compile only the specified character ID
  --help, -h               Show this help message
`);
    process.exit(0);
  }

  try {
    if (isWatch) {
      startWatcher();
    } else {
      buildAll({ forceClean: isClean, entityId });
    }
  } catch (err) {
    console.error(`\n[Pipeline] Fatal Error:`, err.message);
    process.exit(1);
  }
}

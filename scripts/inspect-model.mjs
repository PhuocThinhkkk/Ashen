#!/usr/bin/env node
/**
 * scripts/inspect-model.mjs
 * Model & Animation Inspection Tool for souls-browser.
 *
 * Inspects GLB/GLTF models, printing:
 *  - File size and format info
 *  - Mesh nodes, materials, and triangle counts
 *  - Armature bones, hierarchies, and detected socket candidates (hand/palm)
 *  - Embedded animations, durations, target channels, and standard state verification
 *
 * Usage:
 *   node scripts/inspect-model.mjs                               # Inspects all compiled models
 *   node scripts/inspect-model.mjs public/assets/models/players/knight.glb
 *   node scripts/inspect-model.mjs public/assets/models/bosses/titan.glb
 *   npm run inspect:model -- public/assets/models/players/samurai.glb
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const STANDARD_PLAYER_ANIMATIONS = [
  'idle',
  'attack_light',
  'attack_heavy',
  'dodge',
  'run',
  'walk',
  'death',
  'drinking',
  'jumping',
];

const STANDARD_BOSS_ANIMATIONS = [
  'idle',
  'walking',
  'attack_heavy',
  'special',
  'hit',
  'die',
];

/**
 * Parses binary GLB header and JSON chunk.
 */
function parseGlb(filePath) {
  const buf = fs.readFileSync(filePath);
  const magic = buf.toString('utf8', 0, 4);
  if (magic !== 'glTF') {
    throw new Error(`File is not a valid GLB (magic header: ${magic})`);
  }
  const version = buf.readUInt32LE(4);
  const totalLength = buf.readUInt32LE(8);
  const jsonChunkLength = buf.readUInt32LE(12);
  const jsonChunkType = buf.readUInt32LE(16); // 0x4E4F534A ('JSON')

  const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLength);
  const gltf = JSON.parse(jsonStr);

  return {
    version,
    totalLength,
    gltf,
    fileSizeBytes: buf.byteLength,
  };
}

/**
 * Inspects a single GLB file and prints a formatted report.
 */
export function inspectModel(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`\n[Error] File not found: ${filePath}`);
    return;
  }

  const { gltf, fileSizeBytes } = parseGlb(resolved);
  const relPath = path.relative(ROOT_DIR, resolved);
  const sizeMb = (fileSizeBytes / (1024 * 1024)).toFixed(2);
  const sizeKb = (fileSizeBytes / 1024).toFixed(1);

  const isPlayer = relPath.toLowerCase().includes('player');
  const isBoss = relPath.toLowerCase().includes('boss');
  const expectedAnims = isPlayer
    ? STANDARD_PLAYER_ANIMATIONS
    : isBoss
      ? STANDARD_BOSS_ANIMATIONS
      : null;

  console.log(`\n======================================================================`);
  console.log(`  MODEL INSPECTION REPORT: ${path.basename(resolved)}`);
  console.log(`======================================================================`);
  console.log(`  Path:        ${relPath}`);
  console.log(`  Size:        ${sizeMb} MB (${sizeKb} KB)`);
  console.log(`  Generator:   ${gltf.asset?.generator ?? 'Unknown'}`);
  console.log(`  glTF Ver:    ${gltf.asset?.version ?? '2.0'}`);

  // 1. Meshes & Nodes
  const nodes = gltf.nodes ?? [];
  const meshes = gltf.meshes ?? [];
  const materials = gltf.materials ?? [];
  console.log(`\n----------------------------------------------------------------------`);
  console.log(`  1. SCENE GEOMETRY & MESHES (${meshes.length} mesh definition(s), ${nodes.length} node(s))`);
  console.log(`----------------------------------------------------------------------`);

  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    const nodeOwner = nodes.find((n) => n.mesh === i);
    const prims = mesh.primitives ?? [];
    console.log(`  • Mesh #${i}: "${mesh.name ?? 'Unnamed'}" (Node: "${nodeOwner?.name ?? 'None'}")`);
    prims.forEach((p, pIdx) => {
      const mat = p.material !== undefined ? materials[p.material]?.name ?? `Material #${p.material}` : 'Default';
      console.log(`      Primitive [${pIdx}]: Material = "${mat}", Attributes = [${Object.keys(p.attributes).join(', ')}]`);
    });
  }

  // 2. Skeletons & Bones
  console.log(`\n----------------------------------------------------------------------`);
  console.log(`  2. SKELETON & SOCKET DETECTIONS`);
  console.log(`----------------------------------------------------------------------`);
  const skins = gltf.skins ?? [];
  if (skins.length === 0) {
    console.log(`  (No skinned armatures detected in this model)`);
  } else {
    for (let sIdx = 0; sIdx < skins.length; sIdx++) {
      const skin = skins[sIdx];
      const joints = skin.joints ?? [];
      console.log(`  • Skin #${sIdx}: "${skin.name ?? 'Armature'}" (${joints.length} bones/joints)`);

      const socketCandidates = [];
      joints.forEach((nodeIdx) => {
        const node = nodes[nodeIdx];
        if (!node) return;
        const name = node.name ?? `Node_${nodeIdx}`;
        const lower = name.toLowerCase();
        if (
          lower.includes('hand') ||
          lower.includes('palm') ||
          lower.includes('wrist') ||
          lower.includes('weapon')
        ) {
          socketCandidates.push({ index: nodeIdx, name });
        }
      });

      if (socketCandidates.length > 0) {
        console.log(`    Socket Candidates (Hands/Arms):`);
        socketCandidates.forEach((c) => {
          const isIK = c.name.toLowerCase().includes('ik');
          const tag = isIK ? ' [IK Helper - Avoid for weapon parenting]' : ' [Recommended Socket Target]';
          console.log(`      -> Node #${c.index}: "${c.name}"${tag}`);
        });
      } else {
        console.log(`    (No standard hand/palm bones found automatically)`);
      }
    }
  }

  // 3. Embedded Animations
  const anims = gltf.animations ?? [];
  console.log(`\n----------------------------------------------------------------------`);
  console.log(`  3. EMBEDDED ANIMATIONS (${anims.length} track(s) found)`);
  console.log(`----------------------------------------------------------------------`);

  if (anims.length === 0) {
    console.log(`  (Warning: No animations embedded in this GLB!)`);
  } else {
    const embeddedNames = anims.map((a) => a.name);

    anims.forEach((anim, aIdx) => {
      const channels = anim.channels ?? [];
      const samplers = anim.samplers ?? [];

      // Calculate approximate duration from samplers
      let maxTime = 0;
      samplers.forEach((s) => {
        const accIdx = s.input;
        const acc = gltf.accessors?.[accIdx];
        if (acc && acc.max && acc.max[0] !== undefined) {
          if (acc.max[0] > maxTime) maxTime = acc.max[0];
        }
      });

      const targets = new Set(
        channels.map((ch) => (ch.target.node !== undefined ? nodes[ch.target.node]?.name ?? `Node_${ch.target.node}` : '?')),
      );

      console.log(`  • [${aIdx + 1}/${anims.length}] "${anim.name}":`);
      console.log(`      Duration: ${maxTime.toFixed(2)}s | Channels: ${channels.length} | Target Nodes: ${targets.size}`);
    });

    // Verification against standard pipeline names
    if (expectedAnims) {
      console.log(`\n  Standard Pipeline Compliance Check (${isPlayer ? 'Player' : 'Boss'}):`);
      expectedAnims.forEach((std) => {
        const found = embeddedNames.includes(std);
        const icon = found ? '✓ PASS' : '✗ MISSING';
        console.log(`    [${icon}] "${std}"`);
      });

      const extras = embeddedNames.filter((n) => !expectedAnims.includes(n));
      if (extras.length > 0) {
        console.log(`    (Additional non-standard tracks: ${extras.join(', ')})`);
      }
    }
  }

  console.log(`======================================================================\n`);
}

// CLI Execution
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  node scripts/inspect-model.mjs [path_to_model.glb]

If no path is provided, all models in public/assets/models/ will be inspected.
`);
    process.exit(0);
  }

  if (args.length > 0) {
    args.forEach((p) => inspectModel(p));
  } else {
    // Scan public/assets/models/ by default
    const modelsDir = path.join(ROOT_DIR, 'public', 'assets', 'models');
    if (!fs.existsSync(modelsDir)) {
      console.error(`[Error] Models directory not found: ${modelsDir}`);
      process.exit(1);
    }

    const filesToInspect = [];
    function scan(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (entry.isFile() && entry.name.endsWith('.glb')) filesToInspect.push(full);
      }
    }
    scan(modelsDir);

    if (filesToInspect.length === 0) {
      console.log(`No GLB models found in ${modelsDir}`);
    } else {
      console.log(`Inspecting ${filesToInspect.length} model(s) found in public/assets/models/...`);
      filesToInspect.forEach((f) => inspectModel(f));
    }
  }
}

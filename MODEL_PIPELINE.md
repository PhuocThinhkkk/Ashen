# 3D Model & Animation Pipeline Guide (Blender to Three.js)

This document is the single source of truth for inspecting, debugging, building, and validating 3D models and Mixamo animations in `souls-browser`. Follow this guide to diagnose model bugs or add new character assets in minutes rather than hours.

---

## 1. Fast Command Cheat Sheet

Always run these commands before and after touching 3D files:

```bash
# 1. Inspect ALL compiled GLB models (Fast ~100ms Node script, no Blender needed)
npm run inspect:model

# 2. Inspect a specific GLB file (triangles, materials, bones, detected socket candidates, clip names & durations)
npm run inspect:model -- public/assets/models/bosses/titan.glb
npm run inspect:model -- public/assets/models/players/knight.glb

# 3. Inspect RAW FBX or GLTF files (Headless Blender script: reports skeleton archetype, bone count, socket targets, embedded actions, and debug artifacts)
npm run inspect:fbx -- assets/raw/bosses/titan/base.fbx
npm run inspect:fbx -- assets/raw/anims/shared/Great\ Sword\ Idle.fbx
npm run inspect:fbx -- assets/raw/anims/player/Stand\ To\ Roll.fbx

# 4. Rebuild all models incrementally (skips unchanged files)
npm run build:models

# 5. Clean fresh rebuild (deletes target GLBs and recompiles everything via Blender)
npm run build:models:clean

# 6. Automated Visual Validation (Playwright loops every clip, pauses at mid-frame, saves PNG to artifacts/screenshots/animations/)
npm run capture:anims

# 7. Run validation tests
npx playwright test tests/asset-validation.spec.ts
```

---

## 2. Directory Map (Single Source of Truth: `assets/raw/`)

| Path | Purpose | Format |
|---|---|---|
| `assets/raw/players/<player_id>/base.fbx` | Base character mesh & t-pose armature | FBX (ASCII/Binary) |
| `assets/raw/bosses/<boss_id>/base.fbx` | Base boss mesh & t-pose armature | FBX (ASCII/Binary) |
| `assets/raw/anims/shared/` | Shared animations (`Great Sword Idle.fbx`, `Great Sword Run.fbx`, etc.) | FBX |
| `assets/raw/anims/player/` | Player animations (`Stand To Roll.fbx`, `Great Sword Impact.fbx`) | FBX |
| `assets/raw/anims/boss/` | Boss animations (`Downward.fbx`, `Combo.fbx`, `Jump.fbx`, `360.fbx`, `Kick.fbx`) | FBX |
| `public/assets/models/players/<id>.glb` | Compiled, standardized, game-ready player GLBs | Binary glTF (GLB) |
| `public/assets/models/bosses/<id>.glb` | Compiled, standardized, game-ready boss GLBs | Binary glTF (GLB) |
| `public/assets/weapons/*.glb` | Standalone socketed weapons (`Sword.glb`) | Binary glTF (GLB) |

---

## 3. Standardized Animation Contract

Three.js runtime character controllers (`PlayerCharacter.ts` and `BossCharacter.ts`) expect animation clips to strictly match these exact string identifiers inside the GLB:

### Player Animations (7 required)
- `idle` (~3.38s): Character ready holding weapon in hand.
- `walk` (~1.29s): In-place walk cycle.
- `run` (~0.88s): In-place running sprint.
- `dodge` (~1.29s raw, dynamically scaled to **0.40s**): Dive roll.
- `attack_light` (~0.88s): Light sword slash.
- `attack_heavy` (~1.21s): Jump heavy slash.
- `death` (~1.46s): Defeat/death collapse onto the ground.

### Boss Animations (6 required)
- `idle` (~4.21s): Imposing breathing stance.
- `walking` (~2.08s): Forward stride.
- `attack_heavy` (~2.29s): Massive overhead greatsword slam.
- `special` (~2.21s): Roar / enrage / taunt.
- `hit` (~0.75s): Damage flinch.
- `die` (~2.58s): Boss collapse and demise.

---

## 4. Skeleton Archetypes & Socket Bones

Never assume bone names are identical across 3D models. Run `npm run inspect:fbx` to identify which archetype the model belongs to:

| Archetype | Typical Model | Hand Bone Target (Weapon Socket) | Hips / Root Bone Target | Avoid (IK Helpers) |
|---|---|---|---|---|
| **HumanArmature** | `knight`, `samurai` | `Palm.R` or `PalmR` | `Hips` or `Body` | Thumb / Finger tips |
| **Boss Rig** | `titan` | `hand.R` | `hips` | `hand.R_IK`, `hand.R_IK_end` |
| **Mixamo Standard** | Raw Mixamo FBXs | `mixamorig:RightHand` | `mixamorig:Hips` | - |

> **Socket Rule:** Always socket weapons to actual deform bones (`hand.R` or `Palm.R`). Never socket to IK bones (`hand.R_IK`) because IK bones do not move during FK animations.

---

## 5. Blender 5.2.x Action Slot & NLA Pipeline Architecture

Blender 4.4 and 5.x introduced **Action Slots** (`ActionSlot`). When importing multi-action FBXs and compiling to glTF, the exporter requires each NLA strip to be bound to a valid Action Slot.

`scripts/process_mixamo.py` automates this cleanly:
```python
strip = track.strips.new(std_name, int(best_act.frame_range[0]), best_act)
if hasattr(strip, "action_slot") and strip.action_slot is None:
    if hasattr(strip, "action_suitable_slots") and strip.action_suitable_slots:
        strip.action_slot = strip.action_suitable_slots[0]
    elif hasattr(best_act, "slots") and len(best_act.slots) > 0:
        strip.action_slot = best_act.slots[0]
```

### Automatic Debug Mesh Stripping
When raw models are compiled, `process_mixamo.py` automatically detects and purges helper geometry from the output GLBs:
- `Icosphere` (white hemispherical geometry under characters)
- `Cylinder` (root collision cylinders)
- `hand_shape` (Blender helper polygons)
- `Plane` (ground reference planes)

---

## 6. Common Gotchas & Rapid Troubleshooting

### Gotcha 1: "The animations are completely mixed up (e.g., walk rolls, idle runs)"
- **Why it happens:** Many FBX files (like `Walk.fbx` or `Death.fbx` from Mixamo or asset packs) contain ALL 12 animations in the file! If you simply pick `bpy.data.actions[0]`, Python sets have arbitrary order and pick a random action.
- **The Fix:** `process_mixamo.py` uses `find_best_action()` with prioritized pattern matching (`PLAYER_STANDARD_TARGETS` and `BOSS_STANDARD_TARGETS`), filtering by `frame_length > 2` so it matches the intended animation every time.

### Gotcha 2: "The boss is completely frozen during heavy attack"
- **Why it happens:** Boss animation files contain `rig|rig|base` or `rig|rig|pose`, which are 1-frame static poses (`length: 0.04s`). If an attack is mapped to a 1-frame pose, the boss never moves its arms.
- **The Fix:** Run `npm run inspect:model -- public/assets/models/bosses/titan.glb`. Ensure `attack_heavy` duration is > 2.0s (`2.29s` from `rig|rig|attack`).

### Gotcha 3: "Boss weapon is floating near the ground or not following the hand"
- **Why it happens:** The weapon was parented to `hand.R_IK` instead of `hand.R`, or parented to a deleted helper mesh.
- **The Fix:** In `BossCharacter.ts`, ensure `handBone` resolves to `hand.R`. Verify with:
  ```typescript
  window.__ASSET_TEST__.getWeaponDistanceToHand() // Must be < 0.05m
  ```

### Gotcha 4: "White hemispherical geometry visible under character"
- **Why it happens:** A mesh named `Icosphere` was included in the base model.
- **The Fix:** Both `process_mixamo.py` deletes it at build time, and `PlayerCharacter.ts`/`BossCharacter.ts`/`asset-test.ts` set `obj.visible = false` if any mesh with `icosphere` in its name is found in the scene graph.

### Gotcha 5: "Dodge roll animation lasts too long or desyncs from gameplay i-frames"
- **Why it happens:** The raw roll animation is 1.29s long, but the gameplay roll window is 0.40s.
- **The Fix:** Scale the mixer timescale dynamically:
  ```typescript
  const dodgeTimeScale = clipDuration / 0.40; // 1.29 / 0.40 = 3.225x
  this.playAction('dodge', 0.05, THREE.LoopOnce, true, dodgeTimeScale);
  ```

---

## 7. Interactive Visual Validation Harness

Navigate to:
```
http://127.0.0.1:5188/asset-test.html
```

Features:
1. **Interactive Buttons:** Triggers every single player and boss animation clip with one click.
2. **Model Switching:** Switch between `Knight` and `Samurai` in real time.
3. **Orbit Controls:** Left-drag to orbit around character, right-drag to pan, scroll wheel to zoom.
4. **Camera Presets:** `View Both`, `Focus Player`, `Focus Boss`, `Reset`.
5. **Speed Toggles:** `0.25x`, `0.5x`, `1.0x`, `1.5x` slow-motion inspection.
6. **📸 Capture Mid-Frames:** Pauses every animation clip at its exact midpoint (`duration / 2`) and saves screenshots for visual verification.
7. **Overlay Toggle:** Click `Hide` / `Show` on the header panel to see the unobstructed 3D character.

---

## 8. CLI Quick One-Liners for Instant Debugging

If you need to inspect raw data on the fly without writing a new script:

```bash
# Print all animation actions and durations in any GLB:
node -e "const fs=require('fs');const b=fs.readFileSync('public/assets/models/bosses/titan.glb');const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());console.log(j.animations.map(a=>({name:a.name})));"

# Print all nodes/bones in any GLB:
node -e "const fs=require('fs');const b=fs.readFileSync('public/assets/models/bosses/titan.glb');const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());console.log(j.nodes.map((n,i)=>({i,name:n.name})).filter(n=>/hand|palm|mesh/i.test(n.name)));"

# Inspect any FBX in 2 seconds via Blender:
blender --background --python scripts/inspect-fbx.py -- <path_to_file.fbx>
```

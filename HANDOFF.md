# Project Handoff: Browser-Based 3D Soulslike Boss Fight

**Date:** Milestone 4 Complete (Mixamo Unified Rig, Combat SFX/VFX & 3D Pipeline Automation)  
**Engine & Tech Stack:** Three.js (`^0.184.0`), TypeScript (strict mode), Vite (`^8.0.13`), Playwright (`^1.60.0`), Web Audio API, Three-Nebula  
**Status:** Unified base models, complete Mixamo locomotion/attack suite, combat SFX/VFX, and Sketchfab conversion pipeline fully implemented and verified. All Playwright test suites passing across desktop and mobile.

---

## 1. Project Vision & Architecture Summary

A single-boss combat experience inspired by Elden Ring's combat feel, running locally in modern desktop browsers at 60 FPS on a $0 budget.
- **Fixed Timestep Simulation:** 60Hz update loop with clamped delta (`Math.min(delta, 0.1)`) decoupling physics/combat state from display framerate.
- **Kinematic Locomotion:** Movement and dodge translation are code-controlled using physics curves (preventing animation drift/rubber-banding). Animations play in-place with horizontal root motion stripped.
- **Frame-Data Combat:** Precise `startup`, `active`, and `recovery` durations for all attacks and dodges.
- **Dodge Invulnerability (i-frames):** 300ms window (`0.04s` to `0.34s` of a `0.50s` roll).
- **Procedural Gothic Sanctuary:** 21m radius circular stone arena with 16 gothic pillars, ritual dais, 4 fire braziers with flickering lights, and floating ember particles.
- **Procedural Web Audio:** Zero-latency synthesizer creating blade whooshes, impacts, metallic parry rings, dodge whooshes, boss telegraph drones, and death/victory stingers without external audio files.

---

## 2. Completed Milestones

### Milestone 1: Technical Foundation (Complete & Verified)
- Project scaffolded with Vite, TypeScript, and Three.js.
- Gothic Sanctuary Arena (`src/world/Arena.ts`) rendered with procedural flagstone texturing, stone normal maps, soft moonlight shadows (`PCFShadowMap`), and atmospheric distance fog.
- Clean 60Hz game loop (`src/core/Loop.ts`) with renderer resize management.

### Milestone 2: Playable Combat Prototype (Complete & Verified)
- **Player Controller (`src/entities/PlayerCharacter.ts`):** Camera-relative WASD movement, jogging, sprinting, dodge roll, stamina drain/recovery delay, 3-hit light combo chain, heavy thrust.
- **Third-Person Orbit & Lock-On Camera (`src/systems/SoulslikeCamera.ts`):** Mouse-look orbit, lock-on target tracking (`[Tab]` / `[Q]` / middle-click), arena boundary clamping, and impact screen shake.
- **Boss Entity & AI FSM (`src/entities/BossCharacter.ts`):** Malakhor the Ashen Knight with states (`idle`, `approach`, `windup`, `active`, `recovery`, `stagger`, `phaseTransition`, `dead`), 3 readable telegraphed attacks ("Ashen Cleave", "Sundering Smite", "Ash Rush"), and Phase 2 Enrage at <= 50% HP.
- **Hit Detection & Combat Feedback (`src/combat/HitDetection.ts`, `src/systems/Hud.ts`):** Hurtbox sweep tests, i-frame protection, 50ms hitstop freeze frames, floating damage numbers, player/boss health bars with lagging damage chips, "YOU DIED" and "LEGEND VANQUISHED" banners, instant restart with `[R]`.

### Milestone 3: 3D Character & Animation Integration (Complete & Verified)
- Replaced placeholder primitives with standardized 3D models and verified bone sockets.
- Integrated automated headless Blender compilation pipeline (`scripts/process_mixamo.py` & `scripts/build-models.mjs`).

### Milestone 4: Mixamo Unified Rig, Combat SFX/VFX & Pipeline Automation (Complete & Verified)
1. **Unified Base Model Architecture:**
   - Standardized on `T-Pose-The-forgotten-knight.fbx` (65-bone Mixamo rig) as the shared base mesh for both Player (`knight.glb`, `samurai.glb`) and Boss (`titan.glb`).
   - Completely retired legacy incompatible skeletons (80-bone Titan rig and 42/66-bone HumanArmature).
2. **Standardized Animation Pipeline:**
   - `scripts/process_mixamo.py` compiles 15 source clips from `assets/raw/anims/` (shared, player, boss):
     - Player: `idle`, `walk`, `run`, `walk_backward`, `strafe_left`, `strafe_right`, `dodge`, `attack_light`, `attack_heavy`, `hit`, `death`.
     - Boss: `idle`, `walking`, `walk`, `run`, `attack_heavy` (Downward Cleave), `attack_combo` (Relentless Flurry), `attack_jump` (Leaping Wrath), `attack_360` (Ashen Maelstrom), `kick` (Spartan Kick), `special`, `hit`, `die`.
   - Strips X/Z translation on `mixamorig:Hips` root motion tracks while preserving vertical animation.
3. **Pipeline Bug Fixes (Orientation, Emission, Scale & Weapons):**
   - **Axis Orientation / Flat-on-Back Fix:** Eliminated double -90° X-axis rotation caused by importing legacy 80-bone animations onto the Mixamo rig. All models now stand upright on their feet facing the correct axis.
   - **Blinding White Mesh Fix:** Discovered `top_armor_mat` had `Emission Strength: 10.0` in the FBX material. Automated shader sanitization now clamps all material emissions to `0.0`.
   - **Clean Scene Export:** Purged all 18 Sketchfab empty locator nodes (`Sketchfab_model`, `GLTF_SceneRootNode`, `roses_0`, `sword_82`, etc.) and debug meshes (`Icosphere`) from the glTF export using `use_selection=True`.
   - **Weapon Socket Visibility:** Fixed microscopic weapon bug where `Sword.glb` (4.35m length) was scaled by `0.01` in centimeter bone space (shrinking it to 43mm). Scaled properly to match 1.4m broadsword proportions in hand.
4. **Sketchfab GLB -> Mixamo FBX Automation Tool (`scripts/blender_convert.py`):**
   - Automated CLI utility to convert any downloaded Sketchfab `.glb` into a clean, unparented, transform-applied, Y-up FBX ready for instant auto-rigging on Mixamo.
5. **Combat SFX & VFX:**
   - Added `attackSwing()`, `hitConfirm()`, and `damageTaken()` to `AudioSystem.ts`.
   - Integrated `VFXSystem.ts` with additive high-velocity hit spark particle bursts and responsive character mesh hit flashes.

### Milestone 5: Kinematic Combat Animation Pipeline & Precision Controller (Complete & Verified)
1. **Kinematic Data Contract (`src/combat/KinematicData.ts`):**
   - Implemented kinematic schema for all 14 actions.
   - Defined precise frame boundaries for `Windup`, `Airborne`, `Impact`, and `Recovery` phases.
   - Calibrated Recovery-to-Windup crossfade durations (0.15s to 0.40s).
2. **Kinematic Combat Controller (`src/combat/KinematicCombatController.ts`):**
   - Enforces strict in-place root motion suppression while extracting forward displacement for `Standing Melee Run Jump Attack` (`delta_y = -5.9m`).
   - Bone-socketed hitbox tracking dynamically targeting `mixamorig:RightHand` for sword attacks and `mixamorig:LeftFoot` for Spartan Kick.
   - Toggles `isAttacking` strictly within active Impact frame windows.
3. **Three-Nebula Particle System Integration (`src/systems/VFXSystem.ts`):**
   - Procedural foot dust kick-up particles triggered on landing transitions from Airborne to Ground/Impact.
   - High-energy peak velocity spark bursts and weapon trails emitted on peak velocity frames.
4. **Synthetic Web Audio API Hooks (`src/systems/AudioSystem.ts`):**
   - Dynamic oscillator swooshes and impact thuds synchronized with peak velocity frames.
   - Footstep and landing thump audio synchronized with foot plant frames.

---

## 3. Sketchfab to Mixamo Conversion Tool Guide

When downloading new characters from Sketchfab or other 3D sources:
```bash
# Run the automated converter:
blender --background --python scripts/blender_convert.py -- <path/to/input.glb> <path/to/output.fbx>

# Example:
blender --background --python scripts/blender_convert.py -- raw_model.glb assets/raw/players/new_char/base.fbx
```
**What the script does automatically:**
- Unparents all meshes from Sketchfab empty hierarchies (`Sketchfab_model`, `root_81`, etc.).
- Bakes all transformations directly into mesh vertex positions (`location=True, rotation=True, scale=True`).
- Converts Blender's Z-up coordinates to Mixamo's strict Y-up standard (`axis_forward='-Z', axis_up='Y'`).
- Clamps out-of-bounds material emission strengths and embeds textures with `path_mode='COPY'`.
- Snaps model base to `Z=0` so the character stands on the ground in Mixamo.

---

## 4. How to Run & Verify

```bash
# Start local development server (runs on http://127.0.0.1:5188)
npm run dev

# Run full TypeScript typecheck and production build
npm run build

# Recompile all 3D models with clean Blender pipeline
npm run build:models:clean

# Run all Playwright automated test suites
npx playwright test --project=desktop-chrome
```

For comprehensive details on Blender compilation, Action Slots, skeleton archetypes, and debugging, see **[MODEL_PIPELINE.md](./MODEL_PIPELINE.md)**.

### Fast Inspection & Compilation Commands
```bash
# Inspect all compiled models (fast Node script, reports triangles, bones, socket targets, clip names & durations):
npm run inspect:model

# Inspect raw FBX files (Blender headless script, reports archetype, actions, and debug artifacts):
npm run inspect:fbx -- assets/raw/bosses/titan/base.fbx
npm run inspect:fbx -- assets/raw/anims/boss_shared/Heavy_Smash.fbx

# Rebuild all character models from FBX sources:
npm run build:models:clean

# Visual validation: capture all animations at mid-frame with Playwright:
npm run capture:anims
```

---

## 6. File & Directory Reference

```
souls-browser/
├── artifacts/
│   └── screenshots/           # Browser test evidence PNGs
├── public/
│   └── assets/
│       ├── models/
│       │   ├── players/       # Standardized player GLBs (knight.glb, samurai.glb)
│       │   └── bosses/        # Standardized boss GLBs (titan.glb)
│       └── weapons/
│           └── Sword.glb      # Equipment weapon GLB (41KB)
├── src/
│   ├── combat/
│   │   ├── FrameCombat.ts     # Attack & dodge frame data definitions
│   │   └── HitDetection.ts    # Continuous sweep & capsule collision logic
│   ├── core/
│   │   ├── InputController.ts # Keyboard, mouse look, and pointer lock
│   │   ├── Loop.ts            # Fixed 60Hz delta accumulator loop
│   │   └── Renderer.ts        # Three.js WebGL2 renderer & shadow config
│   ├── entities/
│   │   ├── PlayerCharacter.ts # Player controller, movement & state machine
│   │   └── BossCharacter.ts   # Boss AI FSM, attacks, and enrage
│   ├── systems/
│   │   ├── AudioSystem.ts     # Procedural Web Audio synthesizer
│   │   ├── Hud.ts             # Health, stamina, boss bar, banners
│   │   ├── SoulslikeCamera.ts # 3rd person orbit & target lock-on
│   │   └── DebugTools.ts      # lil-gui live parameter tuner
│   ├── world/
│   │   └── Arena.ts           # Procedural gothic sanctuary geometry & lights
│   ├── asset-test.ts          # Isolated asset validation script
│   ├── game/Game.ts           # Master game coordinator
│   ├── main.ts                # App entrypoint
│   └── styles.css             # Dark fantasy UI styling
├── tests/
│   ├── combat.spec.ts         # Playwright combat E2E tests
│   ├── visual.spec.ts         # Visual canvas smoke test
│   ├── asset-validation.spec.ts # Milestone 3 isolated asset validation test
│   └── animation-capture.spec.ts # Automated mid-frame animation capture test
├── index.html                 # Main game page
├── asset-test.html            # Isolated asset inspection harness
├── playwright.config.ts       # Test configuration (configured for Chrome)
└── tsconfig.json              # Strict TypeScript config
```

---

## 7. How to Run & Verify

```bash
# Start local development server (runs on http://127.0.0.1:5188)
npm run dev

# Run full TypeScript typecheck and production build
npm run build

# Run all automated browser tests (launches Chrome headlessly with real WebGL)
npx playwright test --project=desktop-chrome

# View isolated asset validation harness in browser:
# Navigate to http://127.0.0.1:5188/asset-test.html
```

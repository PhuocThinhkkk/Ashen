# Project Handoff: Browser-Based 3D Soulslike Boss Fight

**Date:** Milestone 7 / Phase 1 Complete (AAA Minimalist UI, Deterministic Respawn & Telemetry Profiler)  
**Engine & Tech Stack:** Three.js (`^0.184.0`), TypeScript (strict mode), Vite (`^8.0.13`), Playwright (`^1.60.0`), Web Audio API, `three.quarks` (`^0.17.1`)  
**Status:** Unified base models, Mixamo combat kinematics, Elden Ring-style blood spray, pooled planar ground decals, AAA typography-driven dark-fantasy UI (0% emojis), deterministic respawn pipeline, and real-time performance profiler fully implemented and verified. All 34 Playwright automated tests passing with 100% success rate across desktop and mobile.

---

## 1. Project Vision & Architecture Summary

A single-boss combat experience inspired by Elden Ring's combat feel, running locally in modern desktop browsers at 60 FPS on a $0 budget.
- **Fixed Timestep Simulation:** 60Hz update loop with clamped delta (`Math.min(delta, 0.05)`) decoupling physics/combat state from display framerate.
- **Kinematic Locomotion:** Movement and dodge translation are code-controlled using physics curves (preventing animation drift/rubber-banding). Animations play in-place with horizontal root motion stripped.
- **Frame-Data Combat:** Precise `startup`, `active`, and `recovery` durations for all attacks and dodges.
- **Dodge Invulnerability (i-frames):** 500ms core window (Frames 33–90 of 120-frame roll).
- **Procedural Gothic Sanctuary:** 21m radius circular stone arena with 16 gothic pillars, ritual dais, 4 fire braziers with flickering lights, and floating ember particles. Static arena geometry shadows pruned to maximize GPU fillrate.
- **Elden Ring Combat VFX:** Directional arterial blood spray at exact collision points (`three.quarks`), custom GLSL Simplex-noise sword slash ribbons, collision contact sparks, and zero-allocation pooled planar ground crack decals.
- **Minimalist AAA Dark-Fantasy Aesthetic:** 100% typography-driven (Cinzel serif, Inter body, JetBrains Mono numbers), sharp 1px hairline borders (`#D4AF37`), obsidian glassmorphism, and uniform thin-stroke custom SVGs with zero native emojis.
- **Deterministic Respawn Pipeline:** Zero-allocation trial reset purging AnimationMixer action weights, kinematic accumulators, decals, ribbons, and camera trauma without page reloads.

---

## 2. Completed Milestones

### Milestone 1: Technical Foundation (Complete & Verified)
- Project scaffolded with Vite, TypeScript, and Three.js.
- Gothic Sanctuary Arena (`src/world/Arena.ts`) rendered with procedural flagstone texturing, stone normal maps, soft moonlight shadows (`PCFShadowMap`), and atmospheric distance fog.
- Clean 60Hz game loop (`src/core/Loop.ts`) with renderer resize management.

### Milestone 2: Playable Combat Prototype (Complete & Verified)
- **Player Controller (`src/entities/PlayerCharacter.ts`):** Camera-relative WASD movement, jogging, sprinting, dodge roll, stamina drain/recovery delay, 3-hit light combo chain, heavy thrust.
- **Third-Person Orbit & Lock-On Camera (`src/systems/SoulslikeCamera.ts`):** Mouse-look orbit, lock-on target tracking (`[Tab]` / `[Q]` / middle-click), arena boundary clamping, and impact screen shake.
- **Boss Entity & AI FSM (`src/entities/BossCharacter.ts`):** Malakhor the Ashen Knight with states (`idle`, `approach`, `windup`, `active`, `recovery`, `stagger`, `phaseTransition`, `dead`), readable telegraphed attacks ("Downward Cleave", "Relentless Flurry", "Leaping Wrath", "Ashen Maelstrom", "Spartan Kick"), and Phase 2 Enrage at <= 50% HP.
- **Hit Detection & Combat Feedback (`src/combat/HitDetection.ts`, `src/systems/Hud.ts`):** Continuous 3D swept segment-to-capsule collision, i-frame protection, 50ms hitstop simulation time dilation (0.15x), floating damage numbers, player/boss health bars with lagging damage chips, "YOU DIED" and "LEGEND VANQUISHED" banners, instant restart with `[R]`.

### Milestone 3: 3D Character & Animation Integration (Complete & Verified)
- Replaced placeholder primitives with standardized 3D models and verified bone sockets.
- Integrated automated headless Blender compilation pipeline (`scripts/process_mixamo.py` & `scripts/build-models.mjs`).

### Milestone 4: Mixamo Unified Rig, Combat SFX/VFX & Pipeline Automation (Complete & Verified)
1. **Unified Base Model Architecture:**
   - Standardized on `T-Pose-The-forgotten-knight.fbx` (65-bone Mixamo rig) as the shared base mesh for both Player (`knight.glb`, `samurai.glb`) and Boss (`titan.glb`).
2. **Standardized Animation Pipeline:**
   - `scripts/process_mixamo.py` compiles 15 source clips from `assets/raw/anims/` (shared, player, boss).
   - Strips X/Z translation on `mixamorig:Hips` root motion tracks while preserving vertical animation.
3. **Pipeline Bug Fixes (Orientation, Emission, Scale & Weapons):**
   - Eliminated double -90° X-axis rotation; upright posture on both combatants.
   - Fixed material emission clamping to `0.0`.
   - Weapon socket properly scaled to 1.4m broadsword hand proportion.
4. **Sketchfab GLB -> Mixamo FBX Automation Tool (`scripts/blender_convert.py`):**
   - Automated CLI utility to convert downloaded Sketchfab `.glb` into a clean, unparented, transform-applied, Y-up FBX.

### Milestone 5: Kinematic Combat Animation Pipeline & Precision Controller (Complete & Verified)
1. **Kinematic Data Contract (`src/combat/KinematicData.ts`):**
   - Implemented kinematic schema for all 14 actions with precise frame boundaries for `Windup`, `Airborne`, `Impact`, and `Recovery` phases.
2. **Kinematic Combat Controller (`src/combat/KinematicCombatController.ts`):**
   - In-place root motion suppression with extracted physical half-sine forward displacement for jump attacks (`delta_y = -5.9m`).
   - Dynamic bone socket hitbox tracking targeting `mixamorig:RightHand` and `mixamorig:LeftFoot`.
3. **GPU Particle Engine (`three.quarks`):**
   - Directional blood bursts with gravity forces (`ApplyForce`) and StretchedBillboards.
   - Pre-allocated planar ground crack decals with zero runtime CPU clipping.

### Milestone 6: Performance Optimization, Shader Pre-Warming & Settings Modal (Complete & Verified)
1. **Centralized Settings State (`src/systems/SettingsManager.ts`):**
   - Manages Graphics, VFX switches, Gameplay kinematics, and General display with `localStorage` persistence and presets (`Full Quality`, `Balanced`, `Performance Mode`).
2. **Real Performance Diagnostics Profiler (`src/systems/PerformanceProfiler.ts`):**
   - Measures live FPS, rolling average frame duration, **1% Low FPS (stutter metric)**, spike counters (>25ms & >33.3ms), CPU logic vs WebGL submission split, draw calls, triangles, and JS heap memory.
   - Includes real-time combat session recording and JSON diagnostic report export.
3. **Pre-Match Preparation Phase (`Game.prepareMatch`):**
   - Pre-ticks animations to bind mixer interpolants upfront.
   - Compiles all WebGL materials and shadow depth passes before combat.
   - Pre-warms `three.quarks` particle shaders with an off-screen dummy emission.

### Milestone 7 / Phase 1: Minimalist AAA UI Overhaul & Deterministic Respawn Pipeline (Complete & Verified)
1. **Zero Emojis & AAA Dark-Fantasy Aesthetic:**
   - 100% of native emojis stripped from all modals, HUD buttons, and telemetry logs.
   - Replaced with serif Roman numerals (`I. VFX CONFIG`, `II. DIAGNOSTICS`, etc.), `Cinzel` headers, `Inter` descriptions, `JetBrains Mono` tabular metrics, 1px hairline gold borders (`#D4AF37`), and uniform thin-stroke SVGs.
2. **Deterministic Entity & Scene Respawn Pipeline:**
   - Hard AnimationMixer action purge (`mixer.stopAllAction()`, weight zeroing, and idle bind with `mixer.update(0)`).
   - Zero-allocation VFX pool recycling (decal opacities, shockwaves, ribbons, and spark clouds).
   - Kinematic controller, input buffer, and camera rig trauma reset. Zero memory leaks across repeated respawns.

---

## 3. Comprehensive Architecture & Multiplayer Roadmap Document

For complete technical specifications, network schemas, client-authoritative state synchronization protocols, and entity decoupling architecture for online multiplayer, consult:
👉 **[`docs/SYSTEM_ARCHITECTURE_AND_MULTIPLAYER_ROADMAP.md`](./docs/SYSTEM_ARCHITECTURE_AND_MULTIPLAYER_ROADMAP.md)**

---

## 4. File & Directory Reference

```
souls-browser/
├── artifacts/
│   ├── canvas-inspection/     # Automated canvas inspection metrics & JSON logs
│   └── screenshots/           # Browser test evidence PNGs
├── assets/
│   ├── raw/                   # Uncompiled source assets (FBX animations, models, audio)
│   └── weapons/               # Equipment models (Sword.glb)
├── docs/
│   ├── DUAL_TRACK_ASSET_TEST_HARNESS.md           # Dual-track inspection suite documentation
│   └── SYSTEM_ARCHITECTURE_AND_MULTIPLAYER_ROADMAP.md # Master architecture & multiplayer roadmap
├── public/
│   └── assets/
│       ├── models/
│       │   ├── players/       # Standardized player GLBs (knight.glb, samurai.glb)
│       │   └── bosses/        # Standardized boss GLBs (titan.glb)
│       ├── sfx/               # Trimmed Web Audio sound files
│       └── weapons/
│           └── Sword.glb      # Equipment weapon GLB (41KB)
├── src/
│   ├── combat/
│   │   ├── FrameCombat.ts               # Attack & dodge frame data definitions
│   │   ├── HitboxVisualDebugger.ts       # Volumetric yellow wireframe hitbox renderer
│   │   ├── HitDetection.ts              # Directional arc & contact point detection
│   │   ├── KinematicCombatController.ts # Frame-accurate action & phase state machine
│   │   ├── KinematicData.ts             # 14-action phase timings, frames & socket bindings
│   │   ├── WeaponCollisionSystem.ts     # Continuous 3D swept segment-to-capsule math
│   │   ├── WeaponHitboxVisualizer.ts    # Debug visualizer for swept blades
│   │   └── WeaponSocketConfig.ts        # Hand socket transformation matrices
│   ├── core/
│   │   ├── InputController.ts # Keyboard, mouse look, and pointer lock with reset()
│   │   ├── Loop.ts            # Fixed 60Hz delta accumulator loop
│   │   └── Renderer.ts        # Three.js WebGL2 renderer & shadow config
│   ├── entities/
│   │   ├── PlayerCharacter.ts # Player controller, movement & state machine with reset()
│   │   └── BossCharacter.ts   # Boss AI FSM, attacks, and enrage with reset()
│   ├── game/
│   │   └── Game.ts            # Master game coordinator & deterministic resetRun()
│   ├── systems/
│   │   ├── AudioSystem.ts          # Procedural Web Audio synthesizer
│   │   ├── Hud.ts                  # Minimalist player/boss vitals & floating damage
│   │   ├── PerformanceProfiler.ts  # 1% low FPS, spikes, CPU/WebGL split, JSON export
│   │   ├── SettingsManager.ts      # Persistent graphics, VFX, and gameplay settings
│   │   ├── SoulslikeCamera.ts      # 3rd person orbit, target lock-on & reset()
│   │   └── VFXSystem.ts            # Master VFX coordinator with reset() & prewarm()
│   ├── ui/
│   │   └── UnifiedSettingsModal.ts # Minimalist AAA tabbed settings & profiler modal
│   ├── utils/
│   │   ├── dispose.ts         # Three.js recursive resource cleanup
│   │   └── ModelLoader.ts     # GLTF loader & bone socket finder
│   ├── vfx/
│   │   ├── BloodBurstVFX.ts   # three.quarks directional arterial blood spray
│   │   ├── GroundSlamVFX.ts   # Pre-allocated planar crack decals & shockwaves
│   │   └── SlashArcRibbon.ts  # GLSL Simplex noise dynamic blade sweep ribbon
│   ├── world/
│   │   └── Arena.ts           # Sanctuary geometry, static shadow optimizations, embers
│   ├── asset-test.ts          # Isolated asset validation script
│   ├── main.ts                # App entrypoint
│   └── styles.css             # AAA Dark-Fantasy design system & typography
├── tests/
│   ├── animation-capture.spec.ts    # Automated mid-frame animation capture test
│   ├── asset-test-dual-track.spec.ts# Dual-track 4-model spatial combat suite
│   ├── asset-validation.spec.ts     # Isolated model & socket validation test
│   ├── combat.spec.ts               # Core combat loop E2E test
│   ├── debug-tools-sandbox.spec.ts  # Hitbox visual debugger & sandbox controls
│   ├── integration-models.spec.ts   # Multi-model integration & runtime switching
│   ├── kinematic-combat.spec.ts     # 14 kinematic actions & frame timings
│   ├── vfx-combat.spec.ts           # Blood spray, slash arcs, decals & sfx verification
│   └── visual.spec.ts               # Visual canvas smoke test
├── index.html                 # Main encounter canvas & HUD
├── asset-test.html            # Isolated asset inspection harness
├── playwright.config.ts       # Test configuration (configured for Chrome)
└── tsconfig.json              # Strict TypeScript config
```

---

## 5. How to Run & Verify

```bash
# Start local development server (runs on http://127.0.0.1:5188)
npm run dev

# Run full TypeScript typecheck and production build
npm run build

# Run all Playwright automated test suites
npx playwright test --project=desktop-chrome

# View isolated asset validation harness in browser:
# Navigate to http://127.0.0.1:5188/asset-test.html
```

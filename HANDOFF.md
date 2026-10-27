# Project Handoff: Browser-Based 3D Soulslike Boss Fight

**Date:** Current Checkpoint (Post-Milestone 1, 2 & Milestone 3 Verification Gate)  
**Engine & Tech Stack:** Three.js (`^0.184.0`), TypeScript (strict mode), Vite (`^8.0.13`), Playwright (`^1.60.0`), Web Audio API  
**Status:** Milestone 1 & 2 fully complete and tested; Milestone 3 asset verification gate passed. Ready for Milestone 3 character & animation integration into the main game.

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
- **Automated Tests:** 3 combat E2E tests (`tests/combat.spec.ts`) + 1 visual smoke test (`tests/visual.spec.ts`) passing in Google Chrome via Playwright.

### Milestone 3 Verification Gate (Complete & Verified in Browser)
Before touching main game code, candidate 3D models were tested in an isolated browser environment (`/asset-test.html` + `tests/asset-validation.spec.ts`):
1. **License Verification:**
   - `HunterG4.glb` / `G4Ax.glb`: MIT License (Cat / `Third-Person-Controller--SoulsLIke-Godot4`).
   - `enemy_2.glb`: MIT License (NovemberDev / `novemberdev_soulslike_darksouls_godot`).
   - `KnightCharacter.glb` / `Sword.glb`: CC0 1.0 Universal Public Domain (Quaternius).
2. **Defect Found in `HunterG4.glb`:** The mesh terminates at the waist belt with zero leg geometry in the GLB (torso mannequin). **Do not use for the player.**
3. **Verified Player Replacement:** **`KnightCharacter.glb` + `Sword.glb`** (Quaternius, CC0):
   - Complete medieval knight model with plate armor, helmet, boots, and gradient palette texture (393 KB).
   - 31-bone humanoid skeleton with 12 baked animations (`Idle`, `Idle_swordRight`, `Walking`, `Run`, `Roll_sword`, `Run_swordAttack`, `swordAttackJump`, `Death`).
   - Scaled to 1.80m height (`scaleFactor = 1.80 / rawHeight`).
   - Weapon (`Sword.glb`) sockets cleanly into `PalmR` bone with zero drift across all animation frames.
4. **Verified Boss Asset:** **`enemy_2.glb`** (NovemberDev, MIT):
   - 59-bone armored knight boss (height 2.46m at 1.15x scale).
   - 10 baked animations (`attack`, `idle`, `walking`, `hit`, `die`, etc.).
   - Filter out two Blender helper objects: `hand_shape` (ground plane) and `Cylinder` (root axe). Socket weapon to `handR`.
5. **Captured Evidence:** Screenshots in `artifacts/screenshots/` (`asset-validation-idle.png`, `asset-validation-player-attack.png`, `asset-validation-boss-attack.png`).

---

## 3. What Has NOT Yet Been Implemented

1. **Main Game Model Integration (Milestone 3):**
   - The main game (`src/game/Game.ts`) still instantiates the geometric placeholder player (`src/entities/PlayerCharacter.ts`) and placeholder boss (`src/entities/BossCharacter.ts`).
   - The verified `KnightCharacter.glb` and `enemy_2.glb` must now be loaded into the player and boss entities.
2. **Milestone 4 (Combat Polish & Refinement):**
   - Fine-tuning turn deceleration and attack commitment.
   - Additional boss combo variations for Phase 2.
3. **Milestone 5 (Visual, VFX & Audio Polish):**
   - Blade swing ribbons / weapon trail geometry.
   - Impact spark particle bursts.
   - Enhanced lighting and fog depth.
4. **Milestone 6 (QA & Static Release):**
   - Production static deployment readiness and final release audit.

---

## 4. Exact Next Task: Milestone 3 Full Integration

In the new session, execute the following steps:

1. **Update `src/entities/PlayerCharacter.ts`:**
   - Load `/assets/test-models/KnightCharacter.glb` via `GLTFLoader`.
   - Scale to 1.80m height.
   - Socket `/assets/test-models/Sword.glb` to `PalmR` (with `scale: 0.01` to counteract armature scale).
   - Initialize `THREE.AnimationMixer` and map combat states to clips:
     - `idle` -> `HumanArmature|Idle_swordRight`
     - `moving` (walk) -> `HumanArmature|Walking`
     - `moving` (sprint) -> `HumanArmature|Run`
     - `attack` (light) -> `HumanArmature|Run_swordAttack` (timeScale 1.15)
     - `attack` (heavy) -> `HumanArmature|swordAttackJump` (timeScale 0.95)
     - `dodge` -> `HumanArmature|Roll_sword`
     - `dead` -> `HumanArmature|Death`
   - Strip horizontal root motion from `Hips` track (`processInPlace`).
2. **Update `src/entities/BossCharacter.ts`:**
   - Load `/assets/test-models/enemy_2.glb` via `GLTFLoader`.
   - Scale to 1.15x (~2.46m height).
   - Set helper meshes (`hand_shape` and `Cylinder`) to `visible = false`.
   - Socket greatsword model to `handR`.
   - Initialize `THREE.AnimationMixer` and map boss states:
     - `idle` -> `idle`
     - `approach` -> `walking`
     - `windup` / `active` -> `attack`
     - `stagger` -> `hit`
     - `dead` -> `die`
3. **Verify:**
   - Run `npm run build` (confirm 0 TypeScript errors).
   - Run `npx playwright test --project=desktop-chrome` (confirm all tests pass).
   - Inspect captured combat screenshots in `artifacts/screenshots/`.

---

## 5. File & Directory Reference

```
souls-browser/
├── artifacts/
│   └── screenshots/           # Browser test evidence PNGs
├── public/
│   └── assets/
│       └── test-models/       # Verified GLB models:
│           ├── KnightCharacter.glb  (Quaternius Knight, CC0, 393KB)
│           ├── Sword.glb            (Quaternius Sword, CC0, 41KB)
│           └── enemy_2.glb          (NovemberDev Armored Knight, MIT, 3.5MB)
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
│   └── asset-validation.spec.ts # Milestone 3 isolated asset validation test
├── index.html                 # Main game page
├── asset-test.html            # Isolated asset inspection harness
├── playwright.config.ts       # Test configuration (configured for Chrome)
└── tsconfig.json              # Strict TypeScript config
```

---

## 6. How to Run & Verify

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

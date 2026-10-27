# Project Handoff: Browser-Based 3D Soulslike Boss Fight

**Date:** Current Checkpoint (Post-Milestone 1, 2 & 3 Complete)  
**Engine & Tech Stack:** Three.js (`^0.184.0`), TypeScript (strict mode), Vite (`^8.0.13`), Playwright (`^1.60.0`), Web Audio API  
**Status:** Milestones 1, 2, and 3 fully complete and tested in browser with Playwright. Ready for Milestone 4 (Combat Polish & Refinement).

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

### Milestone 3: 3D Character & Animation Integration (Complete & Verified in Browser)
1. **Player Character Integration (`src/entities/PlayerCharacter.ts`):**
   - Replaced geometric placeholder with `KnightCharacter.glb` (Quaternius, CC0, 393KB).
   - Scaled to 1.80m height and oriented facing -Z standard forward.
   - Socketed `Sword.glb` (Quaternius, CC0, 41KB) to verified `PalmR` hand bone.
   - Stripped horizontal root motion from `Hips` and `Body` tracks (`processInPlace`).
   - Integrated `THREE.AnimationMixer` mapped to:
     - `idle` -> `HumanArmature|Idle_swordRight`
     - `walking` -> `HumanArmature|Walking`
     - `sprinting` -> `HumanArmature|Run`
     - `attack` (light combo) -> `HumanArmature|Run_swordAttack` (timeScale 1.15)
     - `attack` (heavy) -> `HumanArmature|swordAttackJump` (timeScale 0.95)
     - `dodge` -> `HumanArmature|Roll_sword` (timeScale 2.5)
     - `stagger` -> Rapid blend to idle flinch (fallback for lack of baked hit clip)
     - `dead` -> `HumanArmature|Death`
2. **Boss Character Integration (`src/entities/BossCharacter.ts`):**
   - Replaced geometric placeholder with `enemy_2.glb` (NovemberDev, MIT, 3.5MB).
   - Scaled to 1.15x (~2.46m height).
   - Filtered out Blender helper meshes (`hand_shape` and `Cylinder`).
   - Socketed procedural glowing Greatsword to verified `hand.R` bone with Euler rotation `(-0.4π, 0, 0.4)`. Preserved dynamic telegraph glow pulsing and Phase 2 fiery red visual transformation.
   - Stripped horizontal root motion from `hips` track (`processInPlace`).
   - Integrated `THREE.AnimationMixer` mapped to:
     - `idle` -> `idle`
     - `approach` -> `walking`
     - `windup` / `active` -> `attack`
     - `stagger` -> `hit`
     - `phaseTransition` -> `taunt`
     - `dead` -> `die`
3. **Combat Kinematics & Point-Blank Hit Detection (`src/combat/HitDetection.ts`, `src/game/Game.ts`):**
   - Added point-blank hit tolerance (`distance <= targetRadius`) so forward lunges inside target hurtboxes register reliably.
   - Added character capsule separation in `Game.ts` to prevent player clipping through the boss center.
   - Player attack startup aims towards `lockedTargetPos`.
4. **Captured Evidence:** Screenshots in `artifacts/screenshots/`:
   - `main-game-idle.png`
   - `main-game-combat.png`
   - `main-game-player-attack.png`
   - `main-game-boss-phase2.png`
   - `asset-validation-idle.png`
   - `asset-validation-boss-attack.png`
   - `combat-boss-encounter.png`

---

## 3. What Has NOT Yet Been Implemented

1. **Milestone 4 (Combat Polish & Refinement):**
   - Fine-tuning turn deceleration and attack commitment.
   - Additional boss combo variations for Phase 2.
2. **Milestone 5 (Visual, VFX & Audio Polish):**
   - Blade swing ribbons / weapon trail geometry.
   - Impact spark particle bursts.
   - Enhanced lighting and fog depth.
3. **Milestone 6 (QA & Static Release):**
   - Production static deployment readiness and final release audit.

---

## 4. Exact Next Task: Milestone 4 (Combat Polish & Refinement)

In the new session, start Milestone 4 work:
- Fine-tune combat commitment, turn deceleration, and evasive recovery windows.
- Add Phase 2 boss combo variations and enhanced combat juice.

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

# Project Handoff: Browser-Based 3D Soulslike Boss Fight

**Date:** November 2026  
**Engine & Tech Stack:** Three.js (`^0.184.0`), TypeScript (strict mode), Vite (`^8.3.6`), Playwright (`^1.60.0`), Web Audio API, `three.quarks` (`^0.17.1`), Colyseus (`^0.18.12`), `colyseus.js` (`^0.16.22`)  
**Current Build & Test Status:**  
- `npm run build` (`tsc && vite build`) passes with 0 errors.
- All 34 Playwright tests pass 100% across desktop and mobile Chrome (`tests/boss-ai-strafe.spec.ts`, `tests/debug-tools-sandbox.spec.ts`, `tests/combat.spec.ts`).

---

## 1. Project Overview & Architecture

A single-boss third-person combat experience inspired by FromSoftware's Elden Ring / Dark Souls, running natively in desktop and mobile web browsers at 60 FPS on a $0 budget.

### Core Architectural Pillars
- **Fixed Timestep Simulation:** 60Hz update loop (`src/core/Loop.ts`) with clamped delta (`Math.min(delta, 0.05)`) decoupling game logic from display framerate.
- **Kinematic Locomotion & Root Motion Extraction:** Locomotion and attacks are code-driven with root motion extracted into physical displacements (`src/combat/KinematicCombatController.ts`).
- **LIFO Goal-Stack Boss AI:** Subgoal stack architecture (`BossSubgoal[]`) replacing flat distance checks with intentional circling, frame-1 punish reactions, and mid-combo branching (`src/entities/boss/BossAI.ts`).
- **Locomotion Blend Trees:** Continuous blend layers for player and boss (idle, forward, backward, strafe-left, strafe-right) using normalized animation action weights.
- **Upper-Body Animation Overrides:** Bone-filtered animation blending allowing actions like drinking estus/potions while running or walking (`src/entities/PlayerCharacter.ts`, `src/entities/player/PlayerLocomotion.ts`).
- **Procedural Gothic Arena & VFX:** Directional arterial blood bursts (`three.quarks`), procedural ground crack decals, swept Simplex-noise sword ribbons, and lighting optimized for high GPU fillrate.

---

## 2. Boss AI & Locomotion System (`src/entities/boss/BossAI.ts`, `src/entities/BossCharacter.ts`)

### A. Centralized Configuration (`BOSS_CONFIG`)
All movement, strafe, approach, attack speeds, turn rates, and forward impulses are centralized at the very top of [`src/entities/boss/BossAI.ts`](./src/entities/boss/BossAI.ts) for instant tuning:

```typescript
export const BOSS_CONFIG = {
  // 1. Forward Walk / Approach Speeds (m/s)
  approachSpeedPhase1: 3.2,
  approachSpeedPhase2: 4.2,

  // 2. Lateral Strafe / Circling Speeds (m/s)
  strafeSpeedPhase1: 2.8,
  strafeSpeedPhase2: 3.4,

  // 3. Rotation & Tracking Speed (degrees per second)
  turnRateDegreesPerSec: 140, // 140 deg/sec clamped angular tracking

  // 4. Attack Animation Speed Multipliers
  attackSpeedPhase1: 1.0,
  attackSpeedPhase2: 1.15, // Phase 2 attacks execute 15% faster

  // 5. Preferred Orbit Distance (meters)
  preferredOrbitRadius: 5.5,

  // 6. Heavy Jump Attack Speeds (m/s)
  jumpRunStartSpeed: 2.2, // Run-up acceleration start (m/s)
  jumpRunEndSpeed: 5.0,   // Run-up acceleration peak (m/s)
  jumpLeapSpeed: 9.32,    // Airborne forward leap speed (m/s)

  // 7. Forward Lunge Impulses per Attack (meters)
  impulses: {
    combo: 2.4,
    jump: 7.0,
    downward: 0.05,
    spin360: 0.0,
    kick: 0.1,
  },
};
```

### B. Subgoal Stack State Machine (`BossSubgoal[]`)
The AI operates as a LIFO goal stack:
- **`STRAFE_INSPECT`:**
  - Active during boss cooldowns (`attackCooldown` between 1.5s and 2.8s).
  - Boss orbits the player at `preferredOrbitRadius` (~5.5m), moving laterally along its perpendicular right vector with `strafeDir` (`1` or `-1`).
  - Casts a short `THREE.Raycaster` (~2m) in the strafe direction every frame. If an obstacle or arena boundary is hit, `strafeDir` immediately inverts (`strafeDir *= -1`).
  - Locomotion weights (`strafe_left`, `strafe_right`, `walk_forward`, `walk_back`, `idle`) smoothly blend based on movement input.
- **`APPROACH`:**
  - Boss walks directly toward the player if out of attack range until reaching melee distance.
  - Automatically branches into `attack_jump` if distance remains large or approach finishes.
- **`ATTACK`:**
  - Dispatches attack actions through `boss.playAction()`, engaging `KinematicCombatController` to track animation frames, compute hitboxes, trigger VFX/SFX, and displace position.
- **`COMBO_CHECK`:**
  - Dynamic mid-combo decision point pushed between combo attacks:
    `[ATTACK(followup), COMBO_CHECK, ATTACK(opener)]`.
  - When `COMBO_CHECK` pops after Hit 1, it measures the distance to the player. If the player dodged away (`> 4.2m`), remaining combo attacks are purged and the boss returns to `STRAFE_INSPECT`.

### C. Frame-1 Interrupt Observer (Heal Punish)
- Every frame during `STRAFE_INSPECT` and `APPROACH`, `BossAI.update(dt, player)` evaluates `PlayerCombatSnapshot.isHealing`.
- The exact frame the player starts drinking/healing, the boss:
  1. Instantly clears `goalStack`.
  2. Resets `attackCooldown = 0`.
  3. Immediately pushes a gap-closing `attack_jump` lunge attack.

### D. Clamped Rotation & Windup Tracking
- Boss faces the player via clamped angular velocity (`maxTurnRate = degToRad(BOSS_CONFIG.turnRateDegreesPerSec)`).
- Boss tracks the player during the wind-up phase. When the active damage frames start (`isAttackActiveFrames = true`), rotation tracking freezes completely, allowing the player to dodge roll behind the boss.

---

## 3. Kinematic Combat & Root Motion (`src/combat/KinematicCombatController.ts`)

### Root Motion Preservation for Jump Attacks
- **Hips Bone Coordinate Note:** In Mixamo rigs loaded via Blender FBX, Hips translation tracks use local coordinates where X is lateral, Y is horizontal forward/backward, and Z is vertical jumping/ducking height.
- To prevent locking vertical leaping, `ModelLoader.stripRootMotionXZ` is NOT called on the boss armature. Instead, `KinematicCombatController.stripRootMotion` locks local X and Y while preserving Z (`v[i+2]`).
- During `attack_jump`:
  - **Run-Up Phase (Frames 15–57):** Accelerates from `BOSS_CONFIG.jumpRunStartSpeed` (2.2 m/s) to `BOSS_CONFIG.jumpRunEndSpeed` (5.0 m/s).
  - **Airborne Leap Phase (Frames 58–95):** Forward translation covers ground at `BOSS_CONFIG.jumpLeapSpeed` (9.32 m/s) while hips bone vertically tracks natural arc.
  - **Impact Phase (Frames 96–103):** Hitbox activates, planar ground slam shockwave spawns, and camera shakes.

---

## 4. Player & Item Socket System (`src/entities/PlayerCharacter.ts`, `src/combat/WeaponSocketConfig.ts`)

### A. Health Potion Model & Upper-Body Blending
- **3D Model:** Optimized `public/assets/items/health_potions.glb` (~76KB) attached to `mixamorig:LeftHand` bone socket.
- **Upper-Body Override:** When drinking (`isDrinking`), `PlayerCharacter` enables `isUpperBodyOverride = true`. Upper-body bones track the healing animation while lower-body bones continue running/walking (`PlayerLocomotion.ts`), preventing the player from freezing in place while healing.
- **Visual Flask Socket Tool:** In `asset-test.html`, a dedicated socket configuration GUI (`src/asset-test/ui/WeaponSocketGUI.ts`) allows live translation, rotation, and scale tuning of weapon and potion sockets with `localStorage` persistence.

---

## 5. File & Directory Reference

```
souls-browser/
├── assets/
│   ├── raw/                   # Uncompiled source FBX animations & models
│   └── weapons/               # Equipment models (Sword.glb)
├── public/
│   └── assets/
│       ├── items/             # Optimized item GLBs (health_potions.glb)
│       ├── models/
│       │   ├── players/       # Standardized player GLBs (knight.glb, samurai.glb)
│       │   └── bosses/        # Standardized boss GLBs (titan.glb)
│       └── sfx/               # Web Audio sound effects
├── src/
│   ├── asset-test/            # Isolated dual-track animation & socket inspection harness
│   │   ├── track1/RawAnimationStage.ts
│   │   ├── track2/CombatDuelStage.ts
│   │   └── ui/WeaponSocketGUI.ts
│   ├── combat/
│   │   ├── FrameCombat.ts               # Attack & dodge frame timings and impulses
│   │   ├── HitboxVisualDebugger.ts       # Visual yellow/red box hitbox renderer
│   │   ├── HitDetection.ts              # Swept segment-to-capsule math
│   │   ├── KinematicCombatController.ts # Frame state machine, root motion & jump physics
│   │   ├── KinematicData.ts             # Action frame definitions & socket bindings
│   │   └── WeaponSocketConfig.ts        # Hand socket matrices (weapon & potion)
│   ├── core/
│   │   ├── InputController.ts           # Keyboard, mouse look & pointer lock
│   │   └── Loop.ts                      # Fixed 60Hz delta accumulator loop
│   ├── entities/
│   │   ├── boss/
│   │   │   └── BossAI.ts                # BOSS_CONFIG, LIFO subgoal stack & heal punish
│   │   ├── player/
│   │   │   ├── HealingFlask.ts          # Potion loading & procedural fallback
│   │   │   └── PlayerLocomotion.ts      # Locomotion & upper-body blend overrides
│   │   ├── BossCharacter.ts             # Boss entity, blend tree & action dispatch
│   │   └── PlayerCharacter.ts           # Player entity, combat states & heal loop
│   ├── game/
│   │   └── Game.ts                      # Master game coordinator & prewarm pipeline
│   ├── systems/
│   │   ├── AudioSystem.ts               # Web Audio sound effects
│   │   ├── Hud.ts                       # Minimalist player/boss health bars & damage numbers
│   │   ├── PerformanceProfiler.ts       # 1% low FPS profiler & spike telemetry
│   │   ├── SettingsManager.ts           # Persistent graphics & gameplay settings
│   │   └── SoulslikeCamera.ts           # 3rd-person lock-on camera & shake
│   └── vfx/
│       ├── BloodBurstVFX.ts             # three.quarks directional arterial blood
│       ├── GroundSlamVFX.ts             # Planar ground crack decals
│       └── SlashArcRibbon.ts            # Dynamic blade trail ribbon
├── tests/
│   ├── boss-ai-strafe.spec.ts           # 20 tests: Subgoals, Strafe, Punish, Turn Clamping
│   ├── combat.spec.ts                   # E2E combat loop, YOU DIED, LEGEND VANQUISHED
│   ├── debug-tools-sandbox.spec.ts      # Hitbox debugger, dodge impulse, jump leap (>3.5m)
│   └── kinematic-combat.spec.ts         # 14 kinematic actions & frame timings
├── asset-test.html                      # Visual socket calibration tool
└── index.html                           # Main game page
```

---

## 6. How to Run, Test, and Verify

```bash
# 1. Start local development server (runs on http://127.0.0.1:5188)
npm run dev

# 2. Run TypeScript typecheck & production build (must pass with 0 errors)
npm run build

# 3. Run all automated Playwright test suites (Chrome desktop & mobile)
npx playwright test tests/boss-ai-strafe.spec.ts tests/debug-tools-sandbox.spec.ts tests/combat.spec.ts

# 4. Calibration & Debug Tools:
# - Open http://127.0.0.1:5188/asset-test.html to calibrate weapon & potion hand sockets
# - In combat, press [H] to toggle visual wireframe hitboxes (green = passive, red = active damage)
```

---

## 7. Healing Potion System, Optimization & Socket Calibration

### A. Asset Shrinking & Browser Optimization (`public/assets/items/health_potions.glb`)
- **Size Reduction:** Sunk from raw 4.58MB down to **74.8KB (76,552 bytes, 98.3% reduction)**.
- **Mesh Merging:** Merged 13 fragmented sub-meshes and duplicate objects into a single clean indexed triangle mesh (`Single Draw Call`).
- **Texture Packing:** Downsampled 4 raw 1024x1024 textures to optimized 256x256 / 128x128 JPEG chunks embedded directly in the binary GLB container without external fetch dependencies.

### B. Frame Freeze & Hitch Resolution
1. **GPU Shader Pre-warming (`src/game/Game.ts`):** Three.js `renderer.compile()` ignores objects with `visible === false`. During `prepareMatch()`, `flaskMesh.visible` is temporarily set to `true` while compiling the scene and executing the warm-up render, eliminating the 100–300ms JIT shader compilation spike on first drink.
2. **Locomotion Action Transition Guards (`src/entities/player/PlayerLocomotion.ts`):** Wrapped `playAction('idle')`, `playAction('walk')`, and `playAction('run')` with active state guards to stop redundant animation cross-fading from firing 60 times/sec during upper-body potion overrides.
3. **Hierarchy Traversal Pruning (`src/entities/PlayerCharacter.ts`):** Removed redundant `updateMatrixWorld(true)` traversals in player character per-frame updates.

### C. Socket Calibration Tooling (`asset-test.html`, `src/asset-test/`)
- **Default Potion Socket:** Updated in [`src/combat/WeaponSocketConfig.ts`](./src/combat/WeaponSocketConfig.ts) to `posX: 3.5, posY: 11.2, posZ: -1.0, rotX: -85, rotY: 10, rotZ: 15, scale: 18.0`.
- **Window 3 Potion Tab:** Added "Healing Potion" tab button to Window 3 in `asset-test.html` alongside Player Axe and Boss Sword. Supports real-time X/Y/Z position, rotation, and uniform scale sliders with localStorage caching and code export.
- **Window 2 Combat Action:** Added "Drink Potion" button in Track 2 duel testing stage to test drinking in duel scenarios.

---

## 8. Commit Log & Next Steps for Incoming Engineers / Agents

### Recent Work Completed
- `public/assets/items/health_potions.glb`: Optimized 74.8KB 3D model (single draw call, 256x256 textures).
- `src/combat/WeaponSocketConfig.ts`: Baseline potion socket transform configuration (`scale: 18.0`).
- `src/asset-test/track1/RawAnimationStage.ts`, `src/asset-test/track2/CombatDuelStage.ts`, `src/asset-test/ui/WeaponSocketGUI.ts`, `src/asset-test/ui/CombatDuelUI.ts`, `src/asset-test/ui/DomBindings.ts`, `asset-test.html`: Interactive potion socket tuning and drink testing in Window 3 & Window 2.
- `src/entities/player/PlayerLocomotion.ts` & `src/entities/PlayerCharacter.ts`: Locomotion transition guards and hierarchy traversal pruning.
- `src/game/Game.ts`: Shader pre-warming in `prepareMatch()` (`flaskMesh.visible = true` during `renderer.compile()`).
- `tests/upper-lower-animation-layering.spec.ts`: Integration test positioning for match reset / heal charges test.
- `src/entities/boss/BossAI.ts`: Restored `turnRateDegreesPerSec: 140` matching unit test and specification.

### Key Guidelines for Next Tasks:
1. **Boss Speed & Movement Tuning:** Always adjust values inside `BOSS_CONFIG` at the top of [`src/entities/boss/BossAI.ts`](./src/entities/boss/BossAI.ts). Do not hardcode velocities in switch branches.
2. **Kinematic Jumping:** Never apply horizontal `stripRootMotionXZ` across all axes indiscriminately on the boss model; keep vertical hips height intact so the leap animation works in sync with `KinematicCombatController`.
3. **Type Safety & Build:** Ensure `npm run build` succeeds after any file edits.

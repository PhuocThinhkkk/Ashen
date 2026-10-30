# Kinematic Combat & Animation System Guide

This document provides developer instructions for using, extending, and maintaining the Kinematic Combat System in `souls-browser`. It explains how offline kinematic analysis from Blender (`kinematic_summary.json`) connects to the Three.js runtime via `KinematicData.ts`, `KinematicCombatController.ts`, Three-Nebula particle VFX, and Web Audio API hooks.

---

## 1. Quick Reference & Architecture

```
                  assets/raw/anims/ (*.fbx)
                            │
              npm run anim:pipeline (Blender + Node)
                            │
                  kinematic_summary.json
                            │
               src/combat/KinematicData.ts
              (14 Actions, Phases, Hitboxes,
                  Crossfades, VFX & Audio)
                            │
           src/combat/KinematicCombatController.ts
                            │
       ┌────────────────────┴────────────────────┐
       ▼                                         ▼
src/entities/PlayerCharacter.ts       src/entities/BossCharacter.ts
       │                                         │
       ├─ In-place root stripping                ├─ In-place root stripping
       ├─ Bone hitbox (RightHand)                ├─ Bone hitbox (RightHand & LeftFoot)
       ├─ Airborne i-frames                      ├─ Jump Attack leap extraction (-5.9m)
       └─ Precise Recovery crossfade             └─ Precise Recovery crossfade
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
   src/systems/VFXSystem.ts      src/systems/AudioSystem.ts
   - Foot dust kick-up (Nebula)  - Peak velocity swooshes
   - Peak sparks & weapon trail  - Ground landing thuds
                                 - Footstep audio
```

---

## 2. Kinematic Data Contract (`src/combat/KinematicData.ts`)

Every action is registered in `KINEMATIC_ACTIONS` with its exact frame metrics extracted at 60 FPS:

```ts
export interface KinematicActionConfig {
  id: string;                    // Standard alias ('attack_light', 'attack_jump', 'kick', etc.)
  fileName: string;              // Source FBX file name
  actionName: string;            // Layer name inside armature
  totalFrames: number;           // Total clip length in frames
  fps: number;                   // Standard 60 FPS
  duration: number;              // totalFrames / 60 in seconds
  rootMotion: {
    type: 'In-Place' | 'Root Motion';
    deltaY: number;              // e.g. -5.9 for Run Jump Attack
    deltaX: number;
  };
  phases: KinematicPhase[];      // 'Windup' | 'Airborne' | 'Impact' | 'Recovery'
  hitbox?: KinematicHitboxConfig;// Bone target and active frame window
  crossfadeDurationOut: number;  // Recovery-to-Windup crossfade duration (s)
  vfx: KinematicVFXConfig;       // Landing dust & peak sparks frame triggers
  audio: KinematicAudioConfig;   // Swoosh, impact, and footstep frame triggers
}
```

### Complete 14-Action Metric Table

| Action Identifier | Source FBX | Total Frames | Active Impact Window | Peak Velocity Bone | Peak Vel (m/s) | Peak Frame | Crossfade Out | Root Motion |
|---|---|---|---|---|---|---|---|---|
| `kick` | `Great Sword Kick.fbx` | 105 | 32–48 | `mixamorig:LeftFoot` | 10.6 | 42 | 0.20 s | In-Place |
| `attack_360` | `Standing Melee Attack 360 Low heavy attack.fbx` | 150 | 44–66 | `mixamorig:RightHand` | 8.2 | 56 | 0.30 s | In-Place |
| `attack_heavy` | `Standing Melee Attack Downward.fbx` | 137 | 39–57 | `mixamorig:RightHand` | 9.3 | 51 | 0.25 s | In-Place |
| `attack_combo` | `Standing Melee Combo Attack Ver. 2.fbx` | 253 | 148–164 | `mixamorig:RightHand` | 13.4 | 157 | 0.35 s | In-Place |
| `attack_jump` | `Standing Melee Run Jump Attack.fbx` | 221 | 96–103 | `mixamorig:RightHand` | 23.5 | 99 | 0.40 s | **-5.9m leap** |
| `hit` | `Great Sword Impact.fbx` | 76 | 1–16 | `mixamorig:RightHand` | 3.6 | 12 | 0.20 s | In-Place |
| `dodge` | `Stand To Roll.fbx` | 143 | — (Airborne 39–105) | — | — | — | 0.20 s | In-Place |
| `idle` | `Great Sword Idle.fbx` | 121 | — | — | — | — | 0.20 s | In-Place |
| `attack_light` | `Great Sword Light Attack.fbx` | 77 | 27–44 | `mixamorig:RightHand` | 10.8 | 34 | 0.15 s | In-Place |
| `run` | `Great Sword Run.fbx` | 37 | — | — | — | — | 0.20 s | In-Place |
| `strafe_left` | `Great Sword Strafe Left.fbx` | 39 | — | — | — | — | 0.15 s | In-Place |
| `strafe_right` | `Great Sword Strafe right.fbx` | 66 | — | — | — | — | 0.15 s | In-Place |
| `walk_backward` | `Great Sword Walk backward.fbx` | 78 | — | — | — | — | 0.20 s | In-Place |
| `walk` | `Great Sword Walk forward.fbx` | 82 | — | — | — | — | 0.20 s | In-Place |

---

## 3. Animation Controller & In-Place Blending (`KinematicCombatController`)

### In-Place Root Motion Suppression
Three.js character locomotion is controlled via code physics capsules to prevent desync and rubber-banding. All In-Place clips have their horizontal root translation tracks zeroed:
```ts
controller.stripRootMotion(clip);
```
This strips X/Z movement from `mixamorig:Hips` while preserving natural vertical hips bobbing.

### Root Motion Extraction for Jump Attack
`Standing Melee Run Jump Attack` has an intentional forward leap of `-5.9m` along local -Y. The controller samples the forward displacement during the `Airborne` phase (frames 58–95) and applies it to the character entity capsule:
```ts
const rootDelta = this.kinematicController.consumeRootMotionDelta();
if (rootDelta.lengthSq() > 0) {
  this.group.position.add(rootDelta);
}
```

### Calibrated Crossfading
When transitioning out of an action, the controller automatically uses that action's calibrated `crossfadeDurationOut` to blend into the next action's `Windup` phase:
```ts
// Light attack recovers quickly into another swing or dodge:
controller.playAction('attack_light', action); // uses 0.15s out
// Jump attack recovery requires a heavier settle:
controller.playAction('attack_jump', action);  // uses 0.40s out
```

---

## 4. Bone-Socketed Hitbox Logic

Hitboxes are bound directly to skeleton bones rather than world-space approximations:
- **Melee Attacks:** Attached to `mixamorig:RightHand` (and blade mesh node).
- **Kicks:** Dynamically switches target socket bone to `mixamorig:LeftFoot`.

### Frame-Accurate State Toggle
`isAttacking` is toggled strictly within the `Impact` phase window:
```ts
// Inside KinematicCombatController.update():
if (cfg.hitbox) {
  this.isAttacking =
    this.currentFrame >= cfg.hitbox.activeStartFrame &&
    this.currentFrame <= cfg.hitbox.activeEndFrame;
}
```

During collision resolution, `Game.ts` queries:
```ts
const isHit = attacker.isHitboxActive();
const hitboxPos = attacker.getHitboxWorldPosition();
```

---

## 5. FromSoftware-Calibrated Dodge Roll System

The dodge roll follows precise Souls combat design timings decoupled from raw display FPS:

```
[0.00s ─── Startup (0.15s) ─── 0.15s ─── Active I-Frames (0.43s) ─── 0.58s ─── Recovery (0.27s) ─── 0.85s]
  Frames 1 to 25                  Frames 25 to 100                     Frames 100 to 143
  Vulnerable: Quick Dive          Invulnerable: Reddish Flash          Vulnerable: Feet Landing
  Micro-advance: 1.4 m/s          Sinusoidal Traversal (~2.1m)         Decay to neutral stance
```

### 1. Phase Breakdown
- **Startup / Delay (Frames 1 to 25, Duration: `~0.15 seconds`):**
  Initial wind-up dive from button press. Drives animation frames 1 to 25 in 0.15s. Fully vulnerable to incoming attacks.
- **The Invulnerable Roll (Frames 25 to 100, Duration: `~0.43 seconds`, `0.15s` to `0.58s`):**
  Core invincibility window. Drives animation frames 25 to 100. Attacks pass through cleanly without damage. Character mesh visualizes active i-frames with a subtle reddish emissive flash (`0xff4433`, intensity `0.65`). Velocity follows a half-sine impulse curve (`peakSpeed = 7.8 m/s`) covering `~2.13 meters`. Total roll distance is calibrated to **`~2.35 meters`** (compact and grounded).
- **The End / Recovery (Frames 100 to 143, Duration: `~0.27 seconds`, `0.58s` to `0.85s`):**
  Character recovers feet. Drives animation frames 100 to 143. Vulnerable again. Reddish flash clears immediately. Cannot chain rolls or attacks until recovery completes. Total clip is 143 frames completed in exactly 0.85s.

---

## 6. Visual Hitbox Debugger (`src/combat/HitboxVisualDebugger.ts`)

- **EdgesGeometry Architecture:** Built using `THREE.BoxGeometry`, `THREE.EdgesGeometry`, and `THREE.LineSegments` with a semi-transparent fill mesh (`depthTest: false`). Renders 12 crisp bounding edges without diagonal wireframe triangulation.
- **Automatic Bone Socketing:** Attached directly as a child of the armature bone (`mixamorig:RightHand` or `mixamorig:LeftFoot`), automatically inheriting skeletal rotation and position without manual matrix math.
- **Phase-Accurate Color Tints:**
  - **Inactive / Windup / Recovery:** Semi-transparent green wireframe (`#00ff88`).
  - **Active Impact Window:** Glowing solid red (`#ff2222`, line opacity `1.0`, fill opacity `0.45`).
- **Toggle Hotkey:** Press `H` in the main game or sandbox viewer to toggle hitboxes in real time.

---

## 7. Sandbox Asset Viewer Mode (`/asset-test.html`)

An isolated inspection and testing harness:
- **Dual Camera Mode:** `[ 🧭 Orbit Camera ]` for 360° orbital inspection and `[ 🏃 Walk Test Mode ]` for direct `WASD` navigation on a meter-marked floor grid.
- **Frame Scrubber:** Single-frame step forward (`]`) and backward (`[`), play/pause (`Space`), and speed scaling (`0.25x` to `1.5x`).
- **Live Telemetry Banner:** Real-time HUD readout displaying active clip, current frame vs. total frames, kinematic phase (`Windup`, `Airborne`, `Impact`, `Recovery`), and damage active state.

---

## 8. Three-Nebula Particle VFX Triggers

`VFXSystem.ts` integrates the `three-nebula` engine (`^13.3.0`) for high-fidelity particle effects:

1. **Foot Dust Kick-up (`spawnFootDustKickup`):**
   - Triggered when transitioning from an `Airborne` phase to `Impact` or `Recovery` (ground landing).
   - Maps to feet bones (`mixamorig:LeftFoot` and `mixamorig:RightFoot`).
   - Uses soft radial gradient smoke textures, upward cone velocity, and opacity fade.
2. **Peak Velocity Sparks (`spawnPeakVelocitySparks`):**
   - Triggered at the exact frame of maximum kinetic velocity (e.g., frame 99 for Jump Attack at 23.5 m/s).
   - Emits radial high-velocity spark bursts with additive blending.
3. **Weapon Trail (`spawnWeaponTrail`):**
   - Emits a glowing particle ribbon along the hand/weapon bone during active attack swings.

---

## 6. Synthetic Web Audio API Hooks

`AudioSystem.ts` produces procedural audio synchronized with kinematic frames:

1. **`playPeakSwoosh(freq, duration, isHeavy)`:**
   - Sawtooth/triangle oscillator with exponential frequency down-ramp through a bandpass filter.
   - Synchronized with weapon peak velocity frames (e.g. frame 26 for light slash, frame 146 for combo finisher).
2. **`playFootstep(heavy)`:**
   - Low-frequency triangular thump for stride foot plants.
   - Synchronized with locomotion recovery frames (e.g. frame 5 & 29 for run, frame 21 & 63 for walk).
3. **`playLandingThud(heavy)`:**
   - Deep sub-bass thump on landing from Airborne transitions (e.g. frame 96 for Jump Attack, frame 106 for Dodge Roll).

---

## 7. How to Add or Update an Animation

Follow these steps whenever a new animation is imported:

1. **Place raw FBX:** Put new animation in `assets/raw/anims/<category>/<Name>.fbx`.
2. **Run extraction pipeline:**
   ```bash
   npm run anim:pipeline
   ```
   This extracts transforms to `local_anim_dumps/` and updates `kinematic_summary.json`.
3. **Register in `src/combat/KinematicData.ts`:**
   Add entry to `KINEMATIC_ACTIONS` with:
   - Extracted phase frame boundaries (`Windup`, `Airborne`, `Impact`, `Recovery`).
   - Active hitbox bone (`RightHand` or `LeftFoot`) and frame range.
   - Peak velocity frame and value.
   - Landing dust and audio triggers.
4. **Recompile character GLBs:**
   ```bash
   npm run build:models:clean
   ```
5. **Run tests:**
   ```bash
   npx playwright test tests/kinematic-combat.spec.ts
   npx playwright test tests/combat.spec.ts
   ```

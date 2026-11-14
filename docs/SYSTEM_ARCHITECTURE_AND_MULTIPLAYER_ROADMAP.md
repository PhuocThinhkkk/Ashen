# Souls Browser: System Architecture & Multiplayer Roadmap

> **Authoritative Technical Documentation & Engineering Context**  
> *Target Audience:* Principal Systems Architects, Lead Game Engineers, and AI Agents maintaining this codebase.

---

## 1. Project Overview & Core Philosophy

**Souls Browser** is a browser-native 3D action boss fight inspired by FromSoftware's *Dark Souls* and *Elden Ring*. It delivers tight, responsive melee combat, high-fidelity dark-fantasy aesthetics, frame-accurate animation kinematics, and procedural audio directly inside modern desktop and mobile browsers at a locked 60 FPS on a $0 external asset budget.

### Core Tenets
1. **Zero-Stutter Combat**: All expensive resources (3D models, animation track interpolants, WebGL shaders, shadow depth programs, particle systems, and audio buffers) must be prepared and compiled *before* active combat begins.
2. **Deterministic Kinematics**: Character movement, attack lunges, and roll displacements are governed by physics curves and kinematic frame data rather than arbitrary animation root motion drift.
3. **Visceral Visual & Audio Clarity**: Dark Souls-style directional blood spray, collision spark bursts, and synchronized procedural/Web-Audio SFX provide instantaneous feedback. Emissive scene-graph traversals ("hit flashes") are avoided to preserve performance and authentic visual tone.
4. **Minimalist AAA Dark-Fantasy Aesthetic**: Zero native emojis. Strict typographic hierarchy (Cinzel serif, Inter body, JetBrains Mono telemetry), sharp 1px hairline borders, deep obsidian glassmorphism, and muted gold accents (`#D4AF37`).
5. **Deterministic Lifecycle Resets**: Trial restarts (Key: R) must fully purge animation weights, kinematic accumulators, particle systems, decals, and camera trauma without requiring page reloads or incurring memory leaks.

---

## 2. Directory & Subsystem Architecture

```
souls-browser/
├── artifacts/
│   ├── canvas-inspection/     # Automated canvas inspection metrics & JSON logs
│   └── screenshots/           # Playwright visual validation and test screenshots
├── assets/
│   ├── raw/                   # Uncompiled source assets (FBX animations, models, audio)
│   └── weapons/               # Equipment models (Sword.glb)
├── docs/
│   ├── DUAL_TRACK_ASSET_TEST_HARNESS.md           # Dual-track inspection suite documentation
│   └── SYSTEM_ARCHITECTURE_AND_MULTIPLAYER_ROADMAP.md # This document
├── public/
│   └── assets/
│       ├── models/players/    # Compiled player GLTF models (knight.glb, samurai.glb)
│       ├── models/bosses/     # Compiled boss GLTF models (titan.glb)
│       └── sfx/               # Trimmed, zero-latency Web Audio sound files
├── scripts/
│   ├── blender_convert.py     # Sketchfab GLB -> Mixamo Y-up FBX converter
│   ├── build-models.mjs       # Headless Blender pipeline orchestrator
│   └── process_mixamo.py      # Bone mapping, root-motion stripping, and GLTF exporter
├── src/
│   ├── combat/
│   │   ├── FrameCombat.ts               # Attack, dodge & poise data definitions
│   │   ├── HitboxVisualDebugger.ts       # Volumetric yellow wireframe hitbox renderer
│   │   ├── HitDetection.ts              # Directional arc & contact point detection
│   │   ├── KinematicCombatController.ts # Frame-accurate action & phase state machine
│   │   ├── KinematicData.ts             # 14-action phase timings, frames & socket bindings
│   │   ├── WeaponCollisionSystem.ts     # Continuous 3D swept segment-to-capsule math
│   │   ├── WeaponHitboxVisualizer.ts    # Debug visualizer for swept blades
│   │   └── WeaponSocketConfig.ts        # Hand socket transformation matrices
│   ├── core/
│   │   ├── InputController.ts # Pointer-lock, mouse deltas, keyboard buffer & reset
│   │   ├── Loop.ts            # Delta-clamped requestAnimationFrame tick coordinator
│   │   └── Renderer.ts        # Three.js WebGLRenderer, shadow map, and DPR scaling
│   ├── entities/
│   │   ├── BossCharacter.ts   # Malakhor AI FSM, attacks, phase transition, reset
│   │   └── PlayerCharacter.ts # Player controller, movement, actions, stamina, reset
│   ├── game/
│   │   └── Game.ts            # Master engine coordinator, collision resolver, prewarm
│   ├── systems/
│   │   ├── AudioSystem.ts          # Web Audio API procedural & buffer synthesizer
│   │   ├── Hud.ts                  # Minimalist player/boss vitals & floating damage
│   │   ├── PerformanceProfiler.ts  # 1% low FPS, spikes, CPU/WebGL split, JSON export
│   │   ├── SettingsManager.ts      # Persistent graphics, VFX, and gameplay settings
│   │   ├── SoulslikeCamera.ts      # 3rd-person follow, lock-on target tracking, shake
│   │   └── VFXSystem.ts            # Master VFX coordinator, blood, sparks, trails
│   ├── ui/
│   │   └── UnifiedSettingsModal.ts # Tabbed dark-fantasy settings & profiler modal
│   ├── utils/
│   │   ├── dispose.ts         # Three.js recursive resource cleanup
│   │   └── ModelLoader.ts     # GLTF loader & bone socket finder
│   ├── vfx/
│   │   ├── BloodBurstVFX.ts   # three.quarks directional arterial blood spray
│   │   ├── GroundSlamVFX.ts   # Pre-allocated planar crack decals & shockwaves
│   │   └── SlashArcRibbon.ts  # GLSL Simplex noise dynamic blade sweep ribbon
│   ├── world/
│   │   └── Arena.ts           # Sanctuary geometry, static shadow optimizations, embers
│   ├── asset-test.ts          # Dual-track inspection harness entrypoint
│   ├── main.ts                # Main game entrypoint
│   └── styles.css             # AAA Dark-Fantasy design system & typography
├── tests/                     # Playwright automated test suites (100% pass rate)
│   ├── animation-capture.spec.ts
│   ├── asset-test-dual-track.spec.ts
│   ├── asset-validation.spec.ts
│   ├── combat.spec.ts
│   ├── debug-tools-sandbox.spec.ts
│   ├── integration-models.spec.ts
│   ├── kinematic-combat.spec.ts
│   ├── vfx-combat.spec.ts
│   └── visual.spec.ts
├── index.html                 # Main encounter canvas & HUD
├── asset-test.html            # Dual-track developer tool harness
├── package.json
├── playwright.config.ts
└── tsconfig.json
```

---

## 3. Core Engine & Rendering Architecture

### 3.1 Simulation Loop & Delta Time Clamping (`Loop.ts`)
* Uses `requestAnimationFrame` with an internal delta accumulator.
* Delta is strictly clamped to `Math.min(delta, 0.05)` (50ms). This prevents physics explosion or collision tunneling if a background tab drops frames.
* The loop decouples simulation update (`update(simDelta, elapsed)`) from WebGL command submission (`render()`).

### 3.2 WebGL Renderer & Shadow Optimizations (`Renderer.ts`, `Arena.ts`)
* **Color Space & Tone Mapping**: `THREE.SRGBColorSpace` with `THREE.ACESFilmicToneMapping` at exposure `1.10`.
* **Shadow Map**: `THREE.PCFShadowMap` driven by a single directional moonlight (`DirectionalLight` at `[-14, 24, 16]`).
* **Static Shadow Pruning**: Static arena architecture (16 pillars, 16 wall segments, spires, and braziers) has `castShadow = false` and `receiveShadow = true`. Dynamic shadows are exclusively cast by moving humanoid character armatures and weapons, reducing shadow depth draw calls by over 85%.
* **Dynamic Resolution Scaling (DPR)**: Handled via `SettingsManager.data.graphics.maxDpr` (toggled between `0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`).

---

## 4. Kinematics, Collision & Combat Systems

### 4.1 Mixamo 65-Bone Standard Armature & In-Place Root Motion
All humanoid characters (`Knight`, `Samurai`, `Titan`) share a standardized 65-bone Mixamo skeleton archetype.
- **Horizontal Translation Stripping**: Mixamo animations are processed via `scripts/process_mixamo.py` where X/Z translation tracks on `mixamorig:Hips` are zeroed out.
- **Vertical Kinematics Preserved**: Vertical translation (Y-axis) is retained for jumping and landing arcs.
- **Code-Driven Forward Displacement**: Forward momentum during lunges (e.g., heavy thrust $+3.2\text{m}$, light attack $+1.2\text{m}$) and boss leap attacks (`+7.0m` parabolic leap arc) is calculated programmatically using physical half-sine curves in `KinematicCombatController.ts`, guaranteeing perfect spatial predictability without animation drift.

### 4.2 Continuous 3D Swept Weapon Collision (`WeaponCollisionSystem.ts`)
* Unlike naive 2D range checks or spherical point triggers, the collision system performs 3D line-segment to vertical capsule calculations (`distSegmentToSegment`).
* **Swept Volume**: Computes shortest distance between the weapon blade segment at frame $t$ and frame $t-1$ against the target's vertical spine capsule ($R = 0.55\text{m}, H = 1.8\text{m}$). Fast swings cannot tunnel through targets even at low frame rates.

### 4.3 Dodge Invulnerability Frames (i-Frames) (`KinematicData.ts`)
Configured in `DODGE_CONFIG`:
* **Phase 1: Startup (Dive Commit)**: Frames 1–32 (0.20s). Character commits to roll; fully vulnerable to incoming hits.
* **Phase 2: Active i-Frames (Invulnerability)**: Frames 33–90 (0.50s). `isInvulnerable = true`. Weapon collisions pass through cleanly without dealing damage.
* **Phase 3: Recovery (Standing Back Up)**: Frames 91–120 (0.30s). `isInvulnerable = false`. Input locked; vulnerable to roll-catching attacks.

---

## 5. Visual Effects & Shader Warm-Up Pipeline

### 5.1 Object-Pooled Visual Effects (`VFXSystem.ts`)
1. **Visceral Blood Burst (`BloodBurstVFX.ts`)**:
   - Built on `three.quarks` GPU particle instancing (`BatchedRenderer`).
   - Uses `RenderMode.StretchedBillBoard` with gravity force (`[0, -7.5, 0]`) and directional cone emission pointing along impact normal with an upward arterial bias.
   - 6 pre-allocated particle systems; zero runtime allocations on hits.
2. **Sword Slash Arc Ribbon (`SlashArcRibbon.ts`)**:
   - Custom `ShaderMaterial` with 2D Simplex noise dynamic dissolution, razor cutting leading edge, and additive emissive core.
   - 6 pre-allocated ribbon mesh instances.
3. **Colossal Ground Slam (`GroundSlamVFX.ts`)**:
   - 6 pre-allocated planar decal meshes positioned at $Y = 0.04\text{m}$ with shared crater texture and opacity fading.
   - 4 expanding shockwave ring meshes ($R: 0.1\text{m} \to 5.6\text{m}$ over $0.20\text{s}$).
   - 4 donut particle emitters for rolling ground dust.
   - **Zero CPU Geometry Slicing**: Replaced synchronous `DecalGeometry` clipping with pre-allocated planar decals, eliminating 40–90ms CPU stalls on boss smashes.

### 5.2 Pre-Match Warm-Up Phase (`Game.prepareMatch`)
When loading the encounter:
```
[ ENCOUNTER PREPARATION SEQUENCE ]
1. Load 3D GLTF models & weapon meshes.
2. Pre-tick mixer actions once on hidden models to bind AnimationMixer track interpolants.
3. Pre-compile WebGL shaders (materials, shadows, tone mapping) via renderer.compile(scene, camera).
4. Pre-warm three.quarks particle shaders by triggering 1 off-screen dummy emission.
5. Pre-allocate decal and ribbon pools.
6. Pre-decode all Web Audio sound buffers.
7. Smoothly transition to live combat at locked 60 FPS.
```

---

## 6. Minimalist AAA Dark-Fantasy Design System

### 6.1 Design Tokens (`src/styles.css`)
- **Fonts**:
  - Headers & Section Titles: `"Cinzel", serif;`
  - Body & Descriptions: `"Inter", sans-serif;`
  - Telemetry & Metrics: `"JetBrains Mono", monospace; font-variant-numeric: tabular-nums;`
- **Color Palette**:
  - Obsidian Base: `#06080E`
  - Modal Panels: `rgba(11, 15, 23, 0.94)` with `backdrop-filter: blur(8px)`
  - Cards: `rgba(16, 22, 32, 0.70)` with 1px hairline border `rgba(212, 175, 55, 0.20)`
  - Muted Gold Primary: `#D4AF37`
  - Gold Focus / Accent: `#FFD700`
  - Dim Gold: `#8C7841`
  - Parchment Text: `#E5DED2`
  - Muted Text: `rgba(229, 222, 210, 0.65)`
- **Iconography**:
  - 100% SVG vectors (`stroke-width="1.6"`, `currentColor`).
  - Native emojis are completely prohibited.

---

## 7. Deterministic Entity & Scene Respawn Pipeline

### 7.1 Reset Sequence Specification (`Game.resetRun`)
Triggered via Key `R`, death overlay, or settings reset button:

```
[ GAME.RESETRUN() ]
 ├── 1. hitstopTimer = 0 (Restores 1.0x simulation timescale)
 ├── 2. input.reset() (Wipes held keys, mouse deltas, one-frame combat triggers)
 ├── 3. vfx.reset()
 │       ├── SlashArc ribbons: active = false, visible = false, timer = 0
 │       ├── Spark bursts: active = false, points.visible = false
 │       └── GroundSlam: shockwaves & decals deactivated, opacities = 0
 ├── 4. player.reset([0, 0, 9])
 │       ├── kinematicController.reset() (Wipes root motion buffer, frame counters)
 │       ├── mixer.stopAllAction() (Hard purge)
 │       ├── actions.forEach(a => { a.stop(); a.reset(); a.setEffectiveWeight(0); a.clampWhenFinished = false; })
 │       ├── idleAction.reset().setEffectiveWeight(1).play()
 │       ├── mixer.update(0) (Immediate T-pose/idle binding without crossfade interpolant leakage)
 │       └── pos(0,0,9), rot(0,0,0), vel(0,0,0), hp=100, stamina=100, state='idle'
 ├── 5. boss.reset([0, 0, -8])
 │       ├── kinematicController.reset()
 │       ├── mixer.stopAllAction()
 │       ├── actions.forEach(a => { a.stop(); a.reset(); a.setEffectiveWeight(0); })
 │       ├── idleAction.reset().setEffectiveWeight(1).play()
 │       ├── mixer.update(0)
 │       └── pos(0,0,-8), rot(0,π,0), hp=420, poise=100, isPhase2=false, state='idle'
 ├── 6. cameraRig.reset() (shakeIntensity = 0, target = null, yaw = 0, pitch = 0.26)
 ├── 7. cameraRig.snapTo(player.position, arena.radius)
 ├── 8. hud.reset() (Hides death/victory overlays, clears damage number DOM elements, resets chip HP)
 └── 9. profiler.markCombatEvent('TRIAL_RESET') & renderer.render(scene, camera)
```

---

## 8. Multiplayer Architecture & Roadmap (Phase 2 & Phase 3)

### 8.1 Architectural Philosophy: Lightweight Client-Authoritative Relay
For casual, low-overhead multiplayer sessions between friends:
* **Client-Authoritative Transforms**: Each player simulates their own physics, dodging, and movement locally (0ms perceived input lag).
* **State Relay Server**: Built with Node.js and **Colyseus** (`@colyseus/schema`), running at a fixed 30Hz network tick rate.
* **Room Matchmaking**: 6-character room codes (e.g., `ASH-402`) for instant Create/Join flows.
* **Snapshot Interpolation**: Remote entities are smoothly interpolated using a 60ms jitter buffer and Hermite/SLERP curves.

---

### 8.2 Server Architecture & File Structure

```
server/
├── package.json               # colyseus, @colyseus/schema, express, ws, typescript
├── tsconfig.json
└── src/
    ├── index.ts               # Express & Colyseus server entrypoint
    ├── rooms/
    │   ├── SoulsRoom.ts       # Room state machine, lobby, ready-check & tick
    │   └── schema/
    │       ├── RoomState.ts   # Replicated room phase, roomCode, matchMode
    │       └── PlayerState.ts # Replicated player transforms, vitals & combat state
    └── utils/
        └── RoomCodeGenerator.ts # Generates unique 6-character alphanumeric codes
```

#### Schema Definitions:
```typescript
// server/src/rooms/schema/PlayerState.ts
import { Schema, type } from '@colyseus/schema';

export class PlayerNetworkState extends Schema {
  @type('string') id: string = '';
  @type('string') sessionId: string = '';
  @type('string') modelId: string = 'knight';
  @type('boolean') isHost: boolean = false;
  @type('boolean') isReady: boolean = false;

  // Spatial Transforms
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') z: number = 0;
  @type('number') rotY: number = 0;
  @type('number') velX: number = 0;
  @type('number') velZ: number = 0;

  // Kinematic & Animation State
  @type('string') state: string = 'idle';
  @type('string') activeAttackId: string = '';
  @type('string') attackPhase: string = 'none';
  @type('number') animNormalizedTime: number = 0;
  @type('boolean') isInvulnerable: boolean = false;

  // Vitals
  @type('number') hp: number = 100;
  @type('number') maxHp: number = 100;
  @type('number') stamina: number = 100;
}
```

```typescript
// server/src/rooms/schema/RoomState.ts
import { Schema, MapSchema, type } from '@colyseus/schema';
import { PlayerNetworkState } from './PlayerState';

export type RoomPhase = 'LOBBY' | 'WARMING_UP' | 'ACTIVE_COMBAT' | 'MATCH_OVER';

export class RoomNetworkState extends Schema {
  @type('string') roomCode: string = '';
  @type('string') matchMode: string = 'PVP_DUEL'; // 'PVP_DUEL' | 'COOP_BOSS'
  @type('string') phase: string = 'LOBBY';
  @type('string') winnerSessionId: string = '';
  @type({ map: PlayerNetworkState }) players = new MapSchema<PlayerNetworkState>();
}
```

---

### 8.3 Client Network Integration & Entity Decoupling

To integrate multiplayer while preserving 100% of the single-player game's functionality:

```
                            ┌────────────────────────┐
                            │    BaseCombatEntity    │
                            │  - 3D Model Scene      │
                            │  - Armature Sockets    │
                            │  - AnimationMixer      │
                            │  - KinematicController │
                            │  - Hard Reset Logic    │
                            └───────────┬────────────┘
                                        │
                       ┌────────────────┴────────────────┐
                       │                                 │
                       ▼                                 ▼
         ┌───────────────────────────┐     ┌───────────────────────────┐
         │   LocalPlayerController   │     │     RemotePlayerProxy     │
         │ - Reads Keyboard / Mouse  │     │ - Reads Network Snapshots │
         │ - Runs Local Prediction   │     │ - 60ms Buffer Lerp/Slerp  │
         │ - Dispatches State to WS  │     │ - Mirrors Remote VFX/SFX  │
         └───────────────────────────┘     └───────────────────────────┘
```

#### Remote Player Proxy Interpolation:
* Remote players do not run keyboard inputs.
* The proxy receives state deltas from Colyseus at 30Hz and pushes them to a circular `SnapshotBuffer`.
* In `update(delta)`, the proxy samples the buffer at $t = \text{currentTime} - 60\text{ms}$:
  $$\vec{P}(t) = \text{lerp}(\vec{P}_0, \vec{P}_1, \alpha)$$
  $$Q(t) = \text{slerp}(Q_0, Q_1, \alpha)$$
* Remote animations play actions based on `state` and `activeAttackId` with dynamic rate adjustment ($1.0 \pm 0.1$) to prevent visual snapping.

---

### 8.4 Network Room Lifecycle

```
[ MAIN MENU / ONLINE MODAL ]
       │
       ├─ [ CREATE ROOM ] ──> Server creates Room, generates "ASH-402"
       │
       └─ [ JOIN ROOM ]   ──> Enter "ASH-402" ──> Connects to Room
                                   │
                                   ▼
[ LOBBY (Ready Check) ]
       │  Both players select character model (Knight / Samurai)
       │  Both players click [ READY ]
       │  Host clicks [ INITIATE TRIAL ]
       ▼
[ SYNCHRONIZED PREWARM ]
       │  Server broadcasts MATCH_PREPARE
       │  Both clients execute Game.prepareMatch() (compile shaders, warm pools)
       │  Both clients report ready -> Server broadcasts MATCH_START
       ▼
[ ACTIVE COMBAT ]
       │  30Hz state replication
       │  Client-authoritative hit claims:
       │    Attacker connects -> Sends HIT_EVENT(victimId, dmg, contactPoint)
       │    Server relays -> Victim takes damage, spawns blood & sparks at contactPoint
       ▼
[ MATCH OVER & REMATCH ]
       │  Victorious player sees LEGEND VANQUISHED; defeated sees YOU DIED
       │  Both players click [ REMATCH ]
       │  Deterministic reset pipeline runs on both clients (0ms reload)
       │  Combatants snap to spawn positions, match restarts instantly
```

---

## 9. Verification & Maintenance Guide

### Automated Playwright Test Commands
```bash
# Run full suite (Chrome headless with real WebGL2 backing)
npx playwright test --project=desktop-chrome

# Run specific subsystems
npx playwright test tests/combat.spec.ts --project=desktop-chrome
npx playwright test tests/kinematic-combat.spec.ts --project=desktop-chrome
npx playwright test tests/vfx-combat.spec.ts --project=desktop-chrome
npx playwright test tests/integration-models.spec.ts --project=desktop-chrome

# Production TypeScript check and build
npm run build
```

---
*Document maintained under Milestone 7 / Phase 1 completion.*

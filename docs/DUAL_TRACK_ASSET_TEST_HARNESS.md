# Dual-Track 4-Model Asset & Combat Logic Test Harness Guide

This document describes the architecture, controls, and usage of the **Dual-Track Asset & Combat Testing Suite** available at `/asset-test.html`.

---

## 1. Architecture Overview

The testing suite hosts **4 simultaneous models** split across two dedicated zones in the arena:

```
┌───────────────────────────────────────┬────────────────────────────────────────────────────────┐
│      TRACK 1: RAW ANIMATION STAGE     │             TRACK 2: IN-GAME COMBAT LOGIC DUEL         │
│  (Isolated bones, sockets & clips)    │   (Live game controllers, spatial movement & hitboxes) │
├───────────────────────────────────────┼────────────────────────────────────────────────────────┤
│                                       │                                                        │
│  [Model 1: Raw Player]                │  [Model 3: Logic Player]   ← 4.0m →  [Model 4: Boss]   │
│  Position: (0.6, 0, -1.2)             │  Home: (4.8, 0, -2.0)                Home: (4.8, 0, 2) │
│  Facing: South (+Z)                   │  Facing: +Z (Towards Boss)           Facing: -Z        │
│                                       │                                                        │
│  [Model 2: Raw Boss]                  │  • Dynamic floor trajectory ribbon   • Telegraph Glow  │
│  Position: (0.6, 0, 1.4)              │  • Start-position ghost ring         • Hurtbox & Range │
│  Facing: South (+Z)                   │  • Real displacement & physics       • Real Leap Arc   │
└───────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 2. Track 1: Raw Animation Inspector (Models 1 & 2)

- **Purpose:** Fast isolated testing of raw Mixamo/FBX animation clips, skeleton bone count validation, weapon socket alignment, and frame-by-frame scrubbing.
- **Root Motion:** Horizontally stripped (`hips` translation pinned in-place) to avoid drifting away from inspectable range.
- **Weapon Socket Tuning:**
  - Integrated `lil-gui` panel for Knight sword and Titan greatsword socket transforms (`posX`, `posY`, `posZ`, `rotX`, `rotY`, `rotZ`, `scale`).
  - Quick grip presets (`Knight 2H Grip`, `Titan 2H Grip`, `Flip Knight`, `Flip Titan`).
  - Single-click export of TypeScript socket configs for `src/combat/WeaponSocketConfig.ts`.

---

## 3. Track 2: In-Game Combat Logic Duel (Models 3 & 4)

- **Purpose:** Full in-engine verification of actual game actions, forward impulses, trajectory curves, hurtbox collisions, and i-frame evasion windows.
- **Actors:**
  - **Model 3:** Live instance of `PlayerCharacter` with active combat states (`startup`, `active`, `recovery`), weapon collision, and stamina/poise.
  - **Model 4:** Live instance of `BossCharacter` with phase transitions, telegraph glow, active weapon/foot colliders, and AI state machine.
- **Action Catalog with Spatial Displacement:**

| Actor | Action / Trigger | Timing (Startup / Active / Recovery) | Spatial Movement ($\Delta Z$) | Combat Mechanics |
| :--- | :--- | :--- | :--- | :--- |
| **Player** | **Slash 1** (`light1`) | 0.14s / 0.16s / 0.28s | $+1.2\text{m}$ forward impulse | Right-hand weapon sweep (Damage: F27-44) |
| **Player** | **Slash 2** (`light2`) | 0.12s / 0.16s / 0.30s | $+1.5\text{m}$ forward impulse | Chained combo swing (Damage: F27-44) |
| **Player** | **Finisher** (`light3`) | 0.18s / 0.20s / 0.42s | $+2.0\text{m}$ forward impulse | High damage finisher (Damage: F30-52) |
| **Player** | **Combo 1-2-3** (`combo`) | Continuous sequence | Cascading forward steps | Full 3-hit animation sequence |
| **Player** | **Heavy Thrust** (`heavy`) | 0.42s / 0.22s / 0.55s | $+3.2\text{m}$ forward lunge | Piercing thrust (Damage: F52-68) |
| **Player** | **Roll Fwd** (`dodge_fwd`) | 0.20s / 0.50s / 0.30s | $+2.35\text{m}$ continuous curve | Invulnerability window (I-Frames: F33-90) |
| **Player** | **Roll Back** (`dodge_back`) | 0.20s / 0.50s / 0.30s | $-2.35\text{m}$ backward curve | Evasive disengage (I-Frames: F33-90) |
| **Boss** | **Downward Cleave** (`downward`) | 0.95s / 0.22s / 1.25s | **Planted ($\le 0.05\text{m}$)** | Telegraph glow into overhead smash (Damage: F57-70) |
| **Boss** | **Relentless Flurry** (`combo`) | 0.70s / 0.40s / 1.05s | **Natural steps ($+0.45\text{m}$)** | Multi-hit wide horizontal sweep (Damage: F42-66) |
| **Boss** | **Leaping Wrath** (`jump`) | 1.05s / 0.30s / 1.35s | **Approach Run + $+7.0\text{m}$ Leap Arc** | Running forward (F15-57) $\to$ Airborne leap (F58-95) |
| **Boss** | **Ashen Maelstrom** (`spin360`) | 0.85s / 0.38s / 1.15s | **Planted ($0.0\text{m}$)** | Full $360^\circ$ perimeter strike (Damage: F51-74) |
| **Boss** | **Spartan Kick** (`kick`) | 0.45s / 0.18s / 0.75s | **Planted step ($+0.1\text{m}$)** | Left-foot impact (Damage: F32-48) |

- **Continuous Swept 3D Weapon Collision (`WeaponCollisionSystem.ts`):**
  - Uses 3D line segment to vertical capsule shortest distance computation instead of 2D floor cones.
  - Computes swept area between previous frame and current frame so ultra-fast swings never phase through targets.
  - Real-time weapon location export available via `window.__ASSET_TEST__.getWeaponLocations()`.
- **Yellow Hitbox Visualizer & Damage Window Timeline (`WeaponHitboxVisualizer.ts`):**
  - All debug wireframes, blade lines, and contact points are rendered in glowing **Yellow** (`#ffff00`).
  - Active damage frame timeline shows real-time progress through Windup, Damage Active (highlighted in yellow), and Recovery phases.
- **Settings Buttons:**
  - **Asset Page:** `⚙️ Settings` button in the header toggles weapon socket tuning and debug panels.
  - **Game Page (`/`):** `⚙️ Settings` button in the top-right 3D Registry HUD toggles Game Tuning and model controls.
- **Auto-Reset System:**
  - When an action finishes, the actor holds landing position for **1.0 second**, displaying final displacement summary (e.g., `Δ2.80m (Z:+2.80m)`).
  - The character smoothly glides back to its marked Home position over 0.4s and restores facing orientation.
  - Can be toggled on/off (`Auto-Reset: ON/OFF`), with manual instant reset button and hotkey (`KeyR`).
- **Dynamic Floor Trajectory & Ghost Markers:**
  - Gold ribbon traces Player root displacement; red ribbon traces Boss root displacement.
  - Starting position ghost ring remains on the floor at the origin of the action.

---

## 4. 3-Window Dedicated UI Architecture

The interface is structured into **3 independent, clean windows** accessible via the fixed Top Navigation Bar:

1. **Top Navigation Bar (`#top-navbar`):**
   - Brand title & real-time load status (`All 4 Models Loaded & Ready`).
   - Window toggle buttons: `[📺 1: Raw Animation]`, `[⚔️ 2: Player & Duel]`, `[🔧 3: Weapon Offsets]`.
   - Camera quick switcher: `[Raw Stage]`, `[Focus Player]`, `[Focus Boss]`, `[⚔️ Duel Arena]`, `[📐 Side View]`, `[Overview]`, `[Reset]`.
   - Settings button.

2. **Window 1: Raw Animation Inspector (`#win-raw-anim`, `#overlay`):**
   - Positioned on the left ($340\text{px}$ width).
   - Dedicated playback transport: Speed selection ($0.25\times, 0.5\times, 1.0\times, 1.5\times$), Frame Step ($-1$ / $+1$), and Pause/Play.
   - Real-time frame & kinematic phase telemetry readout (`Frame: F:34/85 [Impact]`).
   - Model switcher (Knight / Samurai) and full raw clip catalogs for Player and Boss.
   - Mid-frame snapshot validation button (`📸 Capture Mid-Frames`).

3. **Window 2: In-Game Combat & Player Controller (`#win-combat-duel`):**
   - Positioned in the center ($480\text{px}$ width).
   - Dedicated combat transport: Independent speed ($0.25\times, 0.5\times, 1.0\times$), Pause/Play, and Frame Step ($-1$ / $+1$) for duel simulations.
   - Action Player triggers with damage windows (`Slash 1 (F27-44)`, `Finisher (F30-52)`, `Heavy Thrust (F52-68)`, `Roll Fwd (I-Frames 33-90)`).
   - Action Boss triggers with damage windows (`Downward (Planted F57-70)`, `Flurry (F42-66)`, `Leaping Wrath (F96-103)`, `360 Maelstrom (F51-74)`, `Kick (F32-48)`).
   - Active Damage Frame Window progress bar with color-coded Windup, Active Damage (glowing yellow), and Recovery phases.
   - Combat Spacing, Reach warning, and real-time combat hit logs.
   - Follow Camera mode toggle (`🎮 3rd-Person Follow`), Yellow Hitbox wireframe toggle (`KeyH`), and instant position reset (`KeyR`).

4. **Window 3: Weapon Socket Offset Controller (`#win-weapon-offsets`):**
   - Positioned on the right ($350\text{px}$ width).
   - Interactive native range sliders with live numeric readouts:
     - Pos X, Pos Y (Palm), Pos Z.
     - Rot X°, Rot Y°, Rot Z°.
     - Scale.
   - Weapon switcher tabs: `[⚔️ Knight Sword]` vs `[👹 Titan Greatsword]`.
   - Quick grip presets (`Knight 2H Grip`, `Titan 2H Grip`, `Flip Knight`, `Flip Titan`, `Reset Defaults`).
   - One-click `💾 Save & Print Config` and `📋 Copy TypeScript` with embedded export code viewer.

---

## 5. Camera Modes & Third-Person Free Roam

Switch camera modes via top toolbar buttons or API:

1. **Inspector Orbit Modes:**
   - `[Track 1 Both]`: Frames raw inspector models.
   - `[Focus Player]`: Close-up on raw player.
   - `[Focus Boss]`: Close-up on raw boss.
   - `[⚔️ Duel Arena]`: Cinematic 3/4 diagonal view of the duel lane.
   - `[📐 Side View]`: True orthographic-style side profile view for inspecting weapon reach and jump apex heights.
   - `[Overview]`: High-angle arena view showing all 4 models simultaneously.
2. **🎮 3rd-Person Follow Mode (Game Mode):**
   - Automatically follows behind the `LogicPlayer` with `SoulslikeCamera`.
   - WASD moves player around the arena with real locomotion animations (walk, sprint, roll, attack).
   - Click screen to lock mouse look (ESC to release).
   - Press **Escape** or click the mode button to seamlessly return to Orbit Inspector.

---

## 6. Modular Code Architecture (`src/asset-test/`)

```
src/
├── asset-test.ts                          # Clean entry orchestrator (~280 lines)
└── asset-test/
    ├── types.ts                           # Type interfaces, DuelSpacing, CameraPreset, Window API
    ├── config.ts                          # Arena geometry, track positions, camera preset definitions
    ├── camera/
    │   └── AssetTestCameraManager.ts      # OrbitControls + SoulslikeCamera manager & view presets
    ├── track1/
    │   └── RawAnimationStage.ts           # Track 1: Isolated in-place clips, sockets, mid-frame capture
    ├── track2/
    │   ├── CombatDuelStage.ts             # Track 2: Logic Player & Boss, action triggers, auto-reset
    │   ├── DuelCombatResolver.ts          # Hit/hurtbox collision, i-frame dodge evasion & logging
    │   └── TrajectoryVisualizer.ts        # Floor trajectory lines & start-point ghost rings
    └── ui/
        ├── DomBindings.ts                 # Type-safe DOM query selectors for all 3 windows
        ├── RawInspectorUI.ts              # Window 1: Raw animation controls & frame stepper
        ├── CombatDuelUI.ts                # Window 2: Combat duel triggers, timeline & transport
        └── WeaponSocketGUI.ts             # Window 3: Native socket sliders & grip presets
```

---

## 7. Automated Testing & Verification

Comprehensive Playwright test suites verify all functionality:

- `tests/asset-test-dual-track.spec.ts`:
  - 4 models initialized and spacing verified ($4.0\text{m}$).
  - Player dodge roll displacement curve ($2.35\text{m}$) and auto-reset return.
  - Boss downward cleave lunge ($2.8\text{m}$) and combat hit registration.
  - 3rd-person playable roam camera toggle and pointer lock banner.
- `tests/asset-validation.spec.ts`: Armature bone counts, socket attachments, clip playback.
- `tests/debug-tools-sandbox.spec.ts`: Visual hitbox toggles, roll physics, frame scrubber.
- `tests/kinematic-combat.spec.ts`: Blueprint timings, crossfades, bone sockets, and kinematics.

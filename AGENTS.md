# Agent Instructions & Guidelines

This document provides essential instructions, architectural guidelines, and skill references for any AI agent working on this codebase.

---

## 1. Project Overview & Architecture

- **Stack:** Three.js (`^0.184.0`), TypeScript (strict mode), Vite (`^8.3.6`), Playwright (`^1.60.0`), Web Audio API, `three.quarks` (`^0.17.1`).
- **Design Philosophy:** Elden Ring / Dark Souls third-person boss encounter running locally in the browser at a locked 60 FPS.
- **Fixed Timestep Simulation:** 60Hz update loop in `src/core/Loop.ts` decoupling game logic from display framerate.
- **Root Motion Combat Kinematics:** Movements and attacks are driven by `src/combat/KinematicCombatController.ts`.

---

## 2. Specialized Domain Skills in `.opencode/skills/`

Specialized domain skills, design references, and scripts are maintained in the `.opencode/skills/` directory. When working on any relevant sub-domain, **read the corresponding skill and its references first**:

| Skill Directory | Focus Area | Key References to Read |
| :--- | :--- | :--- |
| [`.opencode/skills/threejs-gameplay-systems/`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-gameplay-systems/SKILL.md) | Combat mechanics, locomotion feel, state machines, encounters, hitstop | [`references/game-feel.md`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-gameplay-systems/references/game-feel.md), [`references/genre-design.md`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-gameplay-systems/references/genre-design.md) |
| [`.opencode/skills/threejs-aaa-graphics-builder/`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-aaa-graphics-builder/SKILL.md) | Lighting, materials, PBR shaders, particle systems, post-processing | [`references/shader-cookbook.md`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-aaa-graphics-builder/references/shader-cookbook.md) |
| [`.opencode/skills/threejs-game-ui-designer/`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-game-ui-designer/SKILL.md) | Dark-fantasy HUD, health bars, typography, responsive layout (0% emojis) | [`references/ui-patterns.md`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-game-ui-designer/references/ui-patterns.md) |
| [`.opencode/skills/threejs-debug-profiler/`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-debug-profiler/SKILL.md) | Performance profiling, 1% low FPS, draw calls, frame time tracking | Profiler and telemetry integration |
| [`.opencode/skills/threejs-3d-generator/`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-3d-generator/SKILL.md) | 3D models, glTF/GLB optimization, rig validation, animation retargeting | [`references/api-notes.md`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-3d-generator/references/api-notes.md), [`references/threejs-integration.md`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-3d-generator/references/threejs-integration.md) |
| [`.opencode/skills/threejs-audio-generator/`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-audio-generator/SKILL.md) | Web Audio sound synthesis, combat swooshes, impact audio, spatial sound | Web Audio architecture |
| [`.opencode/skills/threejs-qa-release/`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-qa-release/SKILL.md) | End-to-end testing, visual assertions, Playwright harness, diagnostics | [`references/visual-test-harness.md`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-qa-release/references/visual-test-harness.md) |
| [`.opencode/skills/threejs-game-director/`](file:///c:/Users/hp/projects/app/souls-browser/.opencode/skills/threejs-game-director/SKILL.md) | High-level encounter design, camera framing, pacing, player experience | Pacing & encounter design |

---

## 3. Core Combat & Gameplay Rules

1. **Healing Potion Decrement & Interruption:**
   - `healCharges` must **only** decrement when the heal actually happens (at ~55% progress in `PlayerLocomotion.updateDrinkingState`, alongside `player.heal(40)`).
   - Never decrement charges in `startDrink()`. If interrupted before 55% (via damage stagger or roll-cancel), the charge naturally remains intact without complex increment/refund logic.
   - Dodge roll is permitted during drinking (`PlayerDodgeHandler.startDodge` triggers `player.interruptDrink()`), allowing roll-cancels.

2. **Boss Configuration:**
   - All boss speeds, turning rates, and forward impulses are centralized in `BOSS_CONFIG` at the top of [`src/entities/boss/BossAI.ts`](file:///c:/Users/hp/projects/app/souls-browser/src/entities/boss/BossAI.ts).
   - Never hardcode movement velocities or turn rates inside switch branches.

3. **Hand Socket Transforms:**
   - Default sockets for weapon and healing flask are configured in [`src/combat/WeaponSocketConfig.ts`](file:///c:/Users/hp/projects/app/souls-browser/src/combat/WeaponSocketConfig.ts).
   - Visual tuning can be inspected and exported via Window 3 in [`asset-test.html`](file:///c:/Users/hp/projects/app/souls-browser/asset-test.html).

4. **Verification & Quality Gate:**
   - Always run `npm run build` (`tsc && vite build`) to ensure 0 TypeScript and bundling errors.
   - Run relevant Playwright test suites before marking tasks complete:
     - `npx playwright test tests/upper-lower-animation-layering.spec.ts --project=desktop-chrome`
     - `npx playwright test tests/combat.spec.ts --project=desktop-chrome`
     - `npx playwright test tests/boss-ai-strafe.spec.ts --project=desktop-chrome`
     - `npx playwright test tests/asset-test-dual-track.spec.ts --project=desktop-chrome`

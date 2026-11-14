# Session Context: Soulslike VFX Invisibility Fix & Visual Regression Coverage

**Date:** 2026-11-15
**Project:** `C:\Users\hp\projects\app\souls-browser`
**Stack:** Three.js `^0.184.0`, `three.quarks` `^0.17.1` (`quarks.core`), TypeScript strict, Vite 8 (`vite 8.3.6`), Playwright `^1.60.0`
**Purpose of this file:** Hand the current working state to a fresh session without re-deriving the root cause analysis.

---

## 1. Original Problem

All `three.quarks` Souls-like VFX (blood spray, ground slam dust/debris/shockwave, hit sparks) were **invisible in-game**, even though unit tests, texture files, and engine code all appeared correct. No errors in console. Systems existed, textures loaded, particles "emitted" — nothing rendered.

---

## 2. Root Causes (all verified experimentally against `node_modules/three.quarks/src`)

### 2.1 Emitters were never added to the scene graph
`ParticleSystem.update()` (approx. lines 970–979 of `node_modules/three.quarks/src/ParticleSystem.ts`) walks the emitter's parent chain. If the root is not a `THREE.Scene`, it **silently calls `this.dispose()`**, which runs `_renderer.deleteSystem()` — removing the system on the very first update.

**Fix:** every `ParticleSystem` emitter must be added to the scene (or a container that is itself in the scene) at construction time.

### 2.2 `worldSpace: true` + stale `matrixWorld`
With `worldSpace: true`, particles are spawned using `emitter.matrixWorld`. Code that moved `emitter.position` without calling `emitter.updateMatrixWorld(true)` caused particles to spawn at the stale prewarm position `(0, -9999, 0)` — permanently off-screen.

**Fix:** call `emitter.updateMatrixWorld(true)` immediately after repositioning/rotating/restarting an emitter, before the system is updated.

### 2.3 HorizontalBillBoard planes were single-sided
`RenderMode.HorizontalBillBoard` ground splats/shockwaves use horizontal planes. Without `side: THREE.DoubleSide`, they are invisible from above.

**Fix:** `side: THREE.DoubleSide` on all horizontal billboard materials.

### 2.4 Async texture race / GL errors
`TextureLoader.load()` returns a texture whose `image` is still `null` at material-build time. Earlier workaround swapped a small canvas into a 512×512 PNG, which produced `GL_INVALID_VALUE ... glTexSubImage2DRobustANGLE: Offset overflows texture dimensions`.

**Fix:** `VFXTextureFactory` uses `TextureLoader` in the browser and procedural canvas / `DataTexture` fallbacks under Node/SSR; textures are created with real dimensions and cached in a singleton.

### 2.5 Legacy `THREE.Points` sparks replaced
The old spark implementation was a plain `THREE.Points` object; it has been replaced by `SparkBurstVFX` using `three.quarks` (needle sparks + embers) for consistent batching and behavior.

---

## 3. Files Changed / Added

### Modified
| File | Change |
|---|---|
| `src/vfx/BloodBurstVFX.ts` | 3-layer system: `StretchedBillBoard` droplets (gravity + drag), `BillBoard` mist, `HorizontalBillBoard` ground splat. Constructor now takes `(batchRenderer, sceneOrContainer?)`. Emitters added to container. `updateMatrixWorld(true)` before `restart()`. Splat material `DoubleSide`. Added `reset()` / `dispose()`. `emit()` now accepts `THREE.Vector3 | {x,y,z,y}` plain objects. Blood palette/burst numbers tuned (see §4). |
| `src/vfx/GroundSlamVFX.ts` | Billowing donut dust, `RenderMode.Mesh` dodecahedron debris with `ApplyCollision` floor resolver + `RotationOverLife`, `HorizontalBillBoard` shockwave. Emitters added to scene. `updateMatrixWorld(true)` on trigger. Shockwave material `DoubleSide` and switched to `AdditiveBlending` with brighter warm palette. `reset()` restarts pools; `dispose()` removes emitters. `triggerGroundSlam()` accepts plain `{x,y,z}`. |
| `src/vfx/SparkBurstVFX.ts` | New. `StretchedBillBoard` needle sparks + `BillBoard` embers, warm additive palette, `(batchRenderer, sceneOrContainer?)`, scene attachment, `updateMatrixWorld(true)`, `reset()` / `dispose()`, plain-object `emit()`. |
| `src/systems/VFXSystem.ts` | `batchRenderer.frustumCulled = false`. Passes `scene` into Blood/Spark systems. Foot-dust emitters added to scene. `reset()` restarts blood/spark/slam/foot-dust pools. `dispose()` removes foot-dust emitters. `prewarm()` emits off-screen dummies at `(0, -9999, 0)` then calls `reset()` in `finally`. |
| `src/game/Game.ts` | Test hooks added to `__THREE_GAME_TEST_HOOKS__`: `triggerGroundSlam`, `triggerBloodBurst`, `triggerHitSparks` (new), `triggerSlashArc`, `getVfxSystem` (new). All accept plain `{x,y,z}` or `THREE.Vector3`. |
| `src/vite-env.d.ts` | `ThreeGameTestHooks` extended with `triggerHitSparks?(pos?, dir?)`, `getVfxSystem?()`, plus existing hook typings. |
| `tests/vfx-combat.spec.ts` | Constructors updated to pass `scene`. Added spark / texture / asset-presence / VFXSystem-orchestration tests. **9/9 pass** on `desktop-chrome` (also passed `mobile-chrome` earlier). |
| `playwright.config.ts` | `webServer.command` set to `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5188`. |
| `vite.config.ts` | Dev server host `127.0.0.1`, port `5188`, `strictPort: true`; added `watch.ignored` for `dist`, `artifacts`, `test-results` (prevents Vite from reloading/hot-looping during test artifact writes). |

### New
| File | Purpose |
|---|---|
| `src/vfx/VFXTextureFactory.ts` | Singleton texture cache. Browser: `new THREE.TextureLoader().load(url)`. Node/SSR: canvas / `DataTexture` procedural fallbacks. `dispose()`. |
| `tests/vfx-visual-capture.spec.ts` | Visual regression + animation capture. Navigates `/`, waits for diagnostics `frame > 15`, triggers blood → sparks → slam via test hooks at deterministic points, captures 5 PNGs, asserts pixel-diff thresholds and file size. |
| `scripts/download-vfx-textures.mjs` | Downloads 5 CC0 textures from the Kenney particle pack mirror into `public/textures/vfx/`, with procedural fallback generation. |
| `public/textures/vfx/*.png` | `smoke_soft.png`, `droplet_streak.png`, `blood_splat.png`, `spark_streak.png`, `shockwave_ring.png` (CC0). |

---

## 4. Latest Visual Tuning (applied, not yet re-verified visually)

Motivation: screenshots showed effects functionally rendering but weak against the dark arena, and effects sometimes spawned behind/inside the player model.

- **BloodBurstVFX:** droplets brightened (start color `0.68,0.04,0.04`, alpha `0.98`), count `35–55`, start size `0.14–0.28`, speed `9–16`, `speedFactor 0.22`. Mist brightened to `0.50,0.05,0.05` alpha `0.65`, 12–18 particles, size `0.40–0.80`, growth to `3.2x`. Ground splat darkened to a deeper red `0.35,0.02,0.02`, size `0.7–1.3`, alpha `0.90`.
- **GroundSlamVFX:** shockwave now `AdditiveBlending`, color `0.95,0.85,0.70` → `0.55,0.42,0.28`, size growth to `7.2x`.
- **SparkBurstVFX:** sparks white-hot → amber → burnt orange, 30–48 particles, size `0.10–0.22`, speed `10–20`, `speedFactor 0.20`. Embers start color `1.0,0.55,0.10` alpha `0.95`, radius `0.15`.
- **Type signatures widened** on `BloodBurstVFX.emit()`, `SparkBurstVFX.emit()`, `GroundSlamVFX.triggerGroundSlam()` to `THREE.Vector3 | {x,y,z}` so the `instanceof` fallback branches type-check (previously `TS2339 ... on type 'never'`).
- **Test hook positions moved in front of camera:** in `tests/vfx-visual-capture.spec.ts`, blood at `p + (0.3, 1.2, -2.0)` with direction `(-0.7, 0.6, -0.4)`; sparks at `p + (-0.3, 1.2, -2.0)` dir `(0.8, 0.7, -0.3)`; slam at `p + (0, 0.05, -2.4)`. Timings changed to +80ms blood peak, +240ms splat, +450ms gaps.

---

## 5. Verification Status

| Check | Result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | **Clean** (0 errors). |
| `node node_modules/vite/bin/vite.js build` | **Succeeds** — 83 modules; main `394.73 kB` (gzip 104.20 kB), camera chunk `673.02 kB`. |
| `tests/vfx-visual-capture.spec.ts --project=desktop-chrome` | **1 passed (9.2 s)**. Captures + pixel-diff assertions pass. |
| `tests/vfx-combat.spec.ts --project=desktop-chrome` | **9/9 passed (1.0 s)**. |
| `tests/vfx-combat.spec.ts --project=mobile-chrome` | **9/9 passed (0.8 s)**. |
| `tests/combat.spec.ts --project=desktop-chrome` | **3/3 passed (14.6 s)**. |
| Screenshot review (`artifacts/vfx-validation/`) | Blood plume clearly visible over the boss; slam dust, debris pebbles, and warm shockwave ring visible; amber sparks/embers visible. |

### Artifact files (regenerated 2026-11-15 22:56)
| File | Size |
|---|---|
| `artifacts/vfx-validation/vfx-blood-peak.png` | 331,399 B |
| `artifacts/vfx-validation/vfx-blood-splat.png` | 338,645 B |
| `artifacts/vfx-validation/vfx-slam-impact.png` | 407,121 B |
| `artifacts/vfx-validation/vfx-slam-billow.png` | 356,986 B |
| `artifacts/vfx-validation/vfx-sparks-clash.png` | 324,529 B |

---

## 6. Environment Quirks (important for next session)

- **`npm` is NOT on this shell's PATH.** Node lives at `C:\nvm4w\nodejs\node.exe`. Invoke tooling directly:
  - Typecheck: `node node_modules/typescript/bin/tsc --noEmit`
  - Build: `node node_modules/vite/bin/vite.js build`
  - Playwright: `node node_modules/@playwright/test/cli.js test <spec> --project=desktop-chrome --reporter=list`
- Use the bash tool's `timeout` parameter (e.g. 60000–120000 ms) — test/build runs exceed the default.
- A Vite dev server must be listening on `127.0.0.1:5188` (strictPort) or Playwright's `webServer` spawns one. If a stale server holds the port, find it with `(Get-NetTCPConnection -LocalPort 5188).OwningProcess`, then `Stop-Process -Id <pid> -Force`, and relaunch with `Start-Process -FilePath "C:\nvm4w\nodejs\node.exe" -ArgumentList "node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5188" -WindowStyle Hidden`.
- `node_modules/three.quarks` is plain source (not built): repro scripts can import from `node_modules/three.quarks/src` directly.
- Historical `"Failed to fetch"` noise came from three.js module/fetch paths in headless runs; the visual and combat suites still pass. Not proven to affect texture loading.

---

## 7. Known Issues / Open Items (Resolved Status)

1. **Full verification completed:** `tsc`, `vite build`, `tests/vfx-combat.spec.ts` (desktop + mobile), and `tests/vfx-visual-capture.spec.ts` all pass cleanly.
2. **`tests/combat.spec.ts --project=desktop-chrome`:** Confirmed passing (3/3 passed in 14.6s) with running Vite dev server.
3. **`getActiveCounts` particle tracking:** Implemented in `VFXSystem.getActiveCounts()` by iterating over `batchRenderer.systemToBatchIndex.keys()` and summing `(system as any).particleNum`. Tested in `tests/vfx-combat.spec.ts`.
4. **Prewarm behavior:** `VFXSystem.prewarm()` emits at `(0, -9999, 0)` then resets in `finally { this.reset(); }`.
5. **`vite.config.ts` watch ignores:** Successfully prevents reload loops during screenshot and artifact generation.

---

## 8. Key Code References

- `src/vfx/VFXTextureFactory.ts` — texture provider (browser vs Node).
- `src/vfx/BloodBurstVFX.ts` — 3-layer blood; scene attachment + `matrixWorld` fixes; ~`emit()` at line 224.
- `src/vfx/GroundSlamVFX.ts` — dust/debris/shockwave/decal; `triggerGroundSlam()` ~line 338.
- `src/vfx/SparkBurstVFX.ts` — sparks/embers; `emit()` ~line 171.
- `src/systems/VFXSystem.ts` — orchestration, pooling, `prewarm`/`reset`/`dispose`, `frustumCulled = false`.
- `src/game/Game.ts` — gameplay triggers and `__THREE_GAME_TEST_HOOKS__`.
- `src/vite-env.d.ts` — test-hook typings.
- `tests/vfx-combat.spec.ts` — unit/integration coverage.
- `tests/vfx-visual-capture.spec.ts` — visual capture + pixel-diff regression.
- `node_modules/three.quarks/src/ParticleSystem.ts` — dispose-if-not-in-Scene (~970–979), `worldSpace` matrix use (~897–909), update loop (~942–960).
- `artifacts/vfx-validation/` — captured screenshots.

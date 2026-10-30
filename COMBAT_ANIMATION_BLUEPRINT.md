# Combat Animation — Technical Implementation Blueprint

> Lead Combat Programmer reference document.  
> Source: `kinematic_summary.json` — 14 animations, all `mixamorig` hierarchy, 60 fps.  
> Every frame reference below is 0-indexed in code (`animationAction.time = frame / 60`).

---

## Global Conventions

### Root Motion Suppression (In-Place animations)
All In-Place clips must have their root bone position tracks zeroed.  
Apply this once after every `FBXLoader` load:

```ts
function stripRootTranslation(clip: THREE.AnimationClip): THREE.AnimationClip {
  clip.tracks = clip.tracks.filter(
    (t) => !(t.name.includes('mixamorigHips') && t.name.endsWith('.position'))
  );
  return clip;
}
```

### Root-Motion animation (`Standing Melee Run Jump Attack`)
This clip has `delta_y_meters: -5.9` — the hips travel forward along the local -Y axis.  
Extract displacement from the hips position track each frame and apply to the character capsule; then zero the track with `stripRootTranslation` so Three.js doesn't double-move the skeleton.

### Frame → Time Conversion
```ts
const toTime = (frame: number, fps = 60) => frame / fps;
```

### AnimationMixer Setup (shared)
```ts
const mixer = new THREE.AnimationMixer(characterModel);
mixer.timeScale = 1;

// In your game loop:
mixer.update(deltaSeconds);
```

### Crossfade helper
```ts
function crossfade(
  from: THREE.AnimationAction,
  to: THREE.AnimationAction,
  duration: number
) {
  to.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
  from.crossFadeTo(to, duration, true);
  to.play();
}
```

### Hitbox structure (shared)
```ts
interface WeaponHitbox {
  mesh: THREE.Mesh;          // Box3 updated from this each frame
  bone: THREE.Bone;          // mixamorigRightHand or LeftFoot
  isAttacking: boolean;
}

function updateHitbox(hb: WeaponHitbox) {
  if (!hb.isAttacking) return;
  hb.mesh.getWorldPosition(worldPos);   // bone drives mesh via skeleton
  box3.setFromObject(hb.mesh);
  // test box3 against enemy hitvolumes
}
```

### Audio hook (shared — Web Audio API placeholder)
```ts
const audioCtx = new AudioContext();

function playSwoosh(frequency = 300, duration = 0.15) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + duration);
  gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + duration);
}

function playThud(duration = 0.2) {
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++)
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
  const src = audioCtx.createBufferSource();
  src.buffer = buf; src.connect(audioCtx.destination); src.start();
}
```

### Three-Nebula VFX helpers
```ts
import { System, Emitter, Rate, Span, Vector3D } from 'three-nebula';

function spawnDustKickup(position: THREE.Vector3, count = 12) { /* burst emitter at position */ }
function spawnWeaponTrail(bone: THREE.Bone, duration = 0.1)   { /* line emitter parented to bone */ }
function spawnImpactSparks(position: THREE.Vector3, count = 20){ /* radial burst */ }
```

---

## Animation Blueprints

---

### 1. Great Sword Kick
**File:** `Great Sword Kick.fbx`  
**Frames:** 105 | **FPS:** 60 | **Root Motion:** In-Place  

#### Phase Timeline
| Phase    | Frames  | Duration (s) |
|----------|---------|-------------|
| Windup   | 1–31    | 0.517       |
| Impact   | 32–48   | 0.267       |
| Recovery | 49–105  | 0.950       |

#### 1. Animation Controller & Blending
```ts
// Load and strip root translation
const kickClip = stripRootTranslation(kickRawClip);
const kickAction = mixer.clipAction(kickClip);
kickAction.setLoop(THREE.LoopOnce, 1);
kickAction.clampWhenFinished = true;

// Crossfade INTO this action (e.g. from Idle):
// Blend window: start at Idle's Recovery onset (~frame 62 of Idle)
// Target: this action's Windup start → 0.15 s feels snappy for a kick
crossfade(idleAction, kickAction, 0.15);

// Crossfade OUT of this action:
// Recovery starts at frame 49 (t=0.817 s). Allow cancel after frame 56 (t=0.933 s).
// Blend into Idle or next attack over 0.20 s.
mixer.addEventListener('loop', (e) => {
  if (e.action === kickAction) crossfade(kickAction, idleAction, 0.20);
});
```
**Crossfade out duration: `0.20 s`** — matches the gentle "stabilizes" recovery.

#### 2. Weapon Hitbox Logic
Peak velocity bone is **LeftFoot** — this is a kick, not a weapon strike.  
Attach a foot-volume hitbox to `mixamorigLeftFoot`.

```ts
const footHitbox: WeaponHitbox = { mesh: footVolumeMesh, bone: leftFootBone, isAttacking: false };

// Frame-accurate toggle via mixer time check in update():
function updateKickHitbox(mixerTime: number) {
  const t = kickAction.time;
  const ACTIVE_START = toTime(32); // frame 32
  const ACTIVE_END   = toTime(48); // frame 48
  footHitbox.isAttacking = kickAction.isRunning() && t >= ACTIVE_START && t <= ACTIVE_END;
  updateHitbox(footHitbox);
}
```

#### 3. VFX Triggers (Three-Nebula)
- **No Airborne phase** — no landing dust required.  
- **Impact sparks at peak velocity frame 42** (kick connects):

```ts
// In update():
if (kickAction.isRunning()) {
  const t = kickAction.time;
  if (!kickSparksSpawned && t >= toTime(42) && t < toTime(43)) {
    kickSparksSpawned = true;
    const pos = new THREE.Vector3();
    leftFootBone.getWorldPosition(pos);
    spawnImpactSparks(pos, 15); // foot impact sparks / dust burst
  }
  if (t < toTime(42)) kickSparksSpawned = false; // reset on replay
}
```

#### 4. Audio Hooks
```ts
// Swoosh during Windup → peak: frame ~38 (leading into impact)
// Thud on Impact frame 42 (peak_velocity_frame, abrupt stop)
scheduledFrameCallback(kickAction, 38, () => playSwoosh(200, 0.10)); // low-freq leg swoosh
scheduledFrameCallback(kickAction, 42, () => playThud(0.18));        // boot connects
```

---

### 2. Standing Melee Attack 360 Low Heavy
**File:** `Standing Melee Attack 360 Low heavy attack.fbx`  
**Frames:** 150 | **FPS:** 60 | **Root Motion:** In-Place  

#### Phase Timeline
| Phase    | Frames  | Duration (s) |
|----------|---------|-------------|
| Windup   | 1–43    | 0.717       |
| Impact   | 44–66   | 0.367       |
| Recovery | 67–150  | 1.400       |

#### 1. Animation Controller & Blending
```ts
const heavy360Clip = stripRootTranslation(heavy360RawClip);
const heavy360Action = mixer.clipAction(heavy360Clip);
heavy360Action.setLoop(THREE.LoopOnce, 1);
heavy360Action.clampWhenFinished = true;

// Crossfade in from Idle or Light Attack Recovery:
// The long Windup (0.717 s) absorbs a slower blend.
crossfade(prevAction, heavy360Action, 0.25);

// Crossfade out: Recovery starts frame 67 (t=1.117 s).
// Allow cancel at frame 80 (t=1.333 s) → blend to Idle over 0.30 s.
// Longer fade matches "returning to neutral stance" after a full spin.
crossfade(heavy360Action, idleAction, 0.30);
```
**Crossfade out duration: `0.30 s`**

#### 2. Weapon Hitbox Logic
Peak bone: **RightHand**. Attach hitbox to `mixamorigRightHand`.

```ts
const weaponHitbox: WeaponHitbox = { mesh: swordVolumeMesh, bone: rightHandBone, isAttacking: false };

function updateHeavy360Hitbox() {
  const t = heavy360Action.time;
  weaponHitbox.isAttacking = heavy360Action.isRunning()
    && t >= toTime(44) && t <= toTime(66);
  updateHitbox(weaponHitbox);
}
```

#### 3. VFX Triggers
- **Weapon trail:** activate from frame 44 through 66 (full arc of the 360 sweep).  
- **Impact sparks at frame 56** (peak velocity, 8.2 m/s):

```ts
if (!heavy360SparksSpawned && t >= toTime(56) && t < toTime(57)) {
  heavy360SparksSpawned = true;
  const pos = new THREE.Vector3();
  rightHandBone.getWorldPosition(pos);
  spawnImpactSparks(pos, 20);
  spawnWeaponTrail(rightHandBone, 0.25); // long trail for wide swing
}
```

#### 4. Audio Hooks
```ts
scheduledFrameCallback(heavy360Action, 40, () => playSwoosh(350, 0.20)); // pre-impact whoosh
scheduledFrameCallback(heavy360Action, 56, () => playThud(0.25));        // heavy blade connect
```

---

### 3. Standing Melee Attack Downward
**File:** `Standing Melee Attack Downward.fbx`  
**Frames:** 137 | **FPS:** 60 | **Root Motion:** In-Place  

#### Phase Timeline
| Phase    | Frames  | Duration (s) |
|----------|---------|-------------|
| Windup   | 1–38    | 0.633       |
| Impact   | 39–57   | 0.300       |
| Recovery | 58–137  | 1.333       |

#### 1. Animation Controller & Blending
```ts
const downwardClip = stripRootTranslation(downwardRawClip);
const downwardAction = mixer.clipAction(downwardClip);
downwardAction.setLoop(THREE.LoopOnce, 1);
downwardAction.clampWhenFinished = true;

// Blend in smoothly — overhead raise allows 0.20 s
crossfade(prevAction, downwardAction, 0.20);

// Out: Recovery at frame 58. Cancel window opens ~frame 70.
// Blend to Idle over 0.25 s (natural deceleration after overhead slam).
crossfade(downwardAction, idleAction, 0.25);
```
**Crossfade out duration: `0.25 s`**

#### 2. Weapon Hitbox Logic
Peak bone: **RightHand**.

```ts
function updateDownwardHitbox() {
  const t = downwardAction.time;
  weaponHitbox.isAttacking = downwardAction.isRunning()
    && t >= toTime(39) && t <= toTime(57);
  updateHitbox(weaponHitbox);
}
```

#### 3. VFX Triggers
- **Weapon trail:** frame 39–57 (downward arc).  
- **Impact sparks at frame 51** (peak velocity, 9.3 m/s — second highest ground attack):
- **Ground dust at frame 51** (blade hits the ground plane):

```ts
if (!downwardSparksSpawned && t >= toTime(51) && t < toTime(52)) {
  downwardSparksSpawned = true;
  const pos = new THREE.Vector3();
  rightHandBone.getWorldPosition(pos);
  pos.y = 0; // clamp to ground
  spawnImpactSparks(pos, 25); // blade-on-ground sparks
  spawnDustKickup(pos, 18);   // ground dust eruption
}
```

#### 4. Audio Hooks
```ts
scheduledFrameCallback(downwardAction, 35, () => playSwoosh(500, 0.18)); // high-pitched descending swoosh
scheduledFrameCallback(downwardAction, 51, () => playThud(0.30));        // heavy ground slam
```

---

### 4. Standing Melee Combo Attack Ver. 2
**File:** `Standing Melee Combo Attack Ver. 2.fbx`  
**Frames:** 253 | **FPS:** 60 | **Root Motion:** In-Place  

> **Note:** The Windup phase spans frames 1–147 (2.45 s). This is a full multi-hit combo; the "Windup" label covers all pre-final-swing activity including intermediate hits. The Impact window (frames 148–164) is the **final decisive strike**.

#### Phase Timeline
| Phase    | Frames   | Duration (s) |
|----------|----------|-------------|
| Windup   | 1–147    | 2.450       |
| Impact   | 148–164  | 0.267       |
| Recovery | 165–253  | 1.467       |

#### 1. Animation Controller & Blending
```ts
const comboClip = stripRootTranslation(comboRawClip);
const comboAction = mixer.clipAction(comboClip);
comboAction.setLoop(THREE.LoopOnce, 1);
comboAction.clampWhenFinished = true;

// Blend in with 0.15 s — player expects fast response on combo input
crossfade(prevAction, comboAction, 0.15);

// This is a committed animation. Cancel window: frame 200+ only.
// Blend out over 0.35 s — long recovery, needs gentle fade to Idle.
crossfade(comboAction, idleAction, 0.35);
```
**Crossfade out duration: `0.35 s`** — longest recovery of all ground attacks.

#### 2. Weapon Hitbox Logic
Peak bone: **RightHand** | Peak velocity: **13.4 m/s** (highest ground melee).

```ts
// The combo has intermediate strikes inside the Windup window.
// For intermediate hits, add sub-windows manually after reviewing the clip.
// Final definitive Impact window:
function updateComboHitbox() {
  const t = comboAction.time;
  // Final strike only (from kinematic data)
  const finalStrikeActive = t >= toTime(148) && t <= toTime(164);
  weaponHitbox.isAttacking = comboAction.isRunning() && finalStrikeActive;
  updateHitbox(weaponHitbox);
}
```

#### 3. VFX Triggers
- **Weapon trail:** activate frame 148–164.  
- **Impact sparks at frame 157** (peak velocity, highest ground attack at 13.4 m/s):

```ts
if (!comboSparksSpawned && t >= toTime(157) && t < toTime(158)) {
  comboSparksSpawned = true;
  const pos = new THREE.Vector3();
  rightHandBone.getWorldPosition(pos);
  spawnImpactSparks(pos, 35);   // largest burst — climax hit
  spawnWeaponTrail(rightHandBone, 0.15);
}
```

#### 4. Audio Hooks
```ts
// Intermediate whooshes inside the Windup — schedule at representative sub-hits
// Adjust once clip timing is inspected visually:
scheduledFrameCallback(comboAction, 50,  () => playSwoosh(300, 0.12)); // hit 1
scheduledFrameCallback(comboAction, 100, () => playSwoosh(320, 0.12)); // hit 2
scheduledFrameCallback(comboAction, 145, () => playSwoosh(500, 0.20)); // pre-climax whoosh
scheduledFrameCallback(comboAction, 157, () => playThud(0.30));        // climax slam
```

---

### 5. Standing Melee Run Jump Attack
**File:** `Standing Melee Run Jump Attack.fbx`  
**Frames:** 221 | **FPS:** 60 | **Root Motion:** ACTIVE (`delta_y: -5.9 m`)  

> **Critical:** This is the only attack with real root motion. Requires custom displacement extraction.

#### Phase Timeline
| Phase    | Frames   | Duration (s) |
|----------|----------|-------------|
| Windup   | 1–57     | 0.950       |
| Airborne | 58–95    | 0.633       |
| Impact   | 96–103   | 0.133       |
| Recovery | 104–221  | 1.950       |

#### 1. Animation Controller & Blending
```ts
// Root motion extraction — runs before stripRootTranslation
function extractRootMotion(clip: THREE.AnimationClip, model: THREE.Object3D) {
  // On each mixer.update(), sample hips position delta and push to character capsule velocity
  // Implementation: store prevHipsWorldY each frame, diff = currentY - prevY → capsule.position.z += diff
}

const jumpAtkClip = stripRootTranslation(jumpAtkRawClip); // zero track AFTER extracting
const jumpAtkAction = mixer.clipAction(jumpAtkClip);
jumpAtkAction.setLoop(THREE.LoopOnce, 1);
jumpAtkAction.clampWhenFinished = true;

// No cancel during Airborne or Impact. Allow cancel at frame 120 (Recovery).
crossfade(prevAction, jumpAtkAction, 0.10); // very fast blend in — committed leap

// Crossfade out: Recovery at frame 104. Safe cancel at ~120. Blend to Idle: 0.40 s.
crossfade(jumpAtkAction, idleAction, 0.40); // long blend — character lands and steadies
```
**Crossfade out duration: `0.40 s`**

#### 2. Weapon Hitbox Logic
Peak bone: **RightHand** | Peak velocity: **23.5 m/s** — highest in entire set.  
Narrow Impact window (frames 96–103, only 8 frames = 0.133 s). Hitbox must be **precisely gated**.

```ts
function updateJumpAtkHitbox() {
  const t = jumpAtkAction.time;
  weaponHitbox.isAttacking = jumpAtkAction.isRunning()
    && t >= toTime(96) && t <= toTime(103);
  updateHitbox(weaponHitbox);
}
```

#### 3. VFX Triggers
- **Landing dust at Airborne→Impact transition (frame 96):** feet hit ground.  
- **Impact sparks at frame 99** (peak velocity, 23.5 m/s — extreme burst):

```ts
// Landing dust — fired once at Airborne→Impact boundary
if (!jumpLandingDustSpawned && t >= toTime(96) && t < toTime(97)) {
  jumpLandingDustSpawned = true;
  const leftFootPos  = new THREE.Vector3();
  const rightFootPos = new THREE.Vector3();
  leftFootBone.getWorldPosition(leftFootPos);   leftFootPos.y = 0;
  rightFootBone.getWorldPosition(rightFootPos); rightFootPos.y = 0;
  spawnDustKickup(leftFootPos, 20);
  spawnDustKickup(rightFootPos, 20);
}

// Weapon impact sparks at peak velocity
if (!jumpImpactSparksSpawned && t >= toTime(99) && t < toTime(100)) {
  jumpImpactSparksSpawned = true;
  const pos = new THREE.Vector3();
  rightHandBone.getWorldPosition(pos);
  spawnImpactSparks(pos, 45); // massive burst — highest velocity in entire moveset
  spawnWeaponTrail(rightHandBone, 0.08);
}
```

#### 4. Audio Hooks
```ts
scheduledFrameCallback(jumpAtkAction, 55,  () => playSwoosh(250, 0.30)); // leap into air
scheduledFrameCallback(jumpAtkAction, 96,  () => playThud(0.20));        // boots land
scheduledFrameCallback(jumpAtkAction, 99,  () => playThud(0.40));        // blade buries — deep slam
// Peak velocity 23.5 m/s warrants a layered sound:
scheduledFrameCallback(jumpAtkAction, 99,  () => playSwoosh(700, 0.08)); // sharp crack on top
```

---

### 6. Great Sword Impact
**File:** `Great Sword Impact.fbx`  
**Frames:** 76 | **FPS:** 60 | **Root Motion:** In-Place  

> This is a **hit-reaction / stagger** animation, not an attack. No Windup — begins directly in Impact. Used on the character when it receives a heavy blow.

#### Phase Timeline
| Phase    | Frames  | Duration (s) |
|----------|---------|-------------|
| Impact   | 1–16    | 0.267       |
| Recovery | 17–76   | 1.000       |

#### 1. Animation Controller & Blending
```ts
const hitReactClip = stripRootTranslation(hitReactRawClip);
const hitReactAction = mixer.clipAction(hitReactClip);
hitReactAction.setLoop(THREE.LoopOnce, 1);
hitReactAction.clampWhenFinished = true;

// Triggered immediately on receiving a hit — interrupt any current action instantly.
// Very short fade (0.05 s) to snap into the stagger for game-feel responsiveness.
crossfade(currentAction, hitReactAction, 0.05);

// Recovery at frame 17 (t=0.283 s). Return to Idle after full play.
crossfade(hitReactAction, idleAction, 0.20);
```
**Crossfade out duration: `0.20 s`**

#### 2. Weapon Hitbox Logic
This is a **receive-hit** animation. Disable all attack hitboxes immediately on trigger:

```ts
// On hitReactAction start:
weaponHitbox.isAttacking = false;
footHitbox.isAttacking   = false;
// No hitbox activation during this animation.
```

#### 3. VFX Triggers
- **Impact flash / shockwave at frame 12** (peak velocity of the recoil, 3.6 m/s):

```ts
if (!hitReactVFXSpawned && t >= toTime(12) && t < toTime(13)) {
  hitReactVFXSpawned = true;
  const pos = new THREE.Vector3();
  rightHandBone.getWorldPosition(pos); // hit point approximation
  spawnImpactSparks(pos, 8); // small sparks — this is receiving damage
  // Trigger camera screenshake from game-feel system here
}
```

#### 4. Audio Hooks
```ts
scheduledFrameCallback(hitReactAction, 1,  () => playThud(0.15));        // impact frame 1 — body hit sound
scheduledFrameCallback(hitReactAction, 12, () => playSwoosh(100, 0.05)); // recoil grunt approximation
```

---

### 7. Stand To Roll
**File:** `Stand To Roll.fbx`  
**Frames:** 143 | **FPS:** 60 | **Root Motion:** In-Place  

> Dodge/evasion roll. Has an Airborne phase (body goes low to the ground, hips_max_z = -0.8 m, indicating a full floor roll — character is prone). Game must apply capsule displacement independently (invincibility frames during Airborne).

#### Phase Timeline
| Phase    | Frames   | Duration (s) |
|----------|----------|-------------|
| Windup   | 1–38     | 0.633       |
| Airborne | 39–105   | 1.117       |
| Recovery | 106–143  | 0.617       |

#### 1. Animation Controller & Blending
```ts
const rollClip = stripRootTranslation(rollRawClip);
const rollAction = mixer.clipAction(rollClip);
rollAction.setLoop(THREE.LoopOnce, 1);
rollAction.clampWhenFinished = true;

// Fast response — dodge must feel instant.
crossfade(prevAction, rollAction, 0.08);

// Out of Recovery: 0.20 s blend back to Idle.
crossfade(rollAction, idleAction, 0.20);
```
**Crossfade out duration: `0.20 s`**

**Invincibility Frames:** Set `player.isInvincible = true` at frame 39, `false` at frame 105.

#### 2. Weapon Hitbox Logic
No attack hitbox during a roll. Ensure disabled:

```ts
weaponHitbox.isAttacking = false;
```

#### 3. VFX Triggers
- **Airborne phase is a ground roll** — apply dust along the roll path.  
- **Entry dust at Windup→Airborne (frame 39):** body commits to the dive.  
- **Exit dust at Airborne→Recovery (frame 106):** character plants feet.

```ts
// Frame 39 — roll dive
if (!rollEntryDustSpawned && t >= toTime(39) && t < toTime(40)) {
  rollEntryDustSpawned = true;
  const pos = new THREE.Vector3();
  hipsBone.getWorldPosition(pos); pos.y = 0;
  spawnDustKickup(pos, 16);
}

// Frame 106 — stand up
if (!rollExitDustSpawned && t >= toTime(106) && t < toTime(107)) {
  rollExitDustSpawned = true;
  const leftPos = new THREE.Vector3();
  leftFootBone.getWorldPosition(leftPos); leftPos.y = 0;
  spawnDustKickup(leftPos, 10);
}
```

#### 4. Audio Hooks
```ts
scheduledFrameCallback(rollAction, 39,  () => playThud(0.12));       // dive onto ground
scheduledFrameCallback(rollAction, 106, () => playThud(0.10));        // foot plant on stand
scheduledFrameCallback(rollAction, 38,  () => playSwoosh(150, 0.08)); // clothing rustle on commit
```

---

### 8. Great Sword Idle
**File:** `Great Sword Idle.fbx`  
**Frames:** 121 | **FPS:** 60 | **Root Motion:** In-Place  

> Looping idle. No Impact phase. Dominant hand velocity: neutral. This is the base state.

#### Phase Timeline
| Phase    | Frames  | Duration (s) |
|----------|---------|-------------|
| Windup   | 1–61    | 1.017       |
| Recovery | 62–121  | 1.000       |

#### 1. Animation Controller & Blending
```ts
const idleClip = stripRootTranslation(idleRawClip);
const idleAction = mixer.clipAction(idleClip);
idleAction.setLoop(THREE.LoopRepeat, Infinity);
idleAction.play();

// Any action fades INTO Idle. Duration depends on source (see each action above).
// Fade INTO Idle from any attack Recovery: 0.20–0.40 s (action-specific).
```

#### 2. Weapon Hitbox Logic
```ts
weaponHitbox.isAttacking = false; // always off during Idle
```

#### 3. VFX Triggers
None. Static idle — no particle triggers.  
Optional: **subtle ambient dust motes** on the blade using a very low-emission continuous emitter (1–2 particles/sec). Not frame-specific.

#### 4. Audio Hooks
None frame-specific. Ambient loop (breathing, cloth settle) handled by audio system, not frame callbacks.

---

### 9. Great Sword Light Attack
**File:** `Great Sword Light Attack.fbx`  
**Frames:** 77 | **FPS:** 60 | **Root Motion:** In-Place  

#### Phase Timeline
| Phase    | Frames  | Duration (s) |
|----------|---------|-------------|
| Windup   | 1–26    | 0.433       |
| Impact   | 27–44   | 0.283       |
| Recovery | 45–77   | 0.550       |

#### 1. Animation Controller & Blending
```ts
const lightAtkClip = stripRootTranslation(lightAtkRawClip);
const lightAtkAction = mixer.clipAction(lightAtkClip);
lightAtkAction.setLoop(THREE.LoopOnce, 1);
lightAtkAction.clampWhenFinished = true;

// Fastest attack in set — snappy blend in.
crossfade(prevAction, lightAtkAction, 0.10);

// Recovery at frame 45 (t=0.750 s). Fastest overall — allow cancel at frame 50.
// Blend to Idle or chain attack over 0.15 s.
crossfade(lightAtkAction, idleAction, 0.15);
```
**Crossfade out duration: `0.15 s`** — shortest of all attack recoveries, enabling fast combos.

#### 2. Weapon Hitbox Logic
Peak bone: **RightHand** | Peak velocity: **10.8 m/s**

```ts
function updateLightAtkHitbox() {
  const t = lightAtkAction.time;
  weaponHitbox.isAttacking = lightAtkAction.isRunning()
    && t >= toTime(27) && t <= toTime(44);
  updateHitbox(weaponHitbox);
}
```

#### 3. VFX Triggers
- **Weapon trail:** frames 27–44.  
- **Impact sparks at frame 34:**

```ts
if (!lightSparksSpawned && t >= toTime(34) && t < toTime(35)) {
  lightSparksSpawned = true;
  const pos = new THREE.Vector3();
  rightHandBone.getWorldPosition(pos);
  spawnImpactSparks(pos, 12); // lighter burst for a light attack
  spawnWeaponTrail(rightHandBone, 0.10);
}
```

#### 4. Audio Hooks
```ts
scheduledFrameCallback(lightAtkAction, 24, () => playSwoosh(450, 0.12)); // crisp pre-impact
scheduledFrameCallback(lightAtkAction, 34, () => playThud(0.15));        // blade connects
```

---

### 10. Great Sword Run
**File:** `Great Sword Run.fbx`  
**Frames:** 37 | **FPS:** 60 | **Root Motion:** In-Place (looping locomotion)  

> Locomotion loop. Airborne phase (frames 11–28) = both feet off ground mid-stride (normal running gait, hips_max_z = 0.08 m — minimal vertical travel as expected for a run).

#### Phase Timeline
| Phase    | Frames  | Duration (s) |
|----------|---------|-------------|
| Windup   | 1–10    | 0.167       |
| Airborne | 11–28   | 0.300       |
| Recovery | 29–37   | 0.150       |

#### 1. Animation Controller & Blending
```ts
const runClip = stripRootTranslation(runRawClip);
const runAction = mixer.clipAction(runClip);
runAction.setLoop(THREE.LoopRepeat, Infinity);

// Blend in from Idle: 0.20 s
crossfade(idleAction, runAction, 0.20);
// Blend out to Idle on stop: 0.20 s
crossfade(runAction, idleAction, 0.20);
// Blend into attack from run: 0.10 s (committed)
crossfade(runAction, attackAction, 0.10);
```

#### 2. Weapon Hitbox Logic
```ts
weaponHitbox.isAttacking = false; // locomotion — no attack window
```

#### 3. VFX Triggers
**Footstep dust on each stride** — fire at Recovery onset (frame 29) each loop cycle:

```ts
// Loop detection: track previous time, detect wrap-around
if (prevRunTime > runAction.time) { // wrapped
  // Trigger right foot dust at loop reset
  const pos = new THREE.Vector3();
  rightFootBone.getWorldPosition(pos); pos.y = 0;
  spawnDustKickup(pos, 5); // light running dust per step
}
// Also trigger at mid-stride Airborne→Recovery boundary each half-cycle
```

#### 4. Audio Hooks
```ts
// Footstep sounds at each foot-plant — approximate at Recovery start (frame 29)
// and mid-Windup (frame 5) for alternating left/right
scheduledLoopingCallback(runAction, 5,  () => playThud(0.08));  // left foot plant
scheduledLoopingCallback(runAction, 29, () => playThud(0.08));  // right foot plant
```

---

### 11. Great Sword Strafe Left
**File:** `Great Sword Strafe Left.fbx`  
**Frames:** 39 | **FPS:** 60 | **Root Motion:** In-Place  

> Lateral locomotion loop. Airborne = stride phase (hips_max_z = 0.21 m — slightly higher step for sideways movement).

#### Phase Timeline
| Phase    | Frames  | Duration (s) |
|----------|---------|-------------|
| Windup   | 1–10    | 0.167       |
| Airborne | 11–30   | 0.333       |
| Recovery | 31–39   | 0.150       |

#### 1. Animation Controller & Blending
```ts
const strafeLeftClip = stripRootTranslation(strafeLeftRawClip);
const strafeLeftAction = mixer.clipAction(strafeLeftClip);
strafeLeftAction.setLoop(THREE.LoopRepeat, Infinity);

crossfade(idleAction, strafeLeftAction, 0.15);
crossfade(strafeLeftAction, idleAction, 0.15);
// Strafe ↔ Run blend:
crossfade(runAction, strafeLeftAction, 0.12);
```

#### 2. Weapon Hitbox Logic
```ts
weaponHitbox.isAttacking = false;
```

#### 3. VFX Triggers
Footstep dust at Recovery (frame 31):

```ts
scheduledLoopingCallback(strafeLeftAction, 31, () => {
  const pos = new THREE.Vector3();
  leftFootBone.getWorldPosition(pos); pos.y = 0;
  spawnDustKickup(pos, 4);
});
```

#### 4. Audio Hooks
```ts
scheduledLoopingCallback(strafeLeftAction, 10, () => playThud(0.07)); // stride plant
scheduledLoopingCallback(strafeLeftAction, 31, () => playThud(0.07));
```

---

### 12. Great Sword Strafe Right
**File:** `Great Sword Strafe right.fbx`  
**Frames:** 66 | **FPS:** 60 | **Root Motion:** In-Place  

> Longer than Strafe Left (66 vs 39 frames) — may have a two-step cycle. Airborne = 18–50 (32 frames), hips_max_z = 0.06 m (subtle, grounded strafe).

#### Phase Timeline
| Phase    | Frames  | Duration (s) |
|----------|---------|-------------|
| Windup   | 1–17    | 0.283       |
| Airborne | 18–50   | 0.533       |
| Recovery | 51–66   | 0.267       |

#### 1. Animation Controller & Blending
```ts
const strafeRightClip = stripRootTranslation(strafeRightRawClip);
const strafeRightAction = mixer.clipAction(strafeRightClip);
strafeRightAction.setLoop(THREE.LoopRepeat, Infinity);

crossfade(idleAction, strafeRightAction, 0.15);
crossfade(strafeRightAction, idleAction, 0.15);
crossfade(strafeLeftAction, strafeRightAction, 0.10); // direction switch
```

#### 2. Weapon Hitbox Logic
```ts
weaponHitbox.isAttacking = false;
```

#### 3. VFX Triggers
Footstep at Recovery onset (frame 51) and mid-cycle:

```ts
scheduledLoopingCallback(strafeRightAction, 17,  () => {
  const pos = new THREE.Vector3();
  rightFootBone.getWorldPosition(pos); pos.y = 0;
  spawnDustKickup(pos, 4);
});
scheduledLoopingCallback(strafeRightAction, 51, () => {
  const pos = new THREE.Vector3();
  leftFootBone.getWorldPosition(pos); pos.y = 0;
  spawnDustKickup(pos, 4);
});
```

#### 4. Audio Hooks
```ts
scheduledLoopingCallback(strafeRightAction, 17, () => playThud(0.07));
scheduledLoopingCallback(strafeRightAction, 51, () => playThud(0.07));
```

---

### 13. Great Sword Walk Backward
**File:** `Great Sword Walk backward.fbx`  
**Frames:** 78 | **FPS:** 60 | **Root Motion:** In-Place  

> Backward walk loop. Airborne stride = frames 21–59 (hips_max_z = 0.08 m).

#### Phase Timeline
| Phase    | Frames  | Duration (s) |
|----------|---------|-------------|
| Windup   | 1–20    | 0.333       |
| Airborne | 21–59   | 0.633       |
| Recovery | 60–78   | 0.317       |

#### 1. Animation Controller & Blending
```ts
const walkBackClip = stripRootTranslation(walkBackRawClip);
const walkBackAction = mixer.clipAction(walkBackClip);
walkBackAction.setLoop(THREE.LoopRepeat, Infinity);

crossfade(idleAction, walkBackAction, 0.20);
crossfade(walkBackAction, idleAction, 0.20);
```

#### 2. Weapon Hitbox Logic
```ts
weaponHitbox.isAttacking = false;
```

#### 3. VFX Triggers
Footstep dust at each foot-plant:

```ts
scheduledLoopingCallback(walkBackAction, 20, () => {
  const pos = new THREE.Vector3();
  leftFootBone.getWorldPosition(pos); pos.y = 0;
  spawnDustKickup(pos, 4);
});
scheduledLoopingCallback(walkBackAction, 60, () => {
  const pos = new THREE.Vector3();
  rightFootBone.getWorldPosition(pos); pos.y = 0;
  spawnDustKickup(pos, 4);
});
```

#### 4. Audio Hooks
```ts
scheduledLoopingCallback(walkBackAction, 20, () => playThud(0.10)); // heavier step — cautious backward walk
scheduledLoopingCallback(walkBackAction, 60, () => playThud(0.10));
```

---

### 14. Great Sword Walk Forward
**File:** `Great Sword Walk forward.fbx`  
**Frames:** 82 | **FPS:** 60 | **Root Motion:** In-Place  

> Forward walk loop. Airborne stride = frames 22–62 (hips_max_z = 0.04 m — very subtle, grounded walk).

#### Phase Timeline
| Phase    | Frames  | Duration (s) |
|----------|---------|-------------|
| Windup   | 1–21    | 0.350       |
| Airborne | 22–62   | 0.683       |
| Recovery | 63–82   | 0.317       |

#### 1. Animation Controller & Blending
```ts
const walkFwdClip = stripRootTranslation(walkFwdRawClip);
const walkFwdAction = mixer.clipAction(walkFwdClip);
walkFwdAction.setLoop(THREE.LoopRepeat, Infinity);

crossfade(idleAction, walkFwdAction, 0.20);
crossfade(walkFwdAction, idleAction, 0.20);
crossfade(walkFwdAction, runAction, 0.15);  // walk → run speed ramp
```

#### 2. Weapon Hitbox Logic
```ts
weaponHitbox.isAttacking = false;
```

#### 3. VFX Triggers
Footstep dust at each stride plant:

```ts
scheduledLoopingCallback(walkFwdAction, 21, () => {
  const pos = new THREE.Vector3();
  leftFootBone.getWorldPosition(pos); pos.y = 0;
  spawnDustKickup(pos, 4);
});
scheduledLoopingCallback(walkFwdAction, 63, () => {
  const pos = new THREE.Vector3();
  rightFootBone.getWorldPosition(pos); pos.y = 0;
  spawnDustKickup(pos, 4);
});
```

#### 4. Audio Hooks
```ts
scheduledLoopingCallback(walkFwdAction, 21, () => playThud(0.09));
scheduledLoopingCallback(walkFwdAction, 63, () => playThud(0.09));
```

---

## Cross-Animation Reference Table

| Animation                    | Frames | Impact Window | Peak Vel. Bone | Peak Vel. (m/s) | Peak Vel. Frame | Crossfade Out | Root Motion |
|------------------------------|--------|---------------|----------------|-----------------|-----------------|---------------|-------------|
| Great Sword Kick             | 105    | 32–48         | LeftFoot       | 10.6            | 42              | 0.20 s        | In-Place    |
| Melee 360 Low Heavy          | 150    | 44–66         | RightHand      | 8.2             | 56              | 0.30 s        | In-Place    |
| Melee Downward               | 137    | 39–57         | RightHand      | 9.3             | 51              | 0.25 s        | In-Place    |
| Melee Combo Ver.2            | 253    | 148–164       | RightHand      | **13.4**        | 157             | 0.35 s        | In-Place    |
| Run Jump Attack              | 221    | 96–103        | RightHand      | **23.5**        | 99              | 0.40 s        | **Active**  |
| Great Sword Impact (react)   | 76     | 1–16 (receive)| RightHand      | 3.6             | 12              | 0.20 s        | In-Place    |
| Stand To Roll                | 143    | —             | —              | —               | —               | 0.20 s        | In-Place    |
| Great Sword Idle             | 121    | —             | —              | —               | —               | varies        | In-Place    |
| Great Sword Light Attack     | 77     | 27–44         | RightHand      | 10.8            | 34              | **0.15 s**    | In-Place    |
| Great Sword Run              | 37     | —             | —              | —               | —               | 0.20 s        | In-Place    |
| Strafe Left                  | 39     | —             | —              | —               | —               | 0.15 s        | In-Place    |
| Strafe Right                 | 66     | —             | —              | —               | —               | 0.15 s        | In-Place    |
| Walk Backward                | 78     | —             | —              | —               | —               | 0.20 s        | In-Place    |
| Walk Forward                 | 82     | —             | —              | —               | —               | 0.20 s        | In-Place    |

---

## Implementation Utility: `scheduledFrameCallback`

The blueprints above reference this helper. Implement it once:

```ts
interface FrameCallback {
  action: THREE.AnimationAction;
  targetTime: number;
  callback: () => void;
  fired: boolean;
}

const frameCallbacks: FrameCallback[] = [];

function scheduledFrameCallback(
  action: THREE.AnimationAction,
  frame: number,
  callback: () => void
) {
  frameCallbacks.push({ action, targetTime: frame / 60, callback, fired: false });
}

function scheduledLoopingCallback(
  action: THREE.AnimationAction,
  frame: number,
  callback: () => void
) {
  // Re-fires each loop. Track prevTime to detect wrap-around + crossing.
  // Implementation: store per-action previous time, detect forward crossing of targetTime.
}

// Call this every frame after mixer.update():
function tickFrameCallbacks() {
  for (const fc of frameCallbacks) {
    if (!fc.action.isRunning()) { fc.fired = false; continue; }
    if (!fc.fired && fc.action.time >= fc.targetTime) {
      fc.fired = true;
      fc.callback();
    }
  }
}
```

---

## Priority Implementation Order

1. `Great Sword Idle` — base state, must work before anything else
2. `Great Sword Light Attack` — shortest, best to validate hitbox + VFX pipeline
3. `Great Sword Walk Forward / Run` — locomotion baseline
4. `Great Sword Impact` (hit-react) — validates interrupt logic
5. `Stand To Roll` — validates invincibility frames + airborne dust
6. `Melee Downward` + `Melee 360 Low Heavy` — validates full attack cycle
7. `Great Sword Kick` — foot hitbox validation
8. `Melee Combo Ver.2` — multi-phase, validate sub-hit windows
9. `Standing Melee Run Jump Attack` — root motion, most complex
10. Remaining locomotion (strafe, backward walk)

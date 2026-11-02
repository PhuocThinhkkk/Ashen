import * as THREE from 'three';
import './asset-test/types';
import { getDomBindings } from './asset-test/ui/DomBindings';
import { AssetTestCameraManager } from './asset-test/camera/AssetTestCameraManager';
import { RawAnimationStage } from './asset-test/track1/RawAnimationStage';
import { CombatDuelStage } from './asset-test/track2/CombatDuelStage';
import { DuelCombatResolver } from './asset-test/track2/DuelCombatResolver';
import { WeaponSocketGUI } from './asset-test/ui/WeaponSocketGUI';
import { RawInspectorUI } from './asset-test/ui/RawInspectorUI';
import { CombatDuelUI } from './asset-test/ui/CombatDuelUI';
import { CONFIG } from './asset-test/config';

// 1. Scene, Lights & Floor
const dom = getDomBindings();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e16);
scene.fog = new THREE.Fog(0x0b101a, 20, 75);

const renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const hemiLight = new THREE.HemisphereLight(0x506888, 0x222a36, 1.8);
scene.add(hemiLight);

const moonLight = new THREE.DirectionalLight(0xbcd6ff, 2.8);
moonLight.position.set(-14, 24, 16);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.bias = -0.0001;
scene.add(moonLight);

const rimLight = new THREE.DirectionalLight(0x5577aa, 0.85);
rimLight.position.set(16, 12, -14);
scene.add(rimLight);

const floorGeo = new THREE.CylinderGeometry(
  CONFIG.arena.floorRadius,
  CONFIG.arena.floorRadius,
  0.5,
  48,
);
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x141b24,
  roughness: 0.85,
  metalness: 0.1,
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.position.y = -0.25;
floor.receiveShadow = true;
scene.add(floor);

const gridHelper = new THREE.GridHelper(
  CONFIG.arena.gridSize,
  CONFIG.arena.gridSize,
  0x7a5e2a,
  0x1b2332,
);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

// 2. Stages & Controllers
let playbackSpeed = 1.0;
let isPaused = false;
let duelPlaybackSpeed = 1.0;
let isDuelPaused = false;
const keysPressed: Record<string, boolean> = {};

const cameraMgr = new AssetTestCameraManager(dom.canvas, (roamActive) => {
  if (roamActive) {
    if (dom.overlay && !dom.overlay.classList.contains('collapsed')) {
      dom.overlay.classList.add('collapsed');
      if (dom.overlayToggleBtn) dom.overlayToggleBtn.textContent = '□';
    }
    if (dom.roamBanner) dom.roamBanner.style.display = 'block';
  } else {
    if (dom.overlay && dom.overlay.classList.contains('collapsed')) {
      dom.overlay.classList.remove('collapsed');
      if (dom.overlayToggleBtn) dom.overlayToggleBtn.textContent = '_';
    }
    if (dom.roamBanner) dom.roamBanner.style.display = 'none';
    if (dom.reticle) dom.reticle.style.display = 'none';
  }
});

const rawStage = new RawAnimationStage();
const duelStage = new CombatDuelStage(scene);
const socketGui = new WeaponSocketGUI(rawStage, dom);

const duelUI = new CombatDuelUI(
  dom,
  duelStage,
  (text) => duelUI.logCombat(text),
  (frames) => stepDuelFrame(frames),
  () => toggleDuelPause(),
  (speed) => {
    duelPlaybackSpeed = speed;
  },
);

const rawUI = new RawInspectorUI(
  dom,
  rawStage,
  cameraMgr,
  () => toggleHitboxDebug(),
  (frames) => stepFrame(frames),
  () => togglePause(),
  (speed) => {
    playbackSpeed = speed;
  },
  async (modelId) => {
    await rawStage.loadPlayer(modelId);
    await duelStage.switchPlayerModel(modelId);
    rawUI.populatePlayerButtons();
    rawUI.updateActiveClipLabels();
    rawUI.updateDiagnosticsInfo();
  },
  async () => {
    await captureAllAnimations();
  },
);

// 3. Global Control Functions
function toggleHitboxDebug(visible?: boolean): boolean {
  const nextVisible = visible !== undefined ? visible : !rawStage.isHitboxVisible;
  rawStage.setHitboxVisible(nextVisible);
  duelStage.setHitboxVisible(nextVisible);

  if (dom.hitboxStatusBadge) {
    dom.hitboxStatusBadge.textContent = nextVisible ? 'HITBOX: ON' : 'HITBOX: OFF';
    dom.hitboxStatusBadge.style.color = nextVisible ? '#ffff00' : '#888800';
    dom.hitboxStatusBadge.style.borderColor = nextVisible ? '#ffff00' : '#888800';
  }
  return nextVisible;
}

function setGameFollowMode(enabled: boolean): void {
  cameraMgr.setRoamMode(
    enabled,
    duelStage.logicPlayer ? duelStage.logicPlayer.group.position : undefined,
  );
  if (dom.btnModeToggle) {
    dom.btnModeToggle.textContent = enabled
      ? '🚶 Mode: 3rd-Person Follow (Click to Orbit)'
      : '🎮 Mode: Orbit (Click for 3rd-Person Follow)';
    dom.btnModeToggle.classList.toggle('active', enabled);
  }
  if (dom.cameraButtons) {
    dom.cameraButtons.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    if (enabled) {
      dom.cameraButtons.querySelector('button[data-cam="roam"]')?.classList.add('active');
    } else {
      dom.cameraButtons.querySelector('button[data-cam="both"]')?.classList.add('active');
    }
  }
}

function togglePause(): boolean {
  isPaused = !isPaused;
  if (dom.btnPlayPause) {
    dom.btnPlayPause.textContent = isPaused ? '▶ Play' : '⏸ Pause';
  }
  return isPaused;
}

function stepFrame(framesCount: number): void {
  isPaused = true;
  if (dom.btnPlayPause) dom.btnPlayPause.textContent = '▶ Play';

  const deltaSeconds = framesCount * (1 / 60);
  rawStage.stepFrame(deltaSeconds);
  updateTelemetry();
  renderer.render(scene, cameraMgr.camera);
}

function toggleDuelPause(): boolean {
  isDuelPaused = !isDuelPaused;
  if (dom.btnDuelPlayPause) {
    dom.btnDuelPlayPause.textContent = isDuelPaused ? '▶ Play' : '⏸ Pause';
  }
  return isDuelPaused;
}

function stepDuelFrame(framesCount: number): void {
  isDuelPaused = true;
  if (dom.btnDuelPlayPause) dom.btnDuelPlayPause.textContent = '▶ Play';

  const deltaSeconds = framesCount * (1 / 60);
  duelStage.stepFrame(deltaSeconds);
  renderer.render(scene, cameraMgr.camera);
}

function updateTelemetry(): { playerActive: boolean; bossActive: boolean } {
  const telemetry = rawStage.updateFrameTelemetry();
  if (dom.frameTelemetry && telemetry.telemetryText) {
    dom.frameTelemetry.textContent = telemetry.telemetryText;
  }
  return { playerActive: telemetry.playerActive, bossActive: telemetry.bossActive };
}

// 4. Capture Canvas & Mid-Frame Validation Utilities
function captureCanvas(): string {
  renderer.render(scene, cameraMgr.camera);
  return dom.canvas.toDataURL('image/png');
}

async function pauseAtMidFrame(
  category: 'player' | 'boss',
  clipName: string,
): Promise<{ duration: number; midTime: number }> {
  if (category === 'player') {
    rawStage.playPlayerAnimation(clipName);
    rawUI.updateActiveClipLabels();
    const action =
      rawStage.playerActions.get(rawStage.diagnostics.player.activeClip) ||
      rawStage.currentPlayerAction;
    if (action) {
      const clip = action.getClip();
      const mid = clip.duration / 2;
      action.time = mid;
      action.paused = true;
      if (rawStage.playerMixer) rawStage.playerMixer.update(0);
      renderer.render(scene, cameraMgr.camera);
      return { duration: clip.duration, midTime: mid };
    }
  } else {
    rawStage.playBossAnimation(clipName);
    rawUI.updateActiveClipLabels();
    const action =
      rawStage.bossActions.get(rawStage.diagnostics.boss.activeClip) || rawStage.currentBossAction;
    if (action) {
      const clip = action.getClip();
      const mid = clip.duration / 2;
      action.time = mid;
      action.paused = true;
      if (rawStage.bossMixer) rawStage.bossMixer.update(0);
      renderer.render(scene, cameraMgr.camera);
      return { duration: clip.duration, midTime: mid };
    }
  }
  return { duration: 0, midTime: 0 };
}

async function captureAllAnimations(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const clip of rawStage.diagnostics.player.clips) {
    await pauseAtMidFrame('player', clip);
    result[`player_${clip}`] = captureCanvas();
  }
  for (const clip of rawStage.diagnostics.boss.clips) {
    await pauseAtMidFrame('boss', clip);
    result[`boss_${clip}`] = captureCanvas();
  }
  if (rawStage.currentPlayerAction) rawStage.currentPlayerAction.paused = false;
  if (rawStage.currentBossAction) rawStage.currentBossAction.paused = false;
  rawStage.playPlayerAnimation('idle');
  rawStage.playBossAnimation('idle');
  rawUI.updateActiveClipLabels();
  return result;
}

// 5. Keyboard Navigation & Canvas Events
window.addEventListener('keydown', (e) => {
  keysPressed[e.code] = true;
  if (e.code === 'KeyH' && !e.repeat) {
    toggleHitboxDebug();
  } else if (e.code === 'KeyR' && !e.repeat) {
    duelStage.resetPositions((text) => duelUI.logCombat(text));
  } else if (e.code === 'Escape') {
    if (cameraMgr.isRoamMode) setGameFollowMode(false);
  } else if (e.code === 'Space' && !e.repeat) {
    if (cameraMgr.isRoamMode) {
      // Handled in inputController
    } else {
      togglePause();
    }
  } else if (e.code === 'BracketLeft' && !e.repeat) {
    stepFrame(-1);
  } else if (e.code === 'BracketRight' && !e.repeat) {
    stepFrame(1);
  } else if (e.code === 'KeyJ' && !e.repeat) {
    if (!cameraMgr.isRoamMode) {
      duelStage.triggerPlayerAction('light1', (text) => duelUI.logCombat(text));
    }
  } else if (e.code === 'KeyK' && !e.repeat) {
    if (!cameraMgr.isRoamMode) {
      duelStage.triggerPlayerAction('heavy', (text) => duelUI.logCombat(text));
    }
  }
});

window.addEventListener('keyup', (e) => {
  keysPressed[e.code] = false;
});

dom.canvas.addEventListener('click', () => {
  if (cameraMgr.isRoamMode && document.pointerLockElement !== dom.canvas) {
    dom.canvas.requestPointerLock();
  }
});

dom.btnModeToggle?.addEventListener('click', () => {
  setGameFollowMode(!cameraMgr.isRoamMode);
});

dom.btnOpenSettings?.addEventListener('click', () => {
  const isHidden = dom.winWeaponOffsets?.classList.toggle('hidden');
  dom.btnToggleWin3?.classList.toggle('active', !isHidden);
});

// Top Navbar 3-Window Toggle Buttons
dom.btnToggleWin1?.addEventListener('click', () => {
  const isHidden = dom.overlay?.classList.toggle('hidden');
  dom.btnToggleWin1?.classList.toggle('active', !isHidden);
});

dom.btnToggleWin2?.addEventListener('click', () => {
  const isHidden = dom.winCombatDuel?.classList.toggle('hidden');
  dom.btnToggleWin2?.classList.toggle('active', !isHidden);
});

dom.btnToggleWin3?.addEventListener('click', () => {
  const isHidden = dom.winWeaponOffsets?.classList.toggle('hidden');
  dom.btnToggleWin3?.classList.toggle('active', !isHidden);
});

dom.btnMinWin3?.addEventListener('click', () => {
  const isCollapsed = dom.winWeaponOffsets?.classList.toggle('collapsed');
  if (dom.btnMinWin3) dom.btnMinWin3.textContent = isCollapsed ? '□' : '_';
});

// 6. Main Initialization
async function initHarness(): Promise<void> {
  try {
    rawUI.init();
    duelUI.init();

    // Load Track 1 (Raw Models)
    await rawStage.init(scene, (status) => {
      if (dom.loadStatus) dom.loadStatus.textContent = status;
    });
    rawUI.populatePlayerButtons();
    rawUI.populateBossButtons();
    rawUI.updateDiagnosticsInfo();
    socketGui.init();

    // Load Track 2 (Logic Models)
    if (dom.loadStatus) dom.loadStatus.textContent = 'Loading Track 2 Combat Duel Models...';
    await duelStage.init(scene);

    if (dom.loadStatus) {
      dom.loadStatus.className = 'status-ok';
      dom.loadStatus.textContent = 'All 4 Models Loaded & Ready';
    }
    rawStage.diagnostics.loaded = true;
  } catch (err) {
    rawStage.diagnostics.error = err instanceof Error ? err.message : String(err);
    if (dom.loadStatus) {
      dom.loadStatus.className = 'status-err';
      dom.loadStatus.textContent = `Error: ${rawStage.diagnostics.error}`;
    }
    console.error('Asset load error:', err);
  }
}

// 7. Global Window API Hook (Full Backward Compatibility & Dual-Track Extensions)
window.__ASSET_TEST__ = {
  diagnostics: rawStage.diagnostics,
  playPlayerClip: (name: string) => {
    rawStage.playPlayerAnimation(name);
    rawUI.updateActiveClipLabels();
  },
  playBossClip: (name: string) => {
    rawStage.playBossAnimation(name);
    rawUI.updateActiveClipLabels();
  },
  getWeaponDistanceToHand: () => rawStage.getWeaponDistanceToHand(),
  switchPlayerModel: async (modelId: string) => {
    if (modelId === 'knight' || modelId === 'samurai') {
      await rawStage.loadPlayer(modelId);
      await duelStage.switchPlayerModel(modelId);
      rawUI.populatePlayerButtons();
      rawUI.updateActiveClipLabels();
      rawUI.updateDiagnosticsInfo();
    }
  },
  setPlaybackSpeed: (speed: number) => {
    playbackSpeed = speed;
  },
  setCamera: (preset) => cameraMgr.setCamera(preset),
  pauseAtMidFrame,
  captureCanvas,
  captureAllAnimations,
  toggleHitbox: toggleHitboxDebug,
  isHitboxVisible: () => rawStage.isHitboxVisible,
  stepFrame,
  togglePause,
  setMode: (mode: 'orbit' | 'walk') => {
    setGameFollowMode(mode === 'walk');
  },
  getHitboxDebugState: updateTelemetry,
  triggerPlayerAction: (actionKey: string) =>
    duelStage.triggerPlayerAction(actionKey, (text) => duelUI.logCombat(text)),
  triggerBossAction: (actionKey: string) =>
    duelStage.triggerBossAction(actionKey, (text) => duelUI.logCombat(text)),
  resetDuelPositions: () => duelStage.resetPositions((text) => duelUI.logCombat(text)),
  getDuelSpacing: () => duelStage.getSpacing(),
  toggleAutoReset: (enabled?: boolean) => {
    const active = duelStage.toggleAutoReset(enabled);
    if (dom.btnToggleAutoReset) {
      dom.btnToggleAutoReset.textContent = `Auto-Reset: ${active ? 'ON (1.0s)' : 'OFF'}`;
      dom.btnToggleAutoReset.classList.toggle('active', active);
    }
    return active;
  },
  toggleTrajectory: (enabled?: boolean) => {
    const active = duelStage.trajectory.toggleVisibility(enabled);
    if (dom.btnToggleTrajectory) {
      dom.btnToggleTrajectory.textContent = `Trajectory: ${active ? 'ON' : 'OFF'}`;
      dom.btnToggleTrajectory.classList.toggle('active', active);
    }
    return active;
  },
  setRoamMode: (enabled: boolean) => setGameFollowMode(enabled),
  getWeaponLocations: () => ({
    playerSword: duelStage.logicPlayer ? duelStage.logicPlayer.getWeaponBladeSegment() : null,
    bossGreatsword: duelStage.logicBoss ? duelStage.logicBoss.getWeaponBladeSegment() : null,
    bossFoot: duelStage.logicBoss ? duelStage.logicBoss.getFootLocation() : null,
    bladeToPlayerDistance: DuelCombatResolver.lastBladeToPlayerDistance,
    bladeToBossDistance: DuelCombatResolver.lastBladeToBossDistance,
  }),
};

// 8. Main Render Loop
const clock = new THREE.Clock();
function animate(): void {
  requestAnimationFrame(animate);
  const rawDelta = clock.getDelta();
  const delta = rawDelta * playbackSpeed;
  const duelDelta = isDuelPaused ? 0 : rawDelta * duelPlaybackSpeed;
  const elapsed = clock.getElapsedTime();

  if (!isPaused) {
    rawStage.update(delta);
  }

  updateTelemetry();

  duelStage.update(
    duelDelta,
    elapsed,
    cameraMgr.isRoamMode,
    cameraMgr.inputController,
    cameraMgr.soulslikeCamera,
    (text) => duelUI.logCombat(text),
    (telemetryData) => {
      duelUI.updateTelemetry(telemetryData);
      if (cameraMgr.soulslikeCamera.isLockedOn && dom.reticle && duelStage.logicBoss) {
        const screenPos = cameraMgr.projectToScreen(duelStage.logicBoss.group.position, 1.8);
        dom.reticle.style.display = 'block';
        dom.reticle.style.left = `${screenPos.x}px`;
        dom.reticle.style.top = `${screenPos.y}px`;
      } else if (dom.reticle) {
        dom.reticle.style.display = 'none';
      }
    },
  );

  cameraMgr.update();
  renderer.render(scene, cameraMgr.camera);
}

window.addEventListener('resize', () => {
  cameraMgr.handleResize();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

void initHarness();
animate();

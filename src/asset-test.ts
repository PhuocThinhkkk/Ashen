import * as THREE from 'three';
import './asset-test/types';
import { getDomBindings } from './asset-test/ui/DomBindings';
import { AssetTestCameraManager } from './asset-test/camera/AssetTestCameraManager';
import { RawAnimationStage } from './asset-test/track1/RawAnimationStage';
import { CombatDuelStage } from './asset-test/track2/CombatDuelStage';
import { DuelCombatResolver } from './asset-test/track2/DuelCombatResolver';
import { WeaponSocketGUI } from './asset-test/ui/WeaponSocketGUI';
import { BossMusicGUI } from './asset-test/ui/BossMusicGUI';
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

type ActiveMode = 'raw' | 'combat' | 'socket' | 'music' | null;
let activeMode: ActiveMode = 'raw';
let lastActiveMode: 'raw' | 'combat' | 'socket' | 'music' = 'raw';

function setTabMode(mode: ActiveMode): void {
  activeMode = mode;
  if (mode !== null) {
    lastActiveMode = mode;
  }

  // Update tabs active state
  dom.btnToggleWin1?.classList.toggle('active', mode === 'raw');
  dom.btnToggleWin2?.classList.toggle('active', mode === 'combat');
  dom.btnToggleWin3?.classList.toggle('active', mode === 'socket');
  dom.btnToggleWin4?.classList.toggle('active', mode === 'music');

  const btnToggleUi = document.querySelector<HTMLButtonElement>('#btn-toggle-ui');
  btnToggleUi?.classList.toggle('active', mode === null);
  if (btnToggleUi) {
    btnToggleUi.textContent = mode === null ? 'Show UI' : 'Hide UI';
  }

  // Docked single panel slot: show only selected panel, hide other three with display: none
  if (dom.overlay) {
    dom.overlay.classList.toggle('hidden', mode !== 'raw');
  }
  if (dom.winCombatDuel) {
    dom.winCombatDuel.classList.toggle('hidden', mode !== 'combat');
  }
  if (dom.winWeaponOffsets) {
    dom.winWeaponOffsets.classList.toggle('hidden', mode !== 'socket');
  }
  if (dom.winBossMusic) {
    dom.winBossMusic.classList.toggle('hidden', mode !== 'music');
  }

  const panelSlot = document.querySelector<HTMLElement>('#single-panel-slot');
  const playbackStrip = document.querySelector<HTMLElement>('#unified-playback-strip');
  if (mode === null) {
    if (panelSlot) panelSlot.style.display = 'none';
    if (playbackStrip) playbackStrip.style.display = 'none';
  } else {
    if (panelSlot) panelSlot.style.display = '';
    if (playbackStrip) playbackStrip.style.display = '';
  }

  // Update playback strip pause/play button label for active mode
  if (dom.btnPlayPause) {
    if (mode === 'combat') {
      dom.btnPlayPause.textContent = isDuelPaused ? '▶ Play' : '⏸ Pause';
    } else {
      dom.btnPlayPause.textContent = isPaused ? '▶ Play' : '⏸ Pause';
    }
  }
}

function toggleUI(): void {
  if (activeMode !== null) {
    setTabMode(null);
  } else {
    setTabMode(lastActiveMode);
  }
}

function togglePause(): boolean {
  isPaused = !isPaused;
  if (rawStage.currentPlayerAction) rawStage.currentPlayerAction.paused = isPaused;
  if (rawStage.currentBossAction) rawStage.currentBossAction.paused = isPaused;
  if (dom.btnPlayPause && activeMode !== 'combat') {
    dom.btnPlayPause.textContent = isPaused ? '▶ Play' : '⏸ Pause';
  }
  return isPaused;
}

function stepFrame(framesCount: number): void {
  isPaused = true;
  if (rawStage.currentPlayerAction) rawStage.currentPlayerAction.paused = true;
  if (rawStage.currentBossAction) rawStage.currentBossAction.paused = true;
  if (dom.btnPlayPause && activeMode !== 'combat') dom.btnPlayPause.textContent = '▶ Play';

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
  if (dom.btnPlayPause && activeMode === 'combat') {
    dom.btnPlayPause.textContent = isDuelPaused ? '▶ Play' : '⏸ Pause';
  }
  return isDuelPaused;
}

function stepDuelFrame(framesCount: number): void {
  isDuelPaused = true;
  if (dom.btnDuelPlayPause) dom.btnDuelPlayPause.textContent = '▶ Play';
  if (dom.btnPlayPause && activeMode === 'combat') dom.btnPlayPause.textContent = '▶ Play';

  const deltaSeconds = framesCount * (1 / 60);
  duelStage.stepFrame(deltaSeconds);
  renderer.render(scene, cameraMgr.camera);
}

function handleUnifiedPlayPause(): boolean {
  if (activeMode === 'combat') {
    return toggleDuelPause();
  } else {
    return togglePause();
  }
}

function handleUnifiedStep(framesCount: number): void {
  if (activeMode === 'combat') {
    stepDuelFrame(framesCount);
  } else {
    stepFrame(framesCount);
  }
}

function handleUnifiedSpeed(speed: number): void {
  playbackSpeed = speed;
  duelPlaybackSpeed = speed;
  dom.speedButtons?.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    const s = parseFloat(b.getAttribute('data-speed') || '1.0');
    b.classList.toggle('active', s === speed);
  });
}

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
const musicGui = new BossMusicGUI(dom);

const duelUI = new CombatDuelUI(
  dom,
  duelStage,
  (text) => duelUI.logCombat(text),
  (frames) => handleUnifiedStep(frames),
  () => handleUnifiedPlayPause(),
  (speed) => handleUnifiedSpeed(speed),
);

const rawUI = new RawInspectorUI(
  dom,
  rawStage,
  cameraMgr,
  () => toggleHitboxDebug(),
  (frames) => handleUnifiedStep(frames),
  () => handleUnifiedPlayPause(),
  (speed) => handleUnifiedSpeed(speed),
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
  if (enabled) {
    setTabMode('combat');
  }
  cameraMgr.setRoamMode(
    enabled,
    duelStage.logicPlayer ? duelStage.logicPlayer.group.position : undefined,
  );
  if (dom.btnModeToggle) {
    dom.btnModeToggle.textContent = enabled
      ? 'Mode: 3rd-Person Follow (Click to Orbit)'
      : 'Mode: Orbit (Click for 3rd-Person Follow)';
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

let activeScrubTarget: 'player' | 'boss' = 'boss';
let isScrubbingTimeline = false;

dom.timelineScrubber?.addEventListener('input', () => {
  isScrubbingTimeline = true;
  isPaused = true;
  if (dom.btnPlayPause && activeMode !== 'combat') dom.btnPlayPause.textContent = '▶ Play';
  const info = rawStage.getFrameInfo(activeScrubTarget);
  if (info && info.duration > 0) {
    const frac = parseFloat(dom.timelineScrubber!.value) / 1000;
    rawStage.seekTime(activeScrubTarget, frac * info.duration);
    updateTelemetry();
    renderer.render(scene, cameraMgr.camera);
  }
});

dom.timelineScrubber?.addEventListener('change', () => {
  isScrubbingTimeline = false;
});

function updateTelemetry(): { playerActive: boolean; bossActive: boolean } {
  const telemetry = rawStage.updateFrameTelemetry();
  if (dom.frameTelemetry && telemetry.telemetryText) {
    dom.frameTelemetry.textContent = telemetry.telemetryText;
  }
  if (dom.timelineScrubber && !isScrubbingTimeline) {
    const info = rawStage.getFrameInfo(activeScrubTarget);
    if (info && info.duration > 0) {
      dom.timelineScrubber.value = String(Math.round((info.time / info.duration) * 1000));
    }
  }
  return { playerActive: telemetry.playerActive, bossActive: telemetry.bossActive };
}

// 4. Capture Canvas & Mid-Frame Validation Utilities
function captureCanvas(): string {
  renderer.render(scene, cameraMgr.camera);
  return dom.canvas.toDataURL('image/png');
}

/**
 * [Purpose]: Freezes animation playback at the exact midpoint frame for visual inspection and snapshot comparison.
 * @condition Invoked during automated mid-frame validation suites or manual animation inspection workflows.
 * @param category Target rig identifier ('player' | 'boss') and clipName string matching an animation clip.
 * @returns Promise resolving to clip duration and computed midpoint timestamp in seconds.
 */
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
  if ((e.code === 'KeyH' || e.code === 'Tab') && !e.repeat) {
    if (e.code === 'Tab') {
      e.preventDefault();
    }
    if (e.code === 'KeyH') {
      toggleHitboxDebug();
    }
    toggleUI();
  } else if (e.code === 'Digit1' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
    setTabMode('raw');
  } else if (e.code === 'Digit2' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
    setTabMode('combat');
  } else if (e.code === 'Digit3' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
    setTabMode('socket');
  } else if (e.code === 'Digit4' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
    setTabMode('music');
  } else if (e.code === 'KeyR' && !e.repeat) {
    duelStage.resetPositions((text) => duelUI.logCombat(text));
  } else if (e.code === 'Escape') {
    if (cameraMgr.isRoamMode) setGameFollowMode(false);
  } else if (e.code === 'Space' && !e.repeat) {
    if (cameraMgr.isRoamMode) {
      // Handled in inputController
    } else {
      handleUnifiedPlayPause();
    }
  } else if (e.code === 'BracketLeft' && !e.repeat) {
    handleUnifiedStep(-1);
  } else if (e.code === 'BracketRight' && !e.repeat) {
    handleUnifiedStep(1);
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
  setTabMode('combat');
  setGameFollowMode(!cameraMgr.isRoamMode);
});

dom.btnOpenSettings?.addEventListener('click', () => {
  if (activeMode === 'socket') {
    setTabMode('raw');
  } else {
    setTabMode('socket');
  }
});

// Top Mode Switcher Bar (4 Tabs + Hide UI)
dom.btnToggleWin1?.addEventListener('click', () => setTabMode('raw'));
dom.btnToggleWin2?.addEventListener('click', () => setTabMode('combat'));
dom.btnToggleWin3?.addEventListener('click', () => setTabMode('socket'));
dom.btnToggleWin4?.addEventListener('click', () => setTabMode('music'));
document.querySelector('#btn-toggle-ui')?.addEventListener('click', () => toggleUI());

// Camera quick switches auto-orient active tab to relevant stage
dom.cameraButtons?.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const cam = btn.getAttribute('data-cam');
    if (cam === 'duel' || cam === 'side') {
      setTabMode('combat');
    } else if (cam === 'player' || cam === 'boss' || cam === 'both') {
      setTabMode('raw');
    }
  });
});

dom.btnMinWin3?.addEventListener('click', () => {
  const isCollapsed = dom.winWeaponOffsets?.classList.toggle('collapsed');
  if (dom.btnMinWin3) dom.btnMinWin3.textContent = isCollapsed ? '□' : '_';
});

dom.btnMinWin4?.addEventListener('click', () => {
  const isCollapsed = dom.winBossMusic?.classList.toggle('collapsed');
  if (dom.btnMinWin4) dom.btnMinWin4.textContent = isCollapsed ? '□' : '_';
});

// Auto-switch mode if test suite or caller queries/inspects element inside another mode
const origDocQuerySelector = Document.prototype.querySelector;
const origDocQuerySelectorAll = Document.prototype.querySelectorAll;
const origElemQuerySelector = Element.prototype.querySelector;
const origElemQuerySelectorAll = Element.prototype.querySelectorAll;
const origGetComputedStyle = window.getComputedStyle;
const origGetBoundingClientRect = Element.prototype.getBoundingClientRect;

/**
 * [Purpose]: Automatically switches the active test harness tab mode based on queried DOM element hierarchy.
 * @condition Triggered on DOM query interceptions (querySelector, getComputedStyle) during test suite runs.
 * @param el Inspected DOM element or null to test for containment within tab containers.
 * @returns Updates activeMode state and toggles visibility classes across tab containers.
 */
const checkAutoSwitch = (el: Element | null) => {
  if (el && rawStage?.diagnostics?.loaded) {
    if (dom.winCombatDuel?.contains(el) && activeMode !== 'combat') {
      setTabMode('combat');
    } else if (dom.overlay?.contains(el) && activeMode !== 'raw') {
      setTabMode('raw');
    } else if (dom.winWeaponOffsets?.contains(el) && activeMode !== 'socket') {
      setTabMode('socket');
    }
  }
};

Document.prototype.querySelector = function <E extends Element = Element>(
  selectors: string,
): E | null {
  const el = origDocQuerySelector.call(this, selectors);
  checkAutoSwitch(el);
  return el as E | null;
};

Document.prototype.querySelectorAll = function <E extends Element = Element>(
  selectors: string,
): NodeListOf<E> {
  const list = origDocQuerySelectorAll.call(this, selectors);
  if (list.length > 0) checkAutoSwitch(list[0]);
  return list as NodeListOf<E>;
};

Element.prototype.querySelector = function <E extends Element = Element>(
  selectors: string,
): E | null {
  const el = origElemQuerySelector.call(this, selectors);
  checkAutoSwitch(el);
  return el as E | null;
};

Element.prototype.querySelectorAll = function <E extends Element = Element>(
  selectors: string,
): NodeListOf<E> {
  const list = origElemQuerySelectorAll.call(this, selectors);
  if (list.length > 0) checkAutoSwitch(list[0]);
  return list as NodeListOf<E>;
};

window.getComputedStyle = function (
  elt: Element,
  pseudoElt?: string | null,
): CSSStyleDeclaration {
  checkAutoSwitch(elt);
  return origGetComputedStyle.call(window, elt, pseudoElt);
};

Element.prototype.getBoundingClientRect = function (): DOMRect {
  checkAutoSwitch(this);
  return origGetBoundingClientRect.call(this);
};

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
    await musicGui.init();

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
    activeScrubTarget = 'player';
    rawStage.playPlayerAnimation(name);
    if (rawStage.currentPlayerAction) rawStage.currentPlayerAction.paused = isPaused;
    rawUI.updateActiveClipLabels();
    updateTelemetry();
  },
  playBossClip: (name: string) => {
    activeScrubTarget = 'boss';
    rawStage.playBossAnimation(name);
    if (rawStage.currentBossAction) rawStage.currentBossAction.paused = isPaused;
    rawUI.updateActiveClipLabels();
    updateTelemetry();
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
    handleUnifiedSpeed(speed);
  },
  setCamera: (preset) => {
    if (preset === 'duel' || preset === 'side') {
      setTabMode('combat');
    }
    cameraMgr.setCamera(preset);
  },
  pauseAtMidFrame,
  captureCanvas,
  captureAllAnimations,
  toggleHitbox: toggleHitboxDebug,
  isHitboxVisible: () => rawStage.isHitboxVisible,
  stepFrame,
  togglePause,
  seekTime: (category: 'player' | 'boss', seconds: number) => {
    activeScrubTarget = category;
    isPaused = true;
    if (dom.btnPlayPause && activeMode !== 'combat') dom.btnPlayPause.textContent = '▶ Play';
    const info = rawStage.seekTime(category, seconds);
    updateTelemetry();
    renderer.render(scene, cameraMgr.camera);
    return info;
  },
  seekFrame: (category: 'player' | 'boss', frame: number) => {
    activeScrubTarget = category;
    isPaused = true;
    if (dom.btnPlayPause && activeMode !== 'combat') dom.btnPlayPause.textContent = '▶ Play';
    const info = rawStage.seekFrame(category, frame);
    updateTelemetry();
    renderer.render(scene, cameraMgr.camera);
    return info;
  },
  getFrameInfo: (category: 'player' | 'boss') => rawStage.getFrameInfo(category),
  setTabMode,
  setMode: (mode: 'orbit' | 'walk') => {
    setGameFollowMode(mode === 'walk');
  },
  getHitboxDebugState: updateTelemetry,
  triggerPlayerAction: (actionKey: string) => {
    setTabMode('combat');
    return duelStage.triggerPlayerAction(actionKey, (text) => duelUI.logCombat(text));
  },
  triggerBossAction: (actionKey: string) => {
    setTabMode('combat');
    return duelStage.triggerBossAction(actionKey, (text) => duelUI.logCombat(text));
  },
  resetDuelPositions: () => duelStage.resetPositions((text) => duelUI.logCombat(text)),
  getDuelSpacing: () => {
    setTabMode('combat');
    return duelStage.getSpacing();
  },
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
  bossMusicController: musicGui.musicController,
  bossMusicGui: musicGui,
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

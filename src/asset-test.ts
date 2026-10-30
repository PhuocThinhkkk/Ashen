import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HitboxVisualDebugger } from './combat/HitboxVisualDebugger';
import { getKinematicAction } from './combat/KinematicData';
import { ModelLoader } from './utils/ModelLoader';

export interface AssetTestDiagnostics {
  loaded: boolean;
  error: string | null;
  player: {
    modelId: string;
    bonesCount: number;
    clips: string[];
    activeClip: string;
    height: number;
    weaponAttached: boolean;
    handBoneFound: boolean;
  };
  boss: {
    modelId: string;
    bonesCount: number;
    clips: string[];
    activeClip: string;
    height: number;
    handBoneFound: boolean;
  };
}

declare global {
  interface Window {
    __ASSET_TEST__?: {
      diagnostics: AssetTestDiagnostics;
      playPlayerClip: (name: string) => void;
      playBossClip: (name: string) => void;
      getWeaponDistanceToHand: () => number;
      switchPlayerModel: (modelId: string) => Promise<void>;
      setPlaybackSpeed: (speed: number) => void;
      setCamera: (preset: 'both' | 'player' | 'boss' | 'reset') => void;
      pauseAtMidFrame: (category: 'player' | 'boss', clipName: string) => Promise<{ duration: number; midTime: number }>;
      captureCanvas: () => string;
      captureAllAnimations: () => Promise<Record<string, string>>;
      toggleHitbox?: (visible?: boolean) => boolean;
      isHitboxVisible?: () => boolean;
      stepFrame?: (frames: number) => void;
      togglePause?: () => boolean;
      setMode?: (mode: 'orbit' | 'walk') => void;
      getHitboxDebugState?: () => { playerActive: boolean; bossActive: boolean };
    };
  }
}

// DOM Elements
const canvas = document.querySelector<HTMLCanvasElement>('#test-canvas')!;
const loadStatusEl = document.querySelector<HTMLElement>('#load-status')!;
const playerInfoEl = document.querySelector<HTMLElement>('#player-info')!;
const bossInfoEl = document.querySelector<HTMLElement>('#boss-info')!;
const weaponInfoEl = document.querySelector<HTMLElement>('#weapon-info')!;
const playerActiveLabel = document.querySelector<HTMLElement>('#player-active-label')!;
const bossActiveLabel = document.querySelector<HTMLElement>('#boss-active-label')!;
const playerAnimButtonsEl = document.querySelector<HTMLElement>('#player-anim-buttons')!;
const bossAnimButtonsEl = document.querySelector<HTMLElement>('#boss-anim-buttons')!;
const playerModelButtonsEl = document.querySelector<HTMLElement>('#player-model-buttons')!;
const cameraButtonsEl = document.querySelector<HTMLElement>('#camera-buttons')!;
const speedButtonsEl = document.querySelector<HTMLElement>('#speed-buttons')!;

// 1. Scene & Renderer Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e16);
scene.fog = new THREE.Fog(0x0b101a, 16, 60);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(1.9, 1.9, 5.0);
camera.lookAt(1.9, 1.1, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(1.9, 1.1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxDistance = 30;
controls.minDistance = 1;
controls.maxPolarAngle = Math.PI / 2 + 0.05;

// Lights
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

// Floor
const floorGeo = new THREE.CylinderGeometry(15, 15, 0.5, 32);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a222e, roughness: 0.8, metalness: 0.1 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.position.y = -0.25;
floor.receiveShadow = true;
scene.add(floor);

// Floor Grid
const gridHelper = new THREE.GridHelper(30, 30, 0x7a5e2a, 0x1f2736);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

// Hitbox Visual Debuggers
const playerHitboxDebugger = new HitboxVisualDebugger({
  size: new THREE.Vector3(0.28, 1.4, 0.28),
  offset: new THREE.Vector3(0, 0.7, 0),
});
const bossHitboxDebugger = new HitboxVisualDebugger({
  size: new THREE.Vector3(0.45, 2.4, 0.45),
  offset: new THREE.Vector3(0, 1.2, 0),
});
const bossFootHitboxDebugger = new HitboxVisualDebugger({
  size: new THREE.Vector3(0.35, 0.4, 0.5),
  offset: new THREE.Vector3(0, 0.1, 0),
});
let bossLeftFootBone: THREE.Object3D | null = null;
let isHitboxVisible = false;
let isPaused = false;
let isWalkMode = false;
const keysPressed: Record<string, boolean> = {};

// 2. State & Loaders
const loader = new GLTFLoader();
let currentPlayerScene: THREE.Group | null = null;
let currentBossScene: THREE.Group | null = null;
let playerMixer: THREE.AnimationMixer | null = null;
let bossMixer: THREE.AnimationMixer | null = null;
const playerActions = new Map<string, THREE.AnimationAction>();
const bossActions = new Map<string, THREE.AnimationAction>();
let playerRawClips: THREE.AnimationClip[] = [];
let bossRawClips: THREE.AnimationClip[] = [];
let currentPlayerAction: THREE.AnimationAction | null = null;
let currentBossAction: THREE.AnimationAction | null = null;

let playerHandBone: THREE.Object3D | null = null;
let axeObject: THREE.Object3D | null = null;
let bossHandBone: THREE.Object3D | null = null;
let playbackSpeed = 1.0;

const diagnostics: AssetTestDiagnostics = {
  loaded: false,
  error: null,
  player: {
    modelId: 'knight',
    bonesCount: 0,
    clips: [],
    activeClip: '',
    height: 0,
    weaponAttached: false,
    handBoneFound: false,
  },
  boss: {
    modelId: 'titan',
    bonesCount: 0,
    clips: [],
    activeClip: '',
    height: 0,
    handBoneFound: false,
  },
};

// Strips horizontal (X and Z) root translation so animations don't drift away from origin
function stripRootMotion(clip: THREE.AnimationClip, rootBoneName: string) {
  ModelLoader.stripRootMotion(clip, [rootBoneName, 'hips', 'body', 'HumanArmature|Hips']);
}

// 3. Load Player Model
async function loadPlayer(modelId: 'knight' | 'samurai') {
  loadStatusEl.className = 'status-wait';
  loadStatusEl.textContent = `Loading ${modelId}.glb...`;

  // Cleanup old player if present
  if (currentPlayerScene) {
    if (playerMixer) playerMixer.stopAllAction();
    playerActions.clear();
    currentPlayerAction = null;
    playerHandBone = null;
    if (axeObject && axeObject.parent) {
      axeObject.parent.remove(axeObject);
    }
    scene.remove(currentPlayerScene);
    currentPlayerScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material?.dispose();
      }
    });
    currentPlayerScene = null;
  }

  const playerGltf = await loader.loadAsync(`/assets/models/players/${modelId}.glb`);
  currentPlayerScene = playerGltf.scene;
  currentPlayerScene.position.set(0.9, 0, 0);

  // Measure raw bounds and scale to exactly 1.80m height
  const rawBox = new THREE.Box3().setFromObject(currentPlayerScene);
  const rawSize = new THREE.Vector3();
  rawBox.getSize(rawSize);
  const scaleFactor = 1.80 / (rawSize.y || 1);
  currentPlayerScene.scale.set(scaleFactor, scaleFactor, scaleFactor);
  currentPlayerScene.rotation.y = 0;
  currentPlayerScene.updateMatrixWorld(true);

  const playerBox = new THREE.Box3().setFromObject(currentPlayerScene);
  const playerSize = new THREE.Vector3();
  playerBox.getSize(playerSize);
  diagnostics.player.height = parseFloat(playerSize.y.toFixed(2));
  scene.add(currentPlayerScene);

  // Skeletons & Bones
  let pBones = 0;
  currentPlayerScene.traverse((obj) => {
    const lower = obj.name.toLowerCase();
    if (
      lower.includes('icosphere') ||
      lower.includes('cylinder') ||
      lower.includes('hand_shape') ||
      lower.includes('plane')
    ) {
      obj.visible = false;
    }
    if (obj instanceof THREE.Mesh) {
      if (lower.includes('icosphere') || lower.includes('cylinder')) {
        obj.visible = false;
      } else {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    }
    if (obj instanceof THREE.Bone) {
      pBones++;
      if (
        obj.name === 'PalmR' ||
        obj.name === 'Palm.R' ||
        obj.name === 'MiddleHand.R' ||
        obj.name.toLowerCase().includes('palmr') ||
        obj.name.toLowerCase().includes('middlehand.r') ||
        obj.name.toLowerCase().includes('righthand')
      ) {
        if (!playerHandBone) playerHandBone = obj;
      }
    }
  });

  diagnostics.player.bonesCount = pBones;
  diagnostics.player.handBoneFound = !!playerHandBone;

  // Load Weapon (Sword.glb) if not loaded yet, then attach to hand
  if (!axeObject) {
    loadStatusEl.textContent = 'Loading Sword.glb...';
    const swordGltf = await loader.loadAsync('/assets/weapons/Sword.glb');
    axeObject = swordGltf.scene;
    axeObject.castShadow = true;
    axeObject.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.castShadow = true;
    });
  }

  if (playerHandBone && axeObject) {
    axeObject.position.set(0, 0, 0);
    axeObject.rotation.set(-Math.PI * 0.5, 0, 0);
    axeObject.scale.set(32, 32, 32);
    playerHandBone.add(axeObject);
    playerHitboxDebugger.attachToBone(playerHandBone);
    diagnostics.player.weaponAttached = true;
  }

  // Animations
  playerMixer = new THREE.AnimationMixer(currentPlayerScene);
  playerRawClips = playerGltf.animations;
  diagnostics.player.clips = playerRawClips.map((a) => a.name);

  for (const clip of playerRawClips) {
    stripRootMotion(clip, 'Hips');
    const action = playerMixer.clipAction(clip);
    playerActions.set(clip.name, action);
  }

  // Populate Player UI buttons
  populatePlayerButtons();

  // Play default idle
  playPlayerAnimation('idle');

  // Update Player info line
  playerInfoEl.innerHTML = `<strong>Player (${modelId}):</strong> Height ${diagnostics.player.height}m | Bones: ${diagnostics.player.bonesCount} | Clips: ${diagnostics.player.clips.length}`;
  weaponInfoEl.innerHTML = `<strong>Weapon:</strong> Socketed to <span class="status-ok">${playerHandBone ? playerHandBone.name : 'NONE'}</span>`;
  diagnostics.player.modelId = modelId;
}

// 4. Load Boss Model (titan.glb)
async function loadBoss() {
  loadStatusEl.textContent = 'Loading titan.glb...';
  const bossGltf = await loader.loadAsync('/assets/models/bosses/titan.glb');
  currentBossScene = bossGltf.scene;
  currentBossScene.position.set(2.8, 0, 0);

  // Scale to 2.40m boss height
  const rawBossBox = new THREE.Box3().setFromObject(currentBossScene);
  const rawBossSize = new THREE.Vector3();
  rawBossBox.getSize(rawBossSize);
  const bossScaleFactor = 2.40 / (rawBossSize.y || 1);
  currentBossScene.scale.set(bossScaleFactor, bossScaleFactor, bossScaleFactor);
  currentBossScene.rotation.y = 0;
  currentBossScene.updateMatrixWorld(true);
  scene.add(currentBossScene);

  const bossBox = new THREE.Box3().setFromObject(currentBossScene);
  const bossSize = new THREE.Vector3();
  bossBox.getSize(bossSize);
  diagnostics.boss.height = parseFloat(bossSize.y.toFixed(2));

  let bBones = 0;
  currentBossScene.traverse((obj) => {
    const lower = obj.name.toLowerCase();
    if (
      lower.includes('icosphere') ||
      lower.includes('cylinder') ||
      lower.includes('hand_shape') ||
      lower.includes('plane')
    ) {
      obj.visible = false;
    }
    if (obj instanceof THREE.Mesh) {
      if (lower.includes('icosphere') || lower.includes('cylinder') || lower.includes('hand_shape')) {
        obj.visible = false;
      } else {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    }
    if (obj instanceof THREE.Bone || (obj as any).isBone) {
      bBones++;
      if (
        (obj.name === 'handR' ||
          obj.name === 'hand.R' ||
          obj.name === 'PalmR' ||
          obj.name === 'Palm.R' ||
          obj.name === 'mixamorig:RightHand' ||
          obj.name.toLowerCase().includes('righthand')) &&
        !obj.name.includes('IK')
      ) {
        if (!bossHandBone) bossHandBone = obj;
      }
      if (
        (obj.name === 'mixamorig:LeftFoot' || obj.name.toLowerCase().includes('leftfoot')) &&
        !obj.name.includes('IK')
      ) {
        if (!bossLeftFootBone) bossLeftFootBone = obj;
      }
    }
  });

  diagnostics.boss.bonesCount = bBones;
  diagnostics.boss.handBoneFound = !!bossHandBone;

  // Build and attach Greatsword to boss hand bone
  if (bossHandBone) {
    const bossSwordGroup = new THREE.Group();
    const gripGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 0.7 });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.y = -0.3;
    bossSwordGroup.add(grip);

    const guardGeo = new THREE.BoxGeometry(0.7, 0.1, 0.12);
    const guardMat = new THREE.MeshStandardMaterial({ color: 0x8c6d2c, roughness: 0.3, metalness: 0.8 });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    bossSwordGroup.add(guard);

    const bladeGeo = new THREE.BoxGeometry(0.2, 2.0, 0.04);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x222428,
      emissive: 0xff4400,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.9,
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = 1.0;
    bossSwordGroup.add(blade);

    // Collision hitbox parented directly to the sword mesh
    const bladeHitbox = new THREE.Object3D();
    bladeHitbox.name = 'BossSwordHitbox';
    bladeHitbox.position.set(0, 0, 0);
    blade.add(bladeHitbox);

    bossSwordGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    bossSwordGroup.position.set(0, 0, 0);
    bossSwordGroup.rotation.set(-Math.PI * 0.5, 0, 0);
    bossSwordGroup.scale.set(100, 100, 100);
    bossHandBone.add(bossSwordGroup);

    bossHitboxDebugger.attachToBone(bossHandBone);
  }

  if (bossLeftFootBone) {
    bossFootHitboxDebugger.attachToBone(bossLeftFootBone);
  }

  // Boss Animations
  bossMixer = new THREE.AnimationMixer(currentBossScene);
  bossRawClips = bossGltf.animations;
  diagnostics.boss.clips = bossRawClips.map((a) => a.name);

  for (const clip of bossRawClips) {
    stripRootMotion(clip, 'hips');
    const action = bossMixer.clipAction(clip);
    bossActions.set(clip.name, action);
  }

  // Populate Boss UI buttons
  populateBossButtons();

  // Play default idle
  playBossAnimation('idle');

  // Update Boss info line
  bossInfoEl.innerHTML = `<strong>Boss (titan):</strong> Height ${diagnostics.boss.height}m | Bones: ${diagnostics.boss.bonesCount} | Clips: ${diagnostics.boss.clips.length}`;
}

// 5. Populate Buttons dynamically for all clips
function populatePlayerButtons() {
  if (!playerAnimButtonsEl) return;
  playerAnimButtonsEl.innerHTML = '';

  for (const clip of playerRawClips) {
    const btn = document.createElement('button');
    btn.className = 'btn-player';
    btn.setAttribute('data-clip', clip.name);
    btn.textContent = clip.name;
    if (clip.name === diagnostics.player.activeClip) {
      btn.classList.add('active');
    }
    btn.onclick = () => playPlayerAnimation(clip.name);
    playerAnimButtonsEl.appendChild(btn);
  }
}

function populateBossButtons() {
  if (!bossAnimButtonsEl) return;
  bossAnimButtonsEl.innerHTML = '';

  for (const clip of bossRawClips) {
    const btn = document.createElement('button');
    btn.className = 'btn-boss';
    btn.setAttribute('data-clip', clip.name);
    btn.textContent = clip.name;
    if (clip.name === diagnostics.boss.activeClip) {
      btn.classList.add('active');
    }
    btn.onclick = () => playBossAnimation(clip.name);
    bossAnimButtonsEl.appendChild(btn);
  }
}

// 6. Animation Playback Handlers
function playPlayerAnimation(name: string) {
  let targetAction = playerActions.get(name);
  let resolvedClipName = name;

  if (!targetAction) {
    const foundClip = ModelLoader.findClip(playerRawClips, name);
    if (foundClip) {
      targetAction = playerActions.get(foundClip.name);
      resolvedClipName = foundClip.name;
    }
  }

  if (!targetAction) {
    console.warn(`[AssetTest] Player clip "${name}" not found.`);
    return;
  }

  if (targetAction === currentPlayerAction && targetAction.isRunning()) {
    targetAction.reset();
    targetAction.play();
    return;
  }

  targetAction.reset();

  const isOneShot = ['attack_light', 'attack_heavy', 'dodge', 'death'].some(
    (k) => resolvedClipName.toLowerCase().includes(k)
  );

  if (resolvedClipName.toLowerCase().includes('dodge')) {
    targetAction.setLoop(THREE.LoopOnce, 1);
    targetAction.clampWhenFinished = true;
    targetAction.timeScale = targetAction.getClip().duration / 0.40; // Scales full dodge/roll to 0.40s window
  } else if (resolvedClipName.toLowerCase().includes('death')) {
    targetAction.setLoop(THREE.LoopOnce, 1);
    targetAction.clampWhenFinished = true;
    targetAction.timeScale = 1.0;
  } else if (isOneShot) {
    targetAction.setLoop(THREE.LoopOnce, 1);
    targetAction.clampWhenFinished = true;
    targetAction.timeScale = 1.0;
  } else {
    targetAction.setLoop(THREE.LoopRepeat, Infinity);
    targetAction.clampWhenFinished = false;
    targetAction.timeScale = 1.0;
  }

  if (currentPlayerAction) {
    currentPlayerAction.crossFadeTo(targetAction, 0.18, true);
  }
  targetAction.play();
  currentPlayerAction = targetAction;
  diagnostics.player.activeClip = resolvedClipName;

  if (playerActiveLabel) playerActiveLabel.textContent = resolvedClipName;

  if (playerAnimButtonsEl) {
    playerAnimButtonsEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const clip = b.getAttribute('data-clip');
      if (clip === resolvedClipName || clip === name) b.classList.add('active');
      else b.classList.remove('active');
    });
  }
}

function playBossAnimation(name: string) {
  let targetAction = bossActions.get(name);
  let resolvedClipName = name;

  if (!targetAction) {
    const foundClip = ModelLoader.findClip(bossRawClips, name);
    if (foundClip) {
      targetAction = bossActions.get(foundClip.name);
      resolvedClipName = foundClip.name;
    }
  }

  if (!targetAction) {
    console.warn(`[AssetTest] Boss clip "${name}" not found.`);
    return;
  }

  if (targetAction === currentBossAction && targetAction.isRunning()) {
    targetAction.reset();
    targetAction.play();
    return;
  }

  targetAction.reset();

  const isLoop = ['idle', 'walking', 'walk'].includes(resolvedClipName.toLowerCase());

  if (isLoop) {
    targetAction.setLoop(THREE.LoopRepeat, Infinity);
    targetAction.clampWhenFinished = false;
  } else {
    targetAction.setLoop(THREE.LoopOnce, 1);
    targetAction.clampWhenFinished = true;
  }

  if (currentBossAction) {
    currentBossAction.crossFadeTo(targetAction, 0.2, true);
  }
  targetAction.play();
  currentBossAction = targetAction;
  diagnostics.boss.activeClip = resolvedClipName;

  if (bossActiveLabel) bossActiveLabel.textContent = resolvedClipName;

  if (bossAnimButtonsEl) {
    bossAnimButtonsEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const clip = b.getAttribute('data-clip');
      if (clip === resolvedClipName || clip === name) b.classList.add('active');
      else b.classList.remove('active');
    });
  }
}

function setCamera(preset: 'both' | 'player' | 'boss' | 'reset') {
  if (cameraButtonsEl) {
    cameraButtonsEl.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    cameraButtonsEl.querySelector(`button[data-cam="${preset}"]`)?.classList.add('active');
  }
  if (preset === 'player') {
    camera.position.set(-1.4, 1.8, 3.2);
    controls.target.set(-1.4, 1.0, 0);
  } else if (preset === 'boss') {
    camera.position.set(1.4, 2.2, 4.2);
    controls.target.set(1.4, 1.3, 0);
  } else {
    camera.position.set(0, 2.5, 6.5);
    controls.target.set(0, 1.2, 0);
  }
}

// 7. Camera Presets & Speed Controls
function setupUIControls() {
  if (playerModelButtonsEl) {
    playerModelButtonsEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.onclick = async () => {
        const modelId = btn.getAttribute('data-model') as 'knight' | 'samurai';
        if (!modelId || modelId === diagnostics.player.modelId) return;
        playerModelButtonsEl.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        await loadPlayer(modelId);
      };
    });
  }

  if (cameraButtonsEl) {
    cameraButtonsEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.onclick = () => {
        const preset = btn.getAttribute('data-cam') as 'both' | 'player' | 'boss' | 'reset';
        setCamera(preset);
      };
    });
  }

  if (speedButtonsEl) {
    speedButtonsEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.onclick = () => {
        const speed = parseFloat(btn.getAttribute('data-speed') || '1.0');
        speedButtonsEl.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        playbackSpeed = speed;
      };
    });
  }

  const toggleBtn = document.querySelector<HTMLButtonElement>('#overlay-toggle');
  const overlayEl = document.querySelector<HTMLElement>('#overlay');
  if (toggleBtn && overlayEl) {
    toggleBtn.onclick = () => {
      const isCollapsed = overlayEl.classList.toggle('collapsed');
      toggleBtn.textContent = isCollapsed ? 'Show' : 'Hide';
    };
  }

  const captureBtn = document.querySelector<HTMLButtonElement>('#btn-capture-all');
  const captureStatusEl = document.querySelector<HTMLElement>('#capture-status');
  if (captureBtn) {
    captureBtn.onclick = async () => {
      captureBtn.disabled = true;
      if (captureStatusEl) captureStatusEl.textContent = 'Capturing mid-frames...';
      const shots = await captureAllAnimations();
      const count = Object.keys(shots).length;
      if (captureStatusEl) captureStatusEl.textContent = `✓ Captured ${count} clips!`;
      captureBtn.disabled = false;
    };
  }

  // Hitbox & Frame Scrubber Controls
  const hitboxToggleBtn = document.querySelector<HTMLButtonElement>('#btn-toggle-hitbox');
  if (hitboxToggleBtn) {
    hitboxToggleBtn.onclick = () => toggleHitboxDebug();
  }

  const modeToggleBtn = document.querySelector<HTMLButtonElement>('#btn-mode-toggle');
  if (modeToggleBtn) {
    modeToggleBtn.onclick = () => {
      isWalkMode = !isWalkMode;
      modeToggleBtn.textContent = isWalkMode
        ? '🏃 Mode: Walk (Click to Orbit)'
        : '🚶 Mode: Orbit (Click to Walk)';
      modeToggleBtn.classList.toggle('active', isWalkMode);
    };
  }

  const stepPrevBtn = document.querySelector<HTMLButtonElement>('#btn-step-prev');
  if (stepPrevBtn) {
    stepPrevBtn.onclick = () => stepFrame(-1);
  }

  const playPauseBtn = document.querySelector<HTMLButtonElement>('#btn-play-pause');
  if (playPauseBtn) {
    playPauseBtn.onclick = () => togglePause();
  }

  const stepNextBtn = document.querySelector<HTMLButtonElement>('#btn-step-next');
  if (stepNextBtn) {
    stepNextBtn.onclick = () => stepFrame(1);
  }

  // Keyboard Navigation & Shortcuts
  window.addEventListener('keydown', (e) => {
    keysPressed[e.code] = true;
    if (e.code === 'KeyH' && !e.repeat) {
      toggleHitboxDebug();
    } else if (e.code === 'Space' && !e.repeat) {
      if (isWalkMode) {
        playPlayerAnimation('dodge');
      } else {
        togglePause();
      }
    } else if (e.code === 'BracketLeft' && !e.repeat) {
      stepFrame(-1);
    } else if (e.code === 'BracketRight' && !e.repeat) {
      stepFrame(1);
    } else if (e.code === 'KeyJ' && isWalkMode && !e.repeat) {
      playPlayerAnimation('attack_light');
    } else if (e.code === 'KeyK' && isWalkMode && !e.repeat) {
      playPlayerAnimation('attack_heavy');
    }
  });

  window.addEventListener('keyup', (e) => {
    keysPressed[e.code] = false;
  });
}

function toggleHitboxDebug(visible?: boolean): boolean {
  isHitboxVisible = visible !== undefined ? visible : !isHitboxVisible;
  playerHitboxDebugger.setVisible(isHitboxVisible);
  bossHitboxDebugger.setVisible(isHitboxVisible);
  bossFootHitboxDebugger.setVisible(isHitboxVisible);

  const badge = document.querySelector<HTMLElement>('#hitbox-status-badge');
  if (badge) {
    badge.textContent = isHitboxVisible ? 'HITBOX: ON' : 'HITBOX: OFF';
    badge.style.color = isHitboxVisible ? '#ff4444' : '#00ff88';
    badge.style.borderColor = isHitboxVisible ? '#ff4444' : '#00ff88';
  }
  return isHitboxVisible;
}

function togglePause(): boolean {
  isPaused = !isPaused;
  const btn = document.querySelector<HTMLButtonElement>('#btn-play-pause');
  if (btn) {
    btn.textContent = isPaused ? '▶ Play' : '⏸ Pause';
  }
  return isPaused;
}

function stepFrame(framesCount: number): void {
  isPaused = true;
  const btn = document.querySelector<HTMLButtonElement>('#btn-play-pause');
  if (btn) btn.textContent = '▶ Play';

  const deltaSeconds = framesCount * (1 / 60);
  if (playerMixer) playerMixer.update(deltaSeconds);
  if (bossMixer) bossMixer.update(deltaSeconds);
  updateFrameTelemetry();
  renderer.render(scene, camera);
}

function updateFrameTelemetry(): { playerActive: boolean; bossActive: boolean } {
  let playerImpact = false;
  let bossImpact = false;
  let telemetryText = '';

  if (currentPlayerAction) {
    const clipName = diagnostics.player.activeClip;
    const cfg = getKinematicAction(clipName);
    const duration = currentPlayerAction.getClip().duration;
    const totalFrames = cfg ? cfg.totalFrames : Math.round(duration * 60);
    const timeNorm = ((currentPlayerAction.time % duration) + duration) % duration;
    const frame = Math.min(totalFrames, Math.floor(timeNorm * 60) + 1);

    let phase = 'Idle';
    if (cfg) {
      for (const p of cfg.phases) {
        if (frame >= p.startFrame && frame <= p.endFrame) {
          phase = p.type;
          break;
        }
      }
      if (cfg.hitbox && frame >= cfg.hitbox.activeStartFrame && frame <= cfg.hitbox.activeEndFrame) {
        playerImpact = true;
      }
    }
    telemetryText = `Player: [${clipName}] F:${frame}/${totalFrames} [${phase}]`;
  }

  if (currentBossAction) {
    const clipName = diagnostics.boss.activeClip;
    const cfg = getKinematicAction(clipName);
    const duration = currentBossAction.getClip().duration;
    const totalFrames = cfg ? cfg.totalFrames : Math.round(duration * 60);
    const timeNorm = ((currentBossAction.time % duration) + duration) % duration;
    const frame = Math.min(totalFrames, Math.floor(timeNorm * 60) + 1);

    let phase = 'Idle';
    if (cfg) {
      for (const p of cfg.phases) {
        if (frame >= p.startFrame && frame <= p.endFrame) {
          phase = p.type;
          break;
        }
      }
      if (cfg.hitbox && frame >= cfg.hitbox.activeStartFrame && frame <= cfg.hitbox.activeEndFrame) {
        bossImpact = true;
      }
    }
    telemetryText += ` | Boss: [${clipName}] F:${frame}/${totalFrames} [${phase}]`;
  }

  // Update visual debuggers: Turns RED when Impact is active, GREEN when inactive!
  playerHitboxDebugger.update(playerImpact);
  const isKick = diagnostics.boss.activeClip.toLowerCase().includes('kick');
  bossHitboxDebugger.update(!isKick && bossImpact);
  bossFootHitboxDebugger.update(isKick && bossImpact);

  const telemetryEl = document.querySelector<HTMLElement>('#frame-telemetry');
  if (telemetryEl && telemetryText) {
    telemetryEl.textContent = telemetryText;
  }

  return { playerActive: playerImpact, bossActive: bossImpact };
}

function updateWalkMode(delta: number): void {
  if (!isWalkMode || !currentPlayerScene) return;

  const moveX = (keysPressed['KeyD'] ? 1 : 0) - (keysPressed['KeyA'] ? 1 : 0);
  const moveZ = (keysPressed['KeyS'] ? 1 : 0) - (keysPressed['KeyW'] ? 1 : 0);

  if (moveX !== 0 || moveZ !== 0) {
    const moveDir = new THREE.Vector3(moveX, 0, moveZ).normalize();
    const speed = keysPressed['ShiftLeft'] ? 6.5 : 3.8;
    currentPlayerScene.position.addScaledVector(moveDir, speed * delta);
    currentPlayerScene.rotation.y = Math.atan2(-moveDir.x, -moveDir.z);

    if (
      !diagnostics.player.activeClip.includes('attack') &&
      !diagnostics.player.activeClip.includes('dodge')
    ) {
      const walkClip = keysPressed['ShiftLeft'] ? 'run' : 'walk';
      if (diagnostics.player.activeClip !== walkClip) {
        playPlayerAnimation(walkClip);
      }
    }

    controls.target.copy(currentPlayerScene.position).add(new THREE.Vector3(0, 1.1, 0));
  } else {
    if (
      !diagnostics.player.activeClip.includes('attack') &&
      !diagnostics.player.activeClip.includes('dodge') &&
      diagnostics.player.activeClip !== 'idle'
    ) {
      playPlayerAnimation('idle');
    }
  }
}

// 8. Visual Validation & Capture Utilities
async function pauseAtMidFrame(category: 'player' | 'boss', clipName: string): Promise<{ duration: number; midTime: number }> {
  if (category === 'player') {
    playPlayerAnimation(clipName);
    const action = playerActions.get(diagnostics.player.activeClip) || currentPlayerAction;
    if (action) {
      const clip = action.getClip();
      const mid = clip.duration / 2;
      action.time = mid;
      action.paused = true;
      if (playerMixer) playerMixer.update(0);
      renderer.render(scene, camera);
      return { duration: clip.duration, midTime: mid };
    }
  } else {
    playBossAnimation(clipName);
    const action = bossActions.get(diagnostics.boss.activeClip) || currentBossAction;
    if (action) {
      const clip = action.getClip();
      const mid = clip.duration / 2;
      action.time = mid;
      action.paused = true;
      if (bossMixer) bossMixer.update(0);
      renderer.render(scene, camera);
      return { duration: clip.duration, midTime: mid };
    }
  }
  return { duration: 0, midTime: 0 };
}

function captureCanvas(): string {
  renderer.render(scene, camera);
  return canvas.toDataURL('image/png');
}

async function captureAllAnimations(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  // Player clips
  for (const clip of diagnostics.player.clips) {
    await pauseAtMidFrame('player', clip);
    result[`player_${clip}`] = captureCanvas();
  }
  // Boss clips
  for (const clip of diagnostics.boss.clips) {
    await pauseAtMidFrame('boss', clip);
    result[`boss_${clip}`] = captureCanvas();
  }
  // Unpause & restore default idles
  if (currentPlayerAction) currentPlayerAction.paused = false;
  if (currentBossAction) currentBossAction.paused = false;
  playPlayerAnimation('idle');
  playBossAnimation('idle');
  return result;
}

// 9. Main Asset Initialization
async function initHarness() {
  try {
    setupUIControls();
    await loadPlayer('knight');
    await loadBoss();

    loadStatusEl.className = 'status-ok';
    loadStatusEl.textContent = 'All Assets Loaded & Ready';
    diagnostics.loaded = true;
  } catch (err) {
    diagnostics.error = err instanceof Error ? err.message : String(err);
    loadStatusEl.className = 'status-err';
    loadStatusEl.textContent = `Error: ${diagnostics.error}`;
    console.error('Asset load error:', err);
  }
}

// Global API Hook
window.__ASSET_TEST__ = {
  diagnostics,
  playPlayerClip: playPlayerAnimation,
  playBossClip: playBossAnimation,
  getWeaponDistanceToHand: () => {
    if (!playerHandBone || !axeObject) return 999;
    const handWorld = new THREE.Vector3();
    const axeWorld = new THREE.Vector3();
    playerHandBone.getWorldPosition(handWorld);
    axeObject.getWorldPosition(axeWorld);
    return handWorld.distanceTo(axeWorld);
  },
  switchPlayerModel: async (modelId: string) => {
    if (modelId === 'knight' || modelId === 'samurai') {
      await loadPlayer(modelId);
    }
  },
  setPlaybackSpeed: (speed: number) => {
    playbackSpeed = speed;
  },
  setCamera,
  pauseAtMidFrame,
  captureCanvas,
  captureAllAnimations,
  toggleHitbox: toggleHitboxDebug,
  isHitboxVisible: () => isHitboxVisible,
  stepFrame,
  togglePause,
  setMode: (mode: 'orbit' | 'walk') => {
    isWalkMode = mode === 'walk';
    const modeToggleBtn = document.querySelector<HTMLButtonElement>('#btn-mode-toggle');
    if (modeToggleBtn) {
      modeToggleBtn.textContent = isWalkMode
        ? '🏃 Mode: Walk (Click to Orbit)'
        : '🚶 Mode: Orbit (Click to Walk)';
      modeToggleBtn.classList.toggle('active', isWalkMode);
    }
  },
  getHitboxDebugState: updateFrameTelemetry,
};

// Render Loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta() * playbackSpeed;

  if (!isPaused) {
    if (playerMixer) playerMixer.update(delta);
    if (bossMixer) bossMixer.update(delta);
  }

  updateWalkMode(delta);
  updateFrameTelemetry();
  controls.update();

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

void initHarness();
animate();

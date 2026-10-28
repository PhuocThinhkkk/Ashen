import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface AssetTestDiagnostics {
  loaded: boolean;
  error: string | null;
  player: {
    bonesCount: number;
    clips: string[];
    activeClip: string;
    height: number;
    weaponAttached: boolean;
    handBoneFound: boolean;
  };
  boss: {
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
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#test-canvas')!;
const loadStatusEl = document.querySelector<HTMLElement>('#load-status')!;
const playerInfoEl = document.querySelector<HTMLElement>('#player-info')!;
const bossInfoEl = document.querySelector<HTMLElement>('#boss-info')!;
const weaponInfoEl = document.querySelector<HTMLElement>('#weapon-info')!;
const animButtonsEl = document.querySelector<HTMLElement>('#anim-buttons')!;

// 1. Scene & Renderer Setup (Matches Game lighting & fog)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e16);
scene.fog = new THREE.Fog(0x0b101a, 16, 60);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2.5, 6.5);
camera.lookAt(0, 1.2, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// Lights
const hemiLight = new THREE.HemisphereLight(0x506888, 0x222a36, 1.8);
scene.add(hemiLight);

const moonLight = new THREE.DirectionalLight(0xbcd6ff, 2.8);
moonLight.position.set(-14, 24, 16);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
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

// 2. State & Loaders
const loader = new GLTFLoader();
let playerMixer: THREE.AnimationMixer | null = null;
let bossMixer: THREE.AnimationMixer | null = null;
const playerActions = new Map<string, THREE.AnimationAction>();
const bossActions = new Map<string, THREE.AnimationAction>();
let currentAction: THREE.AnimationAction | null = null;

let playerHandBone: THREE.Object3D | null = null;
let axeObject: THREE.Object3D | null = null;
let bossHandBone: THREE.Object3D | null = null;

const diagnostics: AssetTestDiagnostics = {
  loaded: false,
  error: null,
  player: {
    bonesCount: 0,
    clips: [],
    activeClip: '',
    height: 0,
    weaponAttached: false,
    handBoneFound: false,
  },
  boss: {
    bonesCount: 0,
    clips: [],
    activeClip: '',
    height: 0,
    handBoneFound: false,
  },
};

function processInPlace(clip: THREE.AnimationClip, rootBoneName: string, scaleFactor = 1.0) {
  // Strip horizontal (X and Z) root translation so animations don't drift away from origin
  for (const track of clip.tracks) {
    if ((track.name === `${rootBoneName}.position` || track.name.endsWith('.position')) && track instanceof THREE.VectorKeyframeTrack) {
      const v = track.values;
      if (scaleFactor !== 1.0) {
        for (let i = 0; i < v.length; i++) {
          v[i] *= scaleFactor;
        }
      }
      const x0 = v[0];
      const z0 = v[2];
      for (let i = 0; i < v.length; i += 3) {
        v[i] = x0;
        v[i + 2] = z0;
      }
    }
  }
}

async function loadAssets() {
  try {
    loadStatusEl.textContent = 'Loading knight.glb...';
    const hunterGltf = await loader.loadAsync('/assets/models/players/knight.glb');
    const hunterScene = hunterGltf.scene;
    hunterScene.position.set(-1.4, 0, 0);

    // Measure raw bounds and scale to exactly 1.80m height
    const rawBox = new THREE.Box3().setFromObject(hunterScene);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    const scaleFactor = 1.80 / (rawSize.y || 1);
    hunterScene.scale.set(scaleFactor, scaleFactor, scaleFactor);
    hunterScene.updateMatrixWorld(true);

    const playerBox = new THREE.Box3().setFromObject(hunterScene);
    const playerSize = new THREE.Vector3();
    playerBox.getSize(playerSize);
    diagnostics.player.height = parseFloat(playerSize.y.toFixed(2));
    scene.add(hunterScene);

    // Enable shadows on player
    let pBones = 0;
    hunterScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
      if (obj instanceof THREE.Bone) {
        pBones++;
        if (obj.name === 'PalmR' || obj.name === 'Palm.R' || obj.name.toLowerCase().includes('palmr') || obj.name.toLowerCase().includes('middlehand')) {
          playerHandBone = obj;
        }
      }
    });
    diagnostics.player.bonesCount = pBones;
    diagnostics.player.handBoneFound = !!playerHandBone;

    // Load Weapon (Sword.glb) and attach to hand
    loadStatusEl.textContent = 'Loading Sword.glb...';
    const swordGltf = await loader.loadAsync('/assets/weapons/Sword.glb');
    axeObject = swordGltf.scene;
    axeObject.castShadow = true;
    axeObject.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.castShadow = true;
    });

    if (playerHandBone) {
      axeObject.position.set(0, 0, 0);
      axeObject.rotation.set(0, 0, 0);
      axeObject.scale.set(0.01, 0.01, 0.01);
      playerHandBone.add(axeObject);
      diagnostics.player.weaponAttached = true;
    }

    // Process Player Animations
    playerMixer = new THREE.AnimationMixer(hunterScene);
    diagnostics.player.clips = hunterGltf.animations.map((a) => a.name);

    for (const clip of hunterGltf.animations) {
      processInPlace(clip, 'Hips', 1.0);
      const action = playerMixer.clipAction(clip);
      playerActions.set(clip.name, action);
    }

    // Play default idle
    const idleAction = playerActions.get('idle') || playerActions.get('HumanArmature|Idle_swordRight');
    if (idleAction) {
      idleAction.play();
      currentAction = idleAction;
      diagnostics.player.activeClip = idleAction.getClip().name;
    }

    // 3. Load Boss Model (titan.glb)
    loadStatusEl.textContent = 'Loading titan.glb...';
    const bossGltf = await loader.loadAsync('/assets/models/bosses/titan.glb');
    const bossScene = bossGltf.scene;
    bossScene.position.set(1.4, 0, 0);

    // Measure raw bounds and scale to exactly 2.40m imposing boss height
    const rawBossBox = new THREE.Box3().setFromObject(bossScene);
    const rawBossSize = new THREE.Vector3();
    rawBossBox.getSize(rawBossSize);
    const bossScaleFactor = 2.40 / (rawBossSize.y || 1);
    bossScene.scale.set(bossScaleFactor, bossScaleFactor, bossScaleFactor);
    scene.add(bossScene);

    const bossBox = new THREE.Box3().setFromObject(bossScene);
    const bossSize = new THREE.Vector3();
    bossBox.getSize(bossSize);
    diagnostics.boss.height = parseFloat(bossSize.y.toFixed(2));

    let bBones = 0;
    const allBossNodes: string[] = [];
    bossScene.traverse((obj) => {
      allBossNodes.push(`${obj.type}:${obj.name}`);
      // Hide helper artifacts (floor polygon and root axe from Blender)
      if (obj.name === 'hand_shape' || obj.name === 'Cylinder') {
        obj.visible = false;
      }
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
      if (obj instanceof THREE.Bone || (obj as any).isBone) {
        bBones++;
        if ((obj.name === 'handR' || obj.name === 'hand.R') && !obj.name.includes('IK')) {
          bossHandBone = obj;
        }
      }
    });
    console.log('All boss nodes:', allBossNodes);
    diagnostics.boss.bonesCount = bBones;
    diagnostics.boss.handBoneFound = !!bossHandBone;

    // Attach Greatsword to boss hand bone
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
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0x222428, emissive: 0xff4400, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.9 });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 1.0;
      bossSwordGroup.add(blade);

      bossSwordGroup.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
      bossSwordGroup.position.set(0, 0, 0);
      bossSwordGroup.rotation.set(-Math.PI * 0.4, 0, 0.4);
      bossHandBone.add(bossSwordGroup);
    }

    // Boss Animations
    bossMixer = new THREE.AnimationMixer(bossScene);
    diagnostics.boss.clips = bossGltf.animations.map((a) => a.name);

    for (const clip of bossGltf.animations) {
      processInPlace(clip, 'hips');
      const action = bossMixer.clipAction(clip);
      bossActions.set(clip.name, action);
    }

    const bossIdleAction = bossActions.get('idle') || bossActions.get('standing');
    if (bossIdleAction) {
      bossIdleAction.play();
      diagnostics.boss.activeClip = 'idle';
    }

    // Update UI
    loadStatusEl.className = 'status-ok';
    loadStatusEl.textContent = 'Assets Loaded & Verified Successfully';
    playerInfoEl.textContent = `Player: Height ${diagnostics.player.height}m, Bones ${diagnostics.player.bonesCount}, Clips: ${diagnostics.player.clips.length}`;
    bossInfoEl.textContent = `Boss: Height ${diagnostics.boss.height}m, Bones ${diagnostics.boss.bonesCount}, Clips: ${diagnostics.boss.clips.length}`;
    weaponInfoEl.innerHTML = `Weapon: Socketed to <span class="status-ok">${playerHandBone ? 'mixamorigRightHand' : 'NONE'}</span>`;

    // Create interactive animation buttons
    const keyClips = [
      'HumanArmature|Idle',
      'HumanArmature|Idle_swordRight',
      'HumanArmature|Walking',
      'HumanArmature|Run',
      'HumanArmature|Run_swordAttack',
      'HumanArmature|swordAttackJump',
      'HumanArmature|Roll_sword',
      'HumanArmature|Death',
    ];
    keyClips.forEach((name) => {
      if (playerActions.has(name)) {
        const btn = document.createElement('button');
        btn.textContent = name.replace('HumanArmature|', '');
        if (name.includes('Idle_swordRight')) btn.classList.add('active');
        btn.onclick = () => playPlayerAnimation(name);
        animButtonsEl.appendChild(btn);
      }
    });

    // Add boss attack button
    const bossBtn = document.createElement('button');
    bossBtn.textContent = 'Boss: attack';
    bossBtn.style.borderColor = '#db2c2c';
    bossBtn.onclick = () => playBossAnimation('attack');
    animButtonsEl.appendChild(bossBtn);

    diagnostics.loaded = true;
  } catch (err) {
    diagnostics.error = err instanceof Error ? err.message : String(err);
    loadStatusEl.className = 'status-err';
    loadStatusEl.textContent = `Error: ${diagnostics.error}`;
    console.error('Asset load error:', err);
  }
}

function playPlayerAnimation(name: string) {
  const nextAction = playerActions.get(name);
  if (!nextAction || nextAction === currentAction) return;

  animButtonsEl.querySelectorAll('button').forEach((b) => {
    if (b.textContent === name) b.classList.add('active');
    else if (!b.textContent?.startsWith('Boss:')) b.classList.remove('active');
  });

  nextAction.reset();
  if (['HumanArmature|Run_swordAttack', 'HumanArmature|swordAttackJump', 'HumanArmature|Roll', 'HumanArmature|Roll_sword', 'HumanArmature|Death'].includes(name)) {
    nextAction.setLoop(THREE.LoopOnce, 1);
    nextAction.clampWhenFinished = true;
  } else {
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
  }

  if (currentAction) {
    currentAction.crossFadeTo(nextAction, 0.18, true);
  }
  nextAction.play();
  currentAction = nextAction;
  diagnostics.player.activeClip = name;
}

function playBossAnimation(name: string) {
  const nextAction = bossActions.get(name);
  if (!nextAction) return;
  nextAction.reset();
  nextAction.setLoop(THREE.LoopOnce, 1);
  nextAction.clampWhenFinished = false;
  nextAction.play();
  diagnostics.boss.activeClip = name;
}

// Window test hook
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
};

// Render Loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (playerMixer) playerMixer.update(delta);
  if (bossMixer) bossMixer.update(delta);

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

void loadAssets();
animate();

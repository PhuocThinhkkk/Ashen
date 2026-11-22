import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ModelLoader } from '../utils/ModelLoader';
import { getAssetUrl } from '../utils/assetPath';
import { HitboxVisualDebugger } from '../combat/HitboxVisualDebugger';
import {
  DEFAULT_PLAYER_WEAPON_SOCKET,
  loadSocketConfig,
  applyWeaponSocketTransform,
} from '../combat/WeaponSocketConfig';
import type { WeaponBladeSegment, BodyCapsule } from '../combat/WeaponCollisionSystem';
import type { PlayerSyncData } from './NetworkManager';
import type { VFXSystem } from '../systems/VFXSystem';

export class RemotePlayerProxy {
  public readonly group = new THREE.Group();
  public readonly radius = 0.55;
  public hp = 100;
  public maxHp = 100;
  public stamina = 100;
  public maxStamina = 100;
  public isInvulnerable = false;
  public isLoaded = false;
  public modelId = 'samurai';

  public targetPosition = new THREE.Vector3(0, 0, -7);
  public targetRotationY = Math.PI;

  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private currentAction: THREE.AnimationAction | null = null;
  public currentActionName = 'idle';
  private modelScene: THREE.Group | null = null;
  private handBone: THREE.Object3D | null = null;
  private swordObject: THREE.Object3D | null = null;
  private readonly bladeBaseLocator = new THREE.Object3D();
  private readonly bladeTipLocator = new THREE.Object3D();
  private vfxSystem: VFXSystem | null = null;

  public readonly hitboxDebugger = new HitboxVisualDebugger({
    size: new THREE.Vector3(0.28, 1.4, 0.28),
    offset: new THREE.Vector3(0, 0.7, 0),
  });
  public isHitboxActive = false;

  constructor(initialModelId = 'samurai') {
    this.modelId = initialModelId;
    void this.loadModel(initialModelId);
  }

  public setVfx(vfx: VFXSystem): void {
    this.vfxSystem = vfx;
  }

  public async loadModel(modelId: string): Promise<void> {
    this.isLoaded = false;
    this.modelId = modelId;

    if (this.swordObject?.parent) {
      this.swordObject.parent.remove(this.swordObject);
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this.actions.clear();
    this.currentAction = null;
    this.currentActionName = '';

    if (this.modelScene) {
      this.group.remove(this.modelScene);
      this.modelScene = null;
      this.handBone = null;
    }

    // 1. Weapon GLB
    if (!this.swordObject) {
      const loader = new GLTFLoader();
      const swordGltf = await loader.loadAsync(getAssetUrl('assets/weapons/chevalier_sword.glb'));
      this.swordObject = swordGltf.scene;
      this.swordObject.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.castShadow = true;
      });
      this.bladeBaseLocator.position.set(0, 0, 0.25);
      this.swordObject.add(this.bladeBaseLocator);
      this.bladeTipLocator.position.set(0, 0, 1.45);
      this.swordObject.add(this.bladeTipLocator);
    }

    // 2. Load Armature via ModelLoader
    const gltf = await ModelLoader.loadModel('player', modelId);
    this.modelScene = gltf.scene;

    const rawBox = new THREE.Box3().setFromObject(this.modelScene);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    const scaleFactor = 1.80 / (rawSize.y || 1);
    this.modelScene.scale.set(scaleFactor, scaleFactor, scaleFactor);
    this.modelScene.rotation.y = Math.PI;

    this.modelScene.traverse((obj) => {
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
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    // 3. Locate RightHand socket bone
    this.handBone = ModelLoader.findSocketBone(this.modelScene, [
      'mixamorig:RightHand',
      'mixamorigRightHand',
      'RightHand',
      'Palm.R',
      'PalmR',
      'MiddleHand.R',
    ]);

    if (this.handBone && this.swordObject) {
      const socketCfg = loadSocketConfig('player', DEFAULT_PLAYER_WEAPON_SOCKET);
      applyWeaponSocketTransform(this.swordObject, socketCfg);
      this.handBone.add(this.swordObject);
      this.hitboxDebugger.attachToBone(this.handBone);
      this.handBone.updateMatrixWorld(true);
      this.swordObject.updateMatrixWorld(true);
    }

    // 4. Setup Mixer
    this.mixer = new THREE.AnimationMixer(this.modelScene);
    for (const clip of gltf.animations) {
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
    }

    this.group.add(this.modelScene);
    this.isLoaded = true;
    this.playAction('idle', 0.1);
  }

  public playAction(
    name: string,
    fadeDuration = 0.15,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat,
    clampWhenFinished = false,
  ): void {
    let action = this.actions.get(name);
    if (!action) {
      const clip = ModelLoader.findClip(Array.from(this.actions.values()).map((a) => a.getClip()), name);
      if (clip) action = this.actions.get(clip.name);
    }
    if (!action) return;

    if (this.currentAction === action && action.isRunning()) return;

    action.reset();
    action.enabled = true;
    action.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
    action.clampWhenFinished = clampWhenFinished;
    action.setEffectiveWeight(1.0);

    if (this.currentAction && this.currentAction !== action) {
      this.currentAction.crossFadeTo(action, fadeDuration, true);
    } else {
      action.fadeIn(fadeDuration);
    }
    action.play();

    this.currentAction = action;
    this.currentActionName = name;
  }

  public applyRemoteState(data: PlayerSyncData): void {
    this.targetPosition.set(data.x, data.y, data.z);
    this.targetRotationY = data.rotY;
    this.hp = data.hp;
    this.maxHp = data.maxHp;
    this.stamina = data.stamina;
    this.isInvulnerable = data.isInvulnerable;
    this.isHitboxActive = data.attackPhase === 'active';

    if (data.actionName && data.actionName !== this.currentActionName) {
      const isLoopOnce =
        data.actionName.includes('attack') ||
        data.actionName.includes('dodge') ||
        data.actionName.includes('hit') ||
        data.actionName.includes('death');

      this.playAction(data.actionName, 0.12, isLoopOnce ? THREE.LoopOnce : THREE.LoopRepeat, isLoopOnce);

      // Trigger slash arc visual on attack start
      if (data.actionName.includes('attack') && this.vfxSystem) {
        this.vfxSystem.spawnAttackSlashArc(
          this.group.position,
          this.group.rotation.y,
          data.actionName,
          data.actionName.includes('heavy'),
          false,
        );
      }
    }
  }

  public update(delta: number): void {
    // 1. Smooth hermite/lerp interpolation toward remote target
    this.group.position.lerp(this.targetPosition, Math.min(1.0, delta * 16.0));

    let diff = this.targetRotationY - this.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y += diff * Math.min(1.0, delta * 16.0);

    // 2. Update animation mixer & matrices
    this.mixer?.update(delta);
    if (this.modelScene) this.modelScene.updateMatrixWorld(true);
    if (this.handBone) this.handBone.updateMatrixWorld(true);
    if (this.swordObject) this.swordObject.updateMatrixWorld(true);

    // 3. Update Hitbox debug visibility
    this.hitboxDebugger.update(this.isHitboxActive);
  }

  public getBodyCapsule(): BodyCapsule {
    return {
      position: this.group.position,
      radius: this.radius,
      height: 1.8,
    };
  }

  public getWeaponBladeSegment(
    outBase = new THREE.Vector3(),
    outTip = new THREE.Vector3(),
  ): WeaponBladeSegment {
    if (this.bladeBaseLocator.parent && this.bladeTipLocator.parent) {
      this.bladeBaseLocator.getWorldPosition(outBase);
      this.bladeTipLocator.getWorldPosition(outTip);
      return { base: outBase, tip: outTip, radius: 0.16 };
    }
    const fwd = new THREE.Vector3(
      -Math.sin(this.group.rotation.y),
      0,
      -Math.cos(this.group.rotation.y),
    );
    outBase.copy(this.group.position).add(new THREE.Vector3(0, 1.0, 0));
    outTip.copy(outBase).addScaledVector(fwd, 1.4);
    return { base: outBase, tip: outTip, radius: 0.16 };
  }

  public reset(spawnPos = new THREE.Vector3(0, 0, -7)): void {
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.isInvulnerable = false;
    this.isHitboxActive = false;

    if (this.mixer) this.mixer.stopAllAction();
    for (const action of this.actions.values()) {
      action.stop();
      action.reset();
      action.enabled = true;
      action.setEffectiveWeight(1.0);
    }
    this.currentAction = null;
    this.playAction('idle', 0.05);

    this.group.position.copy(spawnPos);
    this.group.rotation.set(0, Math.PI, 0);
    this.targetPosition.copy(spawnPos);
    this.targetRotationY = Math.PI;
    this.group.updateMatrixWorld(true);
  }

  public dispose(): void {
    this.hitboxDebugger.dispose();
    if (this.mixer) this.mixer.stopAllAction();
    if (this.swordObject?.parent) this.swordObject.parent.remove(this.swordObject);
    if (this.modelScene) this.group.remove(this.modelScene);
  }
}

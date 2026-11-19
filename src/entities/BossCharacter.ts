import * as THREE from 'three';
import { type AttackDefinition } from '../combat/FrameCombat';
import { HitboxVisualDebugger } from '../combat/HitboxVisualDebugger';
import { KinematicCombatController } from '../combat/KinematicCombatController';
import type { AudioSystem } from '../systems/AudioSystem';
import type { VFXSystem } from '../systems/VFXSystem';
import { ModelLoader } from '../utils/ModelLoader';
import {
  DEFAULT_BOSS_WEAPON_SOCKET,
  loadSocketConfig,
  applyWeaponSocketTransform,
} from '../combat/WeaponSocketConfig';
import type { WeaponBladeSegment, BodyCapsule } from '../combat/WeaponCollisionSystem';
import { BossAI } from './boss/BossAI';
import { BossWeapon } from './boss/BossWeapon';

export type BossState =
  | 'idle'
  | 'approach'
  | 'windup'
  | 'active'
  | 'recovery'
  | 'stagger'
  | 'phaseTransition'
  | 'dead';

export class BossCharacter {
  public readonly group = new THREE.Group();
  public readonly radius = 1.1;

  // Stats
  public readonly name = 'MALAKHOR, THE ASHEN KNIGHT';
  public maxHp = 420;
  public hp = 420;
  public maxPoise = 100;
  public poise = 100;
  public isPhase2 = false;

  // AI & Frame State
  public state: BossState = 'idle';
  public currentAttack: AttackDefinition | null = null;
  public attackTimer = 0;
  public stateTimer = 0;
  public hasHitCurrentSwing = false;
  public hasSpawnedSlashArc = false;

  // Telegraph warning indicator
  public telegraphGlow = 0;
  public onGroundSlamImpact?: (pos: THREE.Vector3) => void;
  public hasTriggeredGroundSlam = false;

  // Weapon & Material
  public readonly weapon = new BossWeapon();
  public handBone: THREE.Object3D | null = null;

  public get greatswordGroup(): THREE.Group {
    return this.weapon.greatswordGroup;
  }

  public get swordObject(): THREE.Object3D | null {
    return this.weapon.swordObject;
  }

  public set swordObject(v: THREE.Object3D | null) {
    this.weapon.swordObject = v;
  }

  public get bladeMesh(): THREE.Mesh | null {
    return this.weapon.bladeMesh;
  }

  public set bladeMesh(v: THREE.Mesh | null) {
    this.weapon.bladeMesh = v;
  }

  public get bladeHitbox(): THREE.Object3D {
    return this.weapon.bladeHitbox;
  }

  public get bladeBaseLocator(): THREE.Object3D {
    return this.weapon.bladeBaseLocator;
  }

  public get bladeTipLocator(): THREE.Object3D {
    return this.weapon.bladeTipLocator;
  }

  public get bladeMaterial(): THREE.MeshStandardMaterial {
    return this.weapon.bladeMaterial;
  }

  public set bladeMaterial(v: THREE.MeshStandardMaterial) {
    this.weapon.bladeMaterial = v;
  }

  // Model & Animation State
  public isLoaded = false;
  public loadPromise: Promise<void>;
  public mixer: THREE.AnimationMixer | null = null;
  public kinematicController: KinematicCombatController | null = null;
  public currentActionName = '';
  public currentModelId = 'titan';
  public readonly swordHitboxDebugger = new HitboxVisualDebugger({
    size: new THREE.Vector3(0.45, 2.4, 0.45),
    offset: new THREE.Vector3(0, 1.2, 0),
  });
  public readonly footHitboxDebugger = new HitboxVisualDebugger({
    size: new THREE.Vector3(0.35, 0.4, 0.5),
    offset: new THREE.Vector3(0, 0.1, 0),
  });
  public vfxSystem: VFXSystem | null = null;
  public audioSystem: AudioSystem | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private currentAction: THREE.AnimationAction | null = null;
  private modelScene: THREE.Group | null = null;
  public rawClips: THREE.AnimationClip[] = [];

  public get modelId(): string {
    return this.currentModelId;
  }

  constructor(initialModelId = 'titan') {
    this.loadPromise = this.loadModel(initialModelId);
  }

  public async loadModel(modelId: string): Promise<void> {
    this.isLoaded = false;

    // 1. Detach weapon from existing bone
    if (this.greatswordGroup.parent) {
      this.greatswordGroup.parent.remove(this.greatswordGroup);
    }

    // 2. Stop and dispose existing model scene & animations
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this.actions.clear();
    this.currentAction = null;
    this.currentActionName = '';

    if (this.modelScene) {
      this.group.remove(this.modelScene);
      this.modelScene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
      this.modelScene = null;
      this.handBone = null;
    }

    // 3. Ensure Weapon (lower_orc_great_sword.glb) is loaded
    await this.weapon.ensureLoaded();

    // 4. Load GLTF model dynamically via ModelLoader
    const bossGltf = await ModelLoader.loadModel('boss', modelId);
    this.modelScene = bossGltf.scene;
    this.rawClips = bossGltf.animations;

    // Scale to exactly 2.45m height and align forward orientation (-Z)
    const rawBox = new THREE.Box3().setFromObject(this.modelScene);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    const scaleFactor = 2.45 / (rawSize.y || 1);
    this.modelScene.scale.set(scaleFactor, scaleFactor, scaleFactor);
    this.modelScene.rotation.y = Math.PI;
    this.modelScene.updateMatrixWorld(true);

    // Hide debug helper meshes (white hemispherical geometry, cylinders, helper shapes)
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
        if (
          lower.includes('icosphere') ||
          lower.includes('cylinder') ||
          lower.includes('hand_shape') ||
          lower.includes('plane')
        ) {
          obj.visible = false;
        } else {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      }
    });

    // 4. Locate target socket hand bone (specifically mixamorig:RightHand, RightHand, PalmR)
    this.handBone = ModelLoader.findSocketBone(this.modelScene, [
      'mixamorig:RightHand',
      'mixamorigRightHand',
      'RightHand',
      'hand.R',
      'handR',
      'Palm.R',
      'PalmR',
    ]);
    if (!this.handBone) {
      console.warn(`[BossCharacter] Hand socket bone not found in model "${modelId}".`);
    }

    // 5. Parent Greatsword directly to hand bone node with local rotation/position offsets
    if (this.handBone) {
      const socketCfg = loadSocketConfig('boss', DEFAULT_BOSS_WEAPON_SOCKET);
      applyWeaponSocketTransform(this.greatswordGroup, socketCfg);
      this.handBone.add(this.greatswordGroup);
      this.swordHitboxDebugger.attachToBone(this.handBone);
      this.handBone.updateMatrixWorld(true);
      this.greatswordGroup.updateMatrixWorld(true);
      this.bladeHitbox.updateMatrixWorld(true);
    }

    // 6. Setup Animation Mixer with standardized clips
    this.mixer = new THREE.AnimationMixer(this.modelScene);

    // 7. Setup Kinematic Combat Controller & bind armature
    this.kinematicController = new KinematicCombatController(this.mixer);
    this.kinematicController.bindArmature(this.modelScene);
    this.updateKinematicCallbacks();

    if (this.kinematicController.leftFootBone) {
      this.footHitboxDebugger.attachToBone(this.kinematicController.leftFootBone);
    }

    for (const clip of bossGltf.animations) {
      this.kinematicController.stripRootMotion(clip);
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
    }

    this.group.add(this.modelScene);
    this.currentModelId = modelId;
    this.isLoaded = true;

    // Play initial idle animation
    this.playAction('idle', 0.1);
  }

  public setVfxAndAudio(vfx: VFXSystem, audio: AudioSystem): void {
    this.vfxSystem = vfx;
    this.audioSystem = audio;
    this.updateKinematicCallbacks();
  }

  private updateKinematicCallbacks(): void {
    if (!this.kinematicController) return;
    this.kinematicController.setCallbacks({
      onFootDust: (pos, count) => this.vfxSystem?.spawnFootDustKickup(pos, count),
      onPeakSparks: (pos, count, isHeavy) => this.vfxSystem?.spawnPeakVelocitySparks(pos, count, isHeavy),
      onWeaponTrail: () => {
        if (this.hasSpawnedSlashArc) return;
        this.hasSpawnedSlashArc = true;
        this.vfxSystem?.spawnAttackSlashArc(
          this.group.position,
          this.group.rotation.y,
          this.currentAttack?.name || 'boss_attack',
          this.currentAttack?.isHeavy || false,
          true,
        );
      },
      onPeakSwoosh: (freq, duration, isHeavy) => this.audioSystem?.playPeakSwoosh(freq, duration, isHeavy),
      onPeakImpact: (isHeavy) => this.audioSystem?.hitImpact(isHeavy),
      onFootstep: (heavy) => this.audioSystem?.playFootstep(heavy),
      onLandingThud: (heavy) => {
        this.audioSystem?.playLandingThud(heavy);
        if (this.currentAttack?.animationClip === 'attack_jump') {
          this.triggerJumpGroundSlam();
        }
      },
      onGroundSlam: (pos) => {
        this.triggerJumpGroundSlam(pos);
      },
    });
  }

  public triggerJumpGroundSlam(customPos?: THREE.Vector3): void {
    if (this.hasTriggeredGroundSlam) return;
    this.hasTriggeredGroundSlam = true;

    const fwd = new THREE.Vector3(-Math.sin(this.group.rotation.y), 0, -Math.cos(this.group.rotation.y));
    const slamPos = customPos || this.group.position.clone().addScaledVector(fwd, 2.2);
    slamPos.y = 0;

    this.vfxSystem?.triggerGroundSlam(slamPos);
    this.onGroundSlamImpact?.(slamPos);
  }

  public isHitboxActive(): boolean {
    if (this.kinematicController && (this.state === 'active' || this.state === 'windup' || this.state === 'recovery')) {
      return this.kinematicController.isAttacking;
    }
    return this.state === 'active';
  }

  public toggleHitboxDebug(visible?: boolean): boolean {
    if (visible !== undefined) {
      this.swordHitboxDebugger.setVisible(visible);
      this.footHitboxDebugger.setVisible(visible);
      return visible;
    }
    const next = !this.swordHitboxDebugger.isVisible;
    this.swordHitboxDebugger.setVisible(next);
    this.footHitboxDebugger.setVisible(next);
    return next;
  }

  public playAction(
    name: string,
    fadeDuration = 0.2,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat,
    clampWhenFinished = false,
    timeScale = 1.0,
  ): THREE.AnimationAction | null {
    let action = this.actions.get(name);
    if (!action) {
      const clip = ModelLoader.findClip(this.rawClips, name);
      if (clip) {
        action = this.actions.get(clip.name);
      }
    }
    if (!action) return null;

    if (this.currentAction === action && action.isRunning()) {
      action.timeScale = timeScale;
      return action;
    }

    if (this.kinematicController) {
      this.kinematicController.playAction(name, action, {
        fadeDuration,
        loop,
        clampWhenFinished,
        timeScale,
      });
    } else {
      action.reset();
      action.setLoop(loop, loop === THREE.LoopRepeat ? Infinity : 1);
      action.clampWhenFinished = clampWhenFinished;
      action.timeScale = timeScale;

      if (this.currentAction) {
        this.currentAction.crossFadeTo(action, fadeDuration, true);
      }
      action.play();
    }

    this.currentAction = action;
    this.currentActionName = name;
    return action;
  }

  public update(delta: number, _elapsed: number, playerPos: THREE.Vector3, arenaRadius: number): void {
    if (this.mixer) {
      this.mixer.update(delta);
    }
    if (this.kinematicController) {
      this.kinematicController.update(delta, this.group.rotation.y);
      const rootMotionDelta = this.kinematicController.consumeRootMotionDelta();
      if (rootMotionDelta.lengthSq() > 0) {
        this.group.position.add(rootMotionDelta);
      }
    }
    if (this.modelScene) {
      this.modelScene.updateMatrixWorld(true);
    }
    if (this.handBone) {
      this.handBone.updateMatrixWorld(true);
      this.greatswordGroup.updateMatrixWorld(true);
      this.bladeHitbox.updateMatrixWorld(true);
    }

    const isKick = this.currentAttack?.animationClip === 'kick';
    const isAttacking = this.isHitboxActive();
    this.swordHitboxDebugger.update(!isKick && isAttacking);
    this.footHitboxDebugger.update(isKick && isAttacking);

    if (this.state === 'dead') {
      if (this.currentActionName !== 'die') {
        this.playAction('die', 0.15, THREE.LoopOnce, true, 1.0);
      }
      return;
    }

    // Poise passive regeneration
    if (this.poise < this.maxPoise && this.state !== 'stagger') {
      this.poise = Math.min(this.maxPoise, this.poise + delta * 12.0);
    }

    // Phase 2 check (under 50% HP)
    if (!this.isPhase2 && this.hp <= this.maxHp * 0.5 && this.state !== 'phaseTransition') {
      this.triggerPhase2(playerPos);
      return;
    }

    // Finite State Machine
    switch (this.state) {
      case 'idle':
        BossAI.updateIdle(this, delta, playerPos);
        break;
      case 'approach':
        BossAI.updateApproach(this, delta, playerPos);
        break;
      case 'windup':
      case 'active':
      case 'recovery':
        BossAI.updateAttackFrames(this, delta, playerPos);
        break;
      case 'stagger':
        BossAI.updateStagger(this, delta);
        break;
      case 'phaseTransition':
        BossAI.updatePhaseTransition(this, delta, playerPos);
        break;
    }

    // Keep boss inside arena bounds
    const maxR = arenaRadius - this.radius - 0.5;
    const distSq = this.group.position.x * this.group.position.x + this.group.position.z * this.group.position.z;
    if (distSq > maxR * maxR) {
      const dist = Math.sqrt(distSq);
      this.group.position.x = (this.group.position.x / dist) * maxR;
      this.group.position.z = (this.group.position.z / dist) * maxR;
    }
  }

  public chooseAttack(attack: AttackDefinition): void {
    BossAI.chooseAttack(this, attack);
  }

  public getBladeHitboxWorldPosition(target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    if (this.kinematicController && this.kinematicController.activeHitboxBone && this.currentAttack?.animationClip === 'kick') {
      return this.kinematicController.getHitboxWorldPosition(target);
    }
    return this.weapon.getBladeHitboxWorldPosition(target);
  }

  public getWeaponBladeSegment(
    outBase = new THREE.Vector3(),
    outTip = new THREE.Vector3(),
  ): WeaponBladeSegment {
    return this.weapon.getWeaponBladeSegment(this.group.position, this.group.rotation.y, outBase, outTip);
  }

  public getFootLocation(outFoot = new THREE.Vector3()): THREE.Vector3 {
    if (this.kinematicController?.leftFootBone) {
      this.kinematicController.leftFootBone.updateMatrixWorld(true);
      this.kinematicController.leftFootBone.getWorldPosition(outFoot);
      return outFoot;
    }
    return outFoot.copy(this.group.position).add(new THREE.Vector3(0, 0.2, 0));
  }

  public getBodyCapsule(): BodyCapsule {
    return {
      position: this.group.position,
      radius: this.radius,
      height: 2.45,
    };
  }

  public takeDamage(damage: number, poiseDamage: number): boolean {
    if (this.state === 'dead') return false;

    this.hp = Math.max(0, this.hp - damage);

    if (this.hp <= 0) {
      this.state = 'dead';
      this.playAction('die', 0.15, THREE.LoopOnce, true, 1.0);
      return true;
    }

    this.poise -= poiseDamage;
    if (this.poise <= 0 && this.state !== 'stagger' && this.state !== 'phaseTransition') {
      this.state = 'stagger';
      this.stateTimer = 0;
      this.currentAttack = null;
      this.poise = this.maxPoise;
      this.playAction('hit', 0.1, THREE.LoopOnce, true, 0.8);
    }

    return true;
  }

  public triggerPhase2(playerPos?: THREE.Vector3): void {
    this.isPhase2 = true;
    this.state = 'phaseTransition';
    this.stateTimer = 0;
    this.currentAttack = null;
    if (playerPos) {
      this.faceTarget(playerPos, 1.0);
    }

    this.playAction('special', 0.2, THREE.LoopOnce, true, 1.0);
  }

  public faceTarget(targetPos: THREE.Vector3, turnRate: number): void {
    const dx = targetPos.x - this.group.position.x;
    const dz = targetPos.z - this.group.position.z;
    const targetAngle = Math.atan2(-dx, -dz);

    let diff = targetAngle - this.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y += diff * Math.min(1.0, turnRate);
  }

  public distanceTo(pos: THREE.Vector3): number {
    const dx = pos.x - this.group.position.x;
    const dz = pos.z - this.group.position.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  public reset(spawnPos = new THREE.Vector3(0, 0, -10)): void {
    this.hp = this.maxHp;
    this.poise = this.maxPoise;
    this.isPhase2 = false;
    this.state = 'idle';
    this.stateTimer = 0;
    this.currentAttack = null;
    this.attackTimer = 0;
    this.hasHitCurrentSwing = false;
    this.hasSpawnedSlashArc = false;
    this.hasTriggeredGroundSlam = false;
    this.telegraphGlow = 0;

    // 1. Reset kinematic controller
    this.kinematicController?.reset();

    // 2. Stop all actions and restore enabled + baseline weight 1.0
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    for (const action of this.actions.values()) {
      action.stop();
      action.reset();
      action.enabled = true;
      action.setEffectiveWeight(1.0);
      action.setEffectiveTimeScale(1.0);
      action.clampWhenFinished = false;
      action.paused = false;
    }

    this.currentAction = null;
    this.currentActionName = '';

    // 3. Play Idle via playAction so kinematicController and mixer are unified
    this.playAction('idle', 0.05);
    this.mixer?.update(0);

    // 4. Coordinates, rotation & material reset
    this.group.position.copy(spawnPos);
    this.group.position.y = 0;
    this.group.rotation.set(0, Math.PI, 0);
    this.group.updateMatrixWorld(true);

    this.weapon.resetMaterialColor();
  }

  public dispose(): void {
    this.swordHitboxDebugger.dispose();
    this.footHitboxDebugger.dispose();
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this.weapon.dispose();
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}

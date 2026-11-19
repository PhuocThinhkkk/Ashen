import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  type AttackDefinition,
  type DodgeDefinition,
  PLAYER_DODGE,
} from '../combat/FrameCombat';
import { KinematicCombatController } from '../combat/KinematicCombatController';
import { HitboxVisualDebugger } from '../combat/HitboxVisualDebugger';
import type { CombatInputs } from '../core/types';
import type { AudioSystem } from '../systems/AudioSystem';
import type { VFXSystem } from '../systems/VFXSystem';
import { ModelLoader } from '../utils/ModelLoader';
import {
  DEFAULT_PLAYER_WEAPON_SOCKET,
  loadSocketConfig,
  applyWeaponSocketTransform,
} from '../combat/WeaponSocketConfig';
import type { WeaponBladeSegment, BodyCapsule } from '../combat/WeaponCollisionSystem';
import { loadHealingFlaskMesh } from './player/HealingFlask';
import { updateSpinePitchTilt } from './player/PlayerSpineTilt';
import { PlayerDodgeHandler } from './player/PlayerDodge';
import { PlayerCombat } from './player/PlayerCombat';
import { PlayerLocomotion } from './player/PlayerLocomotion';
import { PlayerDualLayerAnimator } from './player/PlayerDualLayerAnimator';

export type PlayerState = 'idle' | 'moving' | 'dodge' | 'attack' | 'stagger' | 'dead' | 'jumping';

export class PlayerCharacter {
  public readonly group = new THREE.Group();
  public readonly velocity = new THREE.Vector3();
  public readonly radius = 0.55;

  // Stats
  public maxHp = 100;
  public hp = 100;
  public maxStamina = 100;
  public stamina = 100;
  public staminaRegenDelay = 0;
  public state: PlayerState = 'idle';

  // Combat Frame Data
  public currentAttack: AttackDefinition | null = null;
  public attackTimer = 0;
  public attackPhase: 'startup' | 'active' | 'recovery' | 'none' = 'none';
  public comboStep = 0;
  public comboQueued = false;
  public hasHitCurrentSwing = false;
  public hasSpawnedSlashArc = false;

  // Dodge Frame Data
  public readonly dodgeConfig: DodgeDefinition = PLAYER_DODGE;
  public dodgeTimer = 0;
  public dodgeDirection = new THREE.Vector3();
  public isInvulnerable = false;

  // Stagger
  public staggerTimer = 0;

  // Jump & Airborne State
  public isGrounded = true;
  public verticalVelocity = 0;
  public readonly gravity = -18.0;
  public readonly jumpImpulse = 6.8;
  public isAirborneAttack = false;

  // Target-Lock Procedural Downward Spine Tilt
  public currentTiltAngle = 0;
  private spineBones: THREE.Object3D[] = [];

  // Drinking While Walking State & Limited Heal Charges
  public isDrinking = false;
  public drinkTimer = 0;
  public readonly drinkDuration = 3.55;
  public hasHealedDuringDrink = false;
  public maxHealCharges = 2;
  public healCharges = 2;
  public flaskMesh: THREE.Group | null = null;
  public leftHandBone: THREE.Object3D | null = null;

  // Dual-Layer Animator Delegation & Compatibility Accessors
  public readonly animator = new PlayerDualLayerAnimator();

  public get upperBodyAction(): THREE.AnimationAction | null {
    return this.animator.upperBodyAction;
  }
  public set upperBodyAction(action: THREE.AnimationAction | null) {
    this.animator.upperBodyAction = action;
  }

  public get lowerBodyAction(): THREE.AnimationAction | null {
    return this.animator.lowerBodyAction;
  }
  public set lowerBodyAction(action: THREE.AnimationAction | null) {
    this.animator.lowerBodyAction = action;
  }

  public get currentUpperActionName(): string {
    return this.animator.currentUpperActionName;
  }
  public set currentUpperActionName(name: string) {
    this.animator.currentUpperActionName = name;
  }

  public get currentLowerActionName(): string {
    return this.animator.currentLowerActionName;
  }
  public set currentLowerActionName(name: string) {
    this.animator.currentLowerActionName = name;
  }

  public get currentActionName(): string {
    return this.animator.currentActionName;
  }
  public set currentActionName(name: string) {
    this.animator.currentActionName = name;
  }

  public get currentAction(): THREE.AnimationAction | null {
    return this.animator.currentAction;
  }
  public set currentAction(action: THREE.AnimationAction | null) {
    this.animator.currentAction = action;
  }

  public get isUpperBodyOverride(): boolean {
    return this.animator.isUpperBodyOverride;
  }
  public set isUpperBodyOverride(val: boolean) {
    this.animator.isUpperBodyOverride = val;
  }

  public get upperActions(): Map<string, THREE.AnimationAction> {
    return this.animator.upperActions;
  }

  public get lowerActions(): Map<string, THREE.AnimationAction> {
    return this.animator.lowerActions;
  }

  public get splitClips(): Map<string, { upper: THREE.AnimationClip; lower: THREE.AnimationClip }> {
    return this.animator.splitClips;
  }

  public get actions(): Map<string, THREE.AnimationAction> {
    return this.animator.actions;
  }

  // Model & Animation State
  public isLoaded = false;
  public loadPromise: Promise<void>;
  public mixer: THREE.AnimationMixer | null = null;
  public kinematicController: KinematicCombatController | null = null;
  public handBone: THREE.Object3D | null = null;
  public swordObject: THREE.Object3D | null = null;
  public readonly bladeBaseLocator = new THREE.Object3D();
  public readonly bladeTipLocator = new THREE.Object3D();
  public currentModelId = 'knight';
  public readonly hitboxDebugger = new HitboxVisualDebugger({
    size: new THREE.Vector3(0.28, 1.4, 0.28),
    offset: new THREE.Vector3(0, 0.7, 0),
  });
  public vfxSystem: VFXSystem | null = null;
  public audioSystem: AudioSystem | null = null;
  private readonly loader = new GLTFLoader();
  public modelScene: THREE.Group | null = null;

  public get modelId(): string {
    return this.currentModelId;
  }

  constructor(initialModelId = 'knight') {
    this.loadPromise = this.loadModel(initialModelId);
  }

  public async loadModel(modelId: string): Promise<void> {
    this.isLoaded = false;

    // 1. Detach weapon and items from existing bones
    if (this.swordObject && this.swordObject.parent) {
      this.swordObject.parent.remove(this.swordObject);
    }
    if (this.flaskMesh && this.flaskMesh.parent) {
      this.flaskMesh.parent.remove(this.flaskMesh);
    }
    this.flaskMesh = null;
    this.leftHandBone = null;
    this.spineBones = [];

    // 2. Stop and dispose existing model scene & animations
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this.animator.clear();

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

    if (!this.swordObject) {
      const swordGltf = await this.loader.loadAsync('/assets/weapons/chevalier_sword.glb');
      this.swordObject = swordGltf.scene;
      this.swordObject.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
        }
      });
      this.bladeBaseLocator.name = 'PlayerBladeBase';
      this.bladeBaseLocator.position.set(0, 0, 0.25);
      this.swordObject.add(this.bladeBaseLocator);

      this.bladeTipLocator.name = 'PlayerBladeTip';
      this.bladeTipLocator.position.set(0, 0, 1.45);
      this.swordObject.add(this.bladeTipLocator);
    }

    // 4. Load Player Model dynamically via ModelLoader
    const gltf = await ModelLoader.loadModel('player', modelId);
    this.modelScene = gltf.scene;

    // Scale to exactly 1.80m height and orient standard forward (-Z)
    const rawBox = new THREE.Box3().setFromObject(this.modelScene);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    const scaleFactor = 1.80 / (rawSize.y || 1);
    this.modelScene.scale.set(scaleFactor, scaleFactor, scaleFactor);
    this.modelScene.rotation.y = Math.PI;
    this.modelScene.updateMatrixWorld(true);

    // Hide debug meshes & enable shadows
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
        if (lower.includes('icosphere') || lower.includes('cylinder')) {
          obj.visible = false;
        } else {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      }
    });

    // 5. Locate PalmR / RightHand socket bone dynamically
    this.handBone = ModelLoader.findSocketBone(this.modelScene, [
      'mixamorig:RightHand',
      'mixamorigRightHand',
      'RightHand',
      'Palm.R',
      'PalmR',
      'MiddleHand.R',
    ]);
    if (!this.handBone) {
      console.warn(`[PlayerCharacter] Hand socket bone not found in model "${modelId}".`);
    }

    // Locate LeftHand bone for flask mesh
    this.leftHandBone = ModelLoader.findSocketBone(this.modelScene, [
      'mixamorig:LeftHand',
      'mixamorigLeftHand',
      'LeftHand',
      'Palm.L',
      'PalmL',
      'hand.L',
      'handL',
    ]);
    if (this.leftHandBone) {
      this.flaskMesh = await loadHealingFlaskMesh(this.loader);
      this.leftHandBone.add(this.flaskMesh);
      this.leftHandBone.updateMatrixWorld(true);
    }

    // Locate Spine bones for procedural target-lock pitch tilt
    this.spineBones = [
      ModelLoader.findSocketBone(this.modelScene, ['mixamorig:Spine', 'Spine']),
      ModelLoader.findSocketBone(this.modelScene, ['mixamorig:Spine1', 'Spine1']),
      ModelLoader.findSocketBone(this.modelScene, ['mixamorig:Spine2', 'Spine2']),
    ].filter((b): b is THREE.Object3D => b !== null);

    // 6. Parent weapon directly to socket bone (scaled to 1.4m broadsword proportion)
    if (this.handBone && this.swordObject) {
      const socketCfg = loadSocketConfig('player', DEFAULT_PLAYER_WEAPON_SOCKET);
      applyWeaponSocketTransform(this.swordObject, socketCfg);
      this.handBone.add(this.swordObject);
      this.hitboxDebugger.attachToBone(this.handBone);
      this.handBone.updateMatrixWorld(true);
      this.swordObject.updateMatrixWorld(true);
    }

    // 7. Setup AnimationMixer with 2-layer track splitting
    this.mixer = new THREE.AnimationMixer(this.modelScene);

    // 8. Setup Kinematic Combat Controller & bind armature
    this.kinematicController = new KinematicCombatController(this.mixer);
    this.kinematicController.bindArmature(this.modelScene);
    this.updateKinematicCallbacks();

    // Initialize dual-layer animation actions
    this.animator.initAnimations(this.mixer, gltf.animations, this.kinematicController);

    this.group.add(this.modelScene);
    this.currentModelId = modelId;
    this.isLoaded = true;

    // Play default standardized idle across both layers
    this.playFullBodyAction('idle', 0.1);
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
          this.currentAttack?.name || 'light',
          this.currentAttack?.isHeavy || false,
          false,
        );
      },
      onPeakSwoosh: (freq, duration, isHeavy) => this.audioSystem?.playPeakSwoosh(freq, duration, isHeavy),
      onPeakImpact: (isHeavy) => this.audioSystem?.hitImpact(isHeavy),
      onFootstep: (heavy) => this.audioSystem?.playFootstep(heavy),
      onLandingThud: (heavy) => this.audioSystem?.playLandingThud(heavy),
    });
  }

  public isHitboxActive(): boolean {
    if (this.isAirborneAttack) {
      return this.attackPhase === 'active';
    }
    if (this.kinematicController && this.state === 'attack') {
      return this.kinematicController.isAttacking;
    }
    return this.attackPhase === 'active';
  }

  public getHitboxWorldPosition(target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    if (this.kinematicController && this.kinematicController.activeHitboxBone) {
      return this.kinematicController.getHitboxWorldPosition(target);
    }
    if (this.swordObject) {
      this.swordObject.getWorldPosition(target);
      return target;
    }
    return target.copy(this.group.position).add(new THREE.Vector3(0, 1.0, 0));
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

  public getBodyCapsule(): BodyCapsule {
    return {
      position: this.group.position,
      radius: this.radius,
      height: 1.8,
    };
  }

  public toggleHitboxDebug(visible?: boolean): boolean {
    if (visible !== undefined) {
      this.hitboxDebugger.setVisible(visible);
      return visible;
    }
    return this.hitboxDebugger.toggle();
  }

  public playFullBodyAction(
    name: string,
    fadeDuration = 0.15,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat,
    clampWhenFinished = false,
    timeScale = 1.0,
  ): { upper: THREE.AnimationAction | null; lower: THREE.AnimationAction | null } {
    return this.animator.playFullBodyAction(name, fadeDuration, loop, clampWhenFinished, timeScale);
  }

  public playUpperBodyAction(
    name: string,
    fadeDuration = 0.18,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopOnce,
    clampWhenFinished = true,
    timeScale = 1.0,
  ): THREE.AnimationAction | null {
    return this.animator.playUpperBodyAction(name, fadeDuration, loop, clampWhenFinished, timeScale);
  }

  public playLowerBodyAction(
    name: string,
    fadeDuration = 0.15,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat,
    clampWhenFinished = false,
    timeScale = 1.0,
  ): THREE.AnimationAction | null {
    return this.animator.playLowerBodyAction(name, fadeDuration, loop, clampWhenFinished, timeScale);
  }

  public clearUpperBodyOverride(fadeDuration = 0.18): void {
    this.animator.clearUpperBodyOverride(fadeDuration);
  }

  public playAction(
    name: string,
    fadeDuration = 0.15,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat,
    clampWhenFinished = false,
    timeScale = 1.0,
  ): THREE.AnimationAction | null {
    return this.animator.playAction(name, fadeDuration, loop, clampWhenFinished, timeScale);
  }

  /**
   * Triggers healing flask drink while grounded.
   */
  public startDrink(): void {
    PlayerLocomotion.startDrink(this);
  }

  /**
   * Restores player HP and triggers visual/audio feedback.
   */
  public heal(amount = 40): void {
    if (this.state === 'dead' || this.hp <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (this.vfxSystem) {
      this.vfxSystem.spawnPeakVelocitySparks(
        this.group.position.clone().add(new THREE.Vector3(0, 1.0, 0)),
        14,
        true,
      );
    }
    if (this.audioSystem) {
      this.audioSystem.playPeakSwoosh(650, 0.35, false);
    }
  }

  /**
   * Triggers a vertical jump with physics and ground detection.
   */
  public startJump(): void {
    PlayerLocomotion.startJump(this);
  }

  /**
   * Triggers an upper-body attack while airborne without interrupting lower-body jumping locomotion.
   */
  public startMidAirAttack(attack: AttackDefinition): void {
    PlayerCombat.startMidAirAttack(this, attack);
  }

  /**
   * Late-update procedural target-lock pitch tilt.
   * Runs AFTER mixer.update() so AnimationMixer does not overwrite spine flexion.
   */
  private updateSpinePitchTilt(delta: number, lockedTargetPos: THREE.Vector3 | null): void {
    const isAirborne = !this.isGrounded || this.group.position.y > 0.05;
    this.currentTiltAngle = updateSpinePitchTilt(
      delta,
      lockedTargetPos,
      isAirborne,
      this.group.position,
      this.currentTiltAngle,
      this.spineBones,
      this.modelScene,
      this.handBone,
    );
  }

  public update(
    delta: number,
    elapsed: number,
    inputs: CombatInputs,
    cameraYaw: number,
    lockedTargetPos: THREE.Vector3 | null,
    arenaRadius: number,
  ): void {
    // 1. AnimationMixer Update
    if (this.mixer) {
      this.mixer.update(delta);
    }

    // Full-Body Sync: keep normalized time aligned when no upper override is active
    this.animator.syncNormalizedTime();

    // 2. Late-update Procedural Pitch Tilt (Executed AFTER mixer.update)
    this.updateSpinePitchTilt(delta, lockedTargetPos);

    if (this.kinematicController) {
      this.kinematicController.update(delta, this.group.rotation.y);
    }
    if (this.modelScene) {
      this.modelScene.updateMatrixWorld(true);
    }
    if (this.handBone) {
      this.handBone.updateMatrixWorld(true);
    }
    this.hitboxDebugger.update(this.isHitboxActive());

    // 3. Airborne Physics & Ground Detection
    PlayerLocomotion.updateAirbornePhysics(this, delta, inputs);

    // 4. Drinking While Walking Progress & Heal Timing
    PlayerLocomotion.updateDrinkingState(this, delta);

    if (this.state === 'dead') {
      if (this.currentActionName !== 'death') {
        this.playFullBodyAction('death', 0.1, THREE.LoopOnce, true, 1.0);
      }
      return;
    }

    // 5. Stamina Regeneration
    if (this.staminaRegenDelay > 0) {
      this.staminaRegenDelay -= delta;
    } else if (
      this.stamina < this.maxStamina &&
      this.state !== 'dodge' &&
      this.state !== 'attack' &&
      this.state !== 'jumping'
    ) {
      const regenRate = inputs.sprint && inputs.move.lengthSq() > 0 ? 0 : 36.0;
      this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * delta);
    }

    // 6. Handle Current State
    switch (this.state) {
      case 'dodge':
        this.updateDodge(delta, inputs);
        break;
      case 'attack':
        this.updateAttack(delta, inputs, lockedTargetPos);
        break;
      case 'stagger':
        this.updateStagger(delta);
        break;
      case 'jumping':
        PlayerLocomotion.updateJumping(this, delta, elapsed, inputs, cameraYaw, lockedTargetPos);
        break;
      case 'idle':
      case 'moving':
        PlayerLocomotion.updateLocomotion(this, delta, elapsed, inputs, cameraYaw, lockedTargetPos);
        break;
    }

    // 7. Keep Inside Arena
    const maxR = arenaRadius - this.radius - 0.5;
    const distSq = this.group.position.x * this.group.position.x + this.group.position.z * this.group.position.z;
    if (distSq > maxR * maxR) {
      const dist = Math.sqrt(distSq);
      this.group.position.x = (this.group.position.x / dist) * maxR;
      this.group.position.z = (this.group.position.z / dist) * maxR;
    }
  }

  public startDodge(inputs?: CombatInputs, cameraYaw = 0, explicitDirection?: THREE.Vector3): void {
    PlayerDodgeHandler.startDodge(this, inputs, cameraYaw, explicitDirection);
  }

  public setDodgeIFrameVisual(active: boolean): void {
    PlayerDodgeHandler.setDodgeIFrameVisual(this.modelScene, active);
  }

  private updateDodge(delta: number, _inputs: CombatInputs): void {
    PlayerDodgeHandler.updateDodge(this, delta, this.modelScene);
  }

  public startAttack(attack: AttackDefinition, comboStep: number): void {
    PlayerCombat.startAttack(this, attack, comboStep);
  }

  public updateAttack(delta: number, inputs: CombatInputs, lockedTargetPos: THREE.Vector3 | null = null): void {
    PlayerCombat.updateAttack(this, delta, inputs, lockedTargetPos);
  }

  public takeDamage(damage: number, isHeavy: boolean): boolean {
    return PlayerCombat.takeDamage(this, damage, isHeavy);
  }

  public updateStagger(delta: number): void {
    PlayerCombat.updateStagger(this, delta);
  }

  public reset(spawnPos = new THREE.Vector3(0, 0, 10)): void {
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.staminaRegenDelay = 0;
    this.state = 'idle';
    this.currentAttack = null;
    this.attackPhase = 'none';
    this.comboStep = 0;
    this.comboQueued = false;
    this.hasHitCurrentSwing = false;
    this.hasSpawnedSlashArc = false;
    this.isInvulnerable = false;
    this.setDodgeIFrameVisual(false);

    this.isGrounded = true;
    this.verticalVelocity = 0;
    this.isAirborneAttack = false;
    this.currentTiltAngle = 0;

    this.isDrinking = false;
    this.drinkTimer = 0;
    this.hasHealedDuringDrink = false;
    this.healCharges = this.maxHealCharges;
    if (this.flaskMesh) this.flaskMesh.visible = false;

    this.dodgeTimer = 0;
    this.staggerTimer = 0;

    // 1. Reset kinematic controller
    this.kinematicController?.reset();

    // 2. Stop all actions and restore enabled + baseline weight 1.0
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    for (const action of this.upperActions.values()) {
      action.stop();
      action.reset();
      action.enabled = true;
      action.setEffectiveWeight(1.0);
      action.setEffectiveTimeScale(1.0);
      action.clampWhenFinished = false;
      action.paused = false;
    }
    for (const action of this.lowerActions.values()) {
      action.stop();
      action.reset();
      action.enabled = true;
      action.setEffectiveWeight(1.0);
      action.setEffectiveTimeScale(1.0);
      action.clampWhenFinished = false;
      action.paused = false;
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

    this.upperBodyAction = null;
    this.lowerBodyAction = null;
    this.currentUpperActionName = '';
    this.currentLowerActionName = '';
    this.currentAction = null;
    this.currentActionName = '';
    this.isUpperBodyOverride = false;

    // 3. Play Idle via playFullBodyAction
    this.playFullBodyAction('idle', 0.05);
    this.mixer?.update(0);

    // 4. Coordinates, rotation & physics reset
    this.group.position.copy(spawnPos);
    this.group.position.y = 0;
    this.group.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.group.updateMatrixWorld(true);
  }

  public dispose(): void {
    this.setDodgeIFrameVisual(false);
    this.hitboxDebugger.dispose();
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    if (this.swordObject && this.swordObject.parent) {
      this.swordObject.parent.remove(this.swordObject);
    }
    if (this.flaskMesh && this.flaskMesh.parent) {
      this.flaskMesh.parent.remove(this.flaskMesh);
    }
    this.flaskMesh?.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    this.swordObject?.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
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

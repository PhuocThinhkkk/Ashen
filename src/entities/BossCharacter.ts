import * as THREE from 'three';
import { type AttackDefinition } from '../combat/FrameCombat';
import { HitboxVisualDebugger } from '../combat/HitboxVisualDebugger';
import { KinematicCombatController } from '../combat/KinematicCombatController';
import type { AudioSystem } from '../systems/AudioSystem';
import type { VFXSystem } from '../systems/VFXSystem';
import { ModelLoader } from '../utils/ModelLoader';
import { splitClipByBodyPart } from '../utils/AnimationSplitter';
import {
  DEFAULT_BOSS_WEAPON_SOCKET,
  loadSocketConfig,
  applyWeaponSocketTransform,
} from '../combat/WeaponSocketConfig';
import type { WeaponBladeSegment, BodyCapsule } from '../combat/WeaponCollisionSystem';
import { BossAI, type PlayerCombatSnapshot } from './boss/BossAI';
import { BossWeapon } from './boss/BossWeapon';
import { BossCombatResolver } from './boss/combat/BossCombatResolver';

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
  public maxHp = 800;
  public hp = 800;
  public maxPoise = 100;
  public poise = 100;
  public isPhase2 = false;

  // AI & Frame State
  public readonly ai: BossAI = new BossAI(this);
  public state: BossState = 'idle';
  public currentAttack: AttackDefinition | null = null;
  public attackTimer = 0;
  public stateTimer = 0;
  public hasHitCurrentSwing = false;
  public hasSpawnedSlashArc = false;
  public isAttackActiveFrames = false;

  // Locomotion Blend Layer Actions & Weights
  public idleAction: THREE.AnimationAction | null = null;
  public walkForwardAction: THREE.AnimationAction | null = null;
  public walkBackAction: THREE.AnimationAction | null = null;
  public strafeLeftAction: THREE.AnimationAction | null = null;
  public strafeRightAction: THREE.AnimationAction | null = null;
  public currentAttackAction: THREE.AnimationAction | null = null;
  public locomotionMasterWeight = 1.0;
  public isLocomotionActive = true;
  public currentWeights = {
    idle: 1.0,
    walkForward: 0.0,
    walkBack: 0.0,
    strafeLeft: 0.0,
    strafeRight: 0.0,
  };

  // Dual-Layer Upper / Lower Body Actions & Sub-Clips
  public readonly upperActions = new Map<string, THREE.AnimationAction>();
  public readonly lowerActions = new Map<string, THREE.AnimationAction>();
  public readonly splitClips = new Map<string, { upper: THREE.AnimationClip; lower: THREE.AnimationClip }>();
  public currentUpperAttackAction: THREE.AnimationAction | null = null;
  public currentLowerAttackAction: THREE.AnimationAction | null = null;
  public currentLowerIdleAction: THREE.AnimationAction | null = null;
  public isFullBodyExemptAttack = false;
  public currentUpperActionName = 'idle';
  public currentLowerActionName = 'idle';

  // Lower-Body Turn Layer Actions & Weights
  public turnLeftAction: THREE.AnimationAction | null = null;
  public turnRightAction: THREE.AnimationAction | null = null;
  public turnDirection: 'left' | 'right' | null = null;
  public currentTurnLeftWeight = 0;
  public currentTurnRightWeight = 0;
  public targetTurnLeftWeight = 0;
  public targetTurnRightWeight = 0;

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

  /**
   * [Purpose]: Asynchronously loads the boss GLB asset, sets up skeletal meshes, materials, weapon sockets, and animation clips.
   * @condition Invoked during boss initialization or when dynamically switching boss model variants.
   * @param modelId Unique identifier key for the boss model asset to load from registry.
   * @returns Resolves when the model hierarchy and animation subsystems are fully initialized and bound.
   */
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

    // Clear previous split maps
    this.upperActions.clear();
    this.lowerActions.clear();
    this.splitClips.clear();

    for (const clip of bossGltf.animations) {
      this.kinematicController.stripRootMotion(clip);

      // Pre-generate split upper and lower sub-clips
      const split = splitClipByBodyPart(clip);
      this.splitClips.set(clip.name, split);

      const upperAct = this.mixer.clipAction(split.upper);
      const lowerAct = this.mixer.clipAction(split.lower);
      this.upperActions.set(clip.name, upperAct);
      this.lowerActions.set(clip.name, lowerAct);

      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
    }

    // Setup Lower-Body Turn Actions
    const turnLeftClip = ModelLoader.findClip(this.rawClips, 'turn_left');
    if (turnLeftClip) {
      const split = this.splitClips.get(turnLeftClip.name) || splitClipByBodyPart(turnLeftClip);
      this.turnLeftAction = this.mixer.clipAction(split.lower);
      this.turnLeftAction.enabled = true;
      this.turnLeftAction.setLoop(THREE.LoopRepeat, Infinity);
      this.turnLeftAction.clampWhenFinished = false;
      this.turnLeftAction.setEffectiveWeight(0.0);
      this.turnLeftAction.play();
    }

    const turnRightClip = ModelLoader.findClip(this.rawClips, 'turn_right');
    if (turnRightClip) {
      const split = this.splitClips.get(turnRightClip.name) || splitClipByBodyPart(turnRightClip);
      this.turnRightAction = this.mixer.clipAction(split.lower);
      this.turnRightAction.enabled = true;
      this.turnRightAction.setLoop(THREE.LoopRepeat, Infinity);
      this.turnRightAction.clampWhenFinished = false;
      this.turnRightAction.setEffectiveWeight(0.0);
      this.turnRightAction.play();
    }

    this.group.add(this.modelScene);
    this.currentModelId = modelId;
    this.isLoaded = true;

    // Initialize synchronized locomotion blend layer
    this.initLocomotionBlendLayer();
  }

  public findAction(name: string): THREE.AnimationAction | null {
    let action = this.actions.get(name);
    if (!action) {
      const clip = ModelLoader.findClip(this.rawClips, name);
      if (clip) {
        action = this.actions.get(clip.name);
        if (!action && this.mixer) {
          action = this.mixer.clipAction(clip);
          this.actions.set(clip.name, action);
        }
      }
    }
    return action || null;
  }

  public initLocomotionBlendLayer(): void {
    this.idleAction = this.findAction('idle');
    this.walkForwardAction =
      this.findAction('walk_forward') ||
      this.findAction('walking') ||
      this.findAction('walk');
    this.walkBackAction =
      this.findAction('walk_back') ||
      this.findAction('walk_backward');
    this.strafeLeftAction = this.findAction('strafe_left');
    this.strafeRightAction = this.findAction('strafe_right');

    const locoActions = [
      this.idleAction,
      this.walkForwardAction,
      this.walkBackAction,
      this.strafeLeftAction,
      this.strafeRightAction,
    ];

    for (const action of locoActions) {
      if (!action) continue;
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.setEffectiveTimeScale(1.0);
      action.clampWhenFinished = false;
      action.setEffectiveWeight(action === this.idleAction ? 1.0 : 0.0);
      action.play();
    }

    this.currentWeights = {
      idle: 1.0,
      walkForward: 0.0,
      walkBack: 0.0,
      strafeLeft: 0.0,
      strafeRight: 0.0,
    };
    this.locomotionMasterWeight = 1.0;
    this.isLocomotionActive = true;
    this.currentActionName = 'idle';
  }

  /**
   * [Purpose]: Computes blended locomotion animation weights and synchronizes locomotion phase timers for directional walking and strafing.
   * @condition Called per-tick during locomotion update when the boss is actively moving or repositioning.
   * @param delta,strafeDir,radialFactor Frame delta in seconds, lateral strafe sign (-1/0/1), and radial distance weighting factor.
   * @returns Updates blended weights across idle, walkForward, walkBack, and strafe animation actions.
   */
  public updateLocomotionWeights(delta: number, strafeDir: number, radialFactor: number): void {
    // 1. Keep walk_forward, walk_back, strafe_left, and strafe_right synchronized in locomotion layer
    if (this.walkForwardAction) {
      const fwdDur = this.walkForwardAction.getClip().duration;
      if (fwdDur > 0) {
        const phase = (this.walkForwardAction.time % fwdDur) / fwdDur;
        if (this.walkBackAction) {
          this.walkBackAction.time = phase * this.walkBackAction.getClip().duration;
        }
        if (this.strafeLeftAction) {
          this.strafeLeftAction.time = phase * this.strafeLeftAction.getClip().duration;
        }
        if (this.strafeRightAction) {
          this.strafeRightAction.time = phase * this.strafeRightAction.getClip().duration;
        }
      }
    }

    // 2. Smoothly calculate directional target weights based on movement input (strafeDir: -1 / 0 / 1 and radial forward/back factor)
    const moveMag = Math.min(1.0, Math.sqrt(strafeDir * strafeDir + radialFactor * radialFactor));
    let targetIdle = 1.0;
    let targetFwd = 0.0;
    let targetBack = 0.0;
    let targetLeft = 0.0;
    let targetRight = 0.0;

    if (moveMag > 0.05) {
      const rawFwd = Math.max(0, radialFactor);
      const rawBack = Math.max(0, -radialFactor);
      const rawLeft = Math.max(0, -strafeDir);
      const rawRight = Math.max(0, strafeDir);
      const sum = rawFwd + rawBack + rawLeft + rawRight;

      if (sum > 0.001) {
        targetFwd = (rawFwd / sum) * moveMag;
        targetBack = (rawBack / sum) * moveMag;
        targetLeft = (rawLeft / sum) * moveMag;
        targetRight = (rawRight / sum) * moveMag;
      }
      targetIdle = Math.max(0, 1.0 - moveMag);
    }

    // 3. Smooth interpolation (damp)
    const blendRate = 10.0;
    this.currentWeights.idle = THREE.MathUtils.damp(this.currentWeights.idle, targetIdle, blendRate, delta);
    this.currentWeights.walkForward = THREE.MathUtils.damp(this.currentWeights.walkForward, targetFwd, blendRate, delta);
    this.currentWeights.walkBack = THREE.MathUtils.damp(this.currentWeights.walkBack, targetBack, blendRate, delta);
    this.currentWeights.strafeLeft = THREE.MathUtils.damp(this.currentWeights.strafeLeft, targetLeft, blendRate, delta);
    this.currentWeights.strafeRight = THREE.MathUtils.damp(this.currentWeights.strafeRight, targetRight, blendRate, delta);

    // Weight floor & normalization to guarantee mixer never drops to 0 total weight
    const totalBlended =
      this.currentWeights.idle +
      this.currentWeights.walkForward +
      this.currentWeights.walkBack +
      this.currentWeights.strafeLeft +
      this.currentWeights.strafeRight;
    if (totalBlended < 0.05) {
      this.currentWeights.idle = 1.0;
    }

    // 4. Smooth locomotionMasterWeight crossfade (fade in/out ~0.15s)
    const targetMaster = this.isLocomotionActive ? 1.0 : 0.0;
    this.locomotionMasterWeight = THREE.MathUtils.damp(
      this.locomotionMasterWeight,
      targetMaster,
      1.0 / 0.15,
      delta,
    );

    // 5. Apply effective weights to mixer actions with guaranteed playback
    const master = this.locomotionMasterWeight;
    const actionsWithWeights = [
      { action: this.idleAction, weight: this.currentWeights.idle * master },
      { action: this.walkForwardAction, weight: this.currentWeights.walkForward * master },
      { action: this.walkBackAction, weight: this.currentWeights.walkBack * master },
      { action: this.strafeLeftAction, weight: this.currentWeights.strafeLeft * master },
      { action: this.strafeRightAction, weight: this.currentWeights.strafeRight * master },
    ];

    for (const item of actionsWithWeights) {
      if (!item.action) continue;
      item.action.enabled = true;
      if (item.weight > 0.001 && !item.action.isRunning()) {
        item.action.play();
      }
      item.action.setEffectiveWeight(item.weight);
    }

    // 6. Dominant clip reflects active locomotion state
    if (this.isLocomotionActive && master > 0.3) {
      let maxWeight = this.currentWeights.idle;
      let dominant = 'idle';

      if (this.currentWeights.strafeLeft > maxWeight) {
        maxWeight = this.currentWeights.strafeLeft;
        dominant = 'strafe_left';
      }
      if (this.currentWeights.strafeRight > maxWeight) {
        maxWeight = this.currentWeights.strafeRight;
        dominant = 'strafe_right';
      }
      if (this.currentWeights.walkForward > maxWeight) {
        maxWeight = this.currentWeights.walkForward;
        dominant = 'walking';
      }
      if (this.currentWeights.walkBack > maxWeight) {
        maxWeight = this.currentWeights.walkBack;
        dominant = 'walk_back';
      }
      this.currentActionName = dominant;
      if (this.turnDirection === null) {
        this.currentLowerActionName = dominant;
      }
    }
  }

  public setTurnDirection(dir: 'left' | 'right' | null): void {
    this.turnDirection = dir;
    if (dir === 'left') {
      this.targetTurnLeftWeight = 1.0;
      this.targetTurnRightWeight = 0.0;
      this.currentLowerActionName = 'turn_left';
    } else if (dir === 'right') {
      this.targetTurnLeftWeight = 0.0;
      this.targetTurnRightWeight = 1.0;
      this.currentLowerActionName = 'turn_right';
    } else {
      this.targetTurnLeftWeight = 0.0;
      this.targetTurnRightWeight = 0.0;
      if (!this.currentAttack) {
        this.currentLowerActionName = this.currentActionName || 'idle';
      }
    }
  }

  public updateTurnWeights(delta: number): void {
    // If an attack is active, force turn weights to 0 so turn clips never override or break attacks
    if (this.currentUpperAttackAction && this.currentUpperAttackAction.isRunning()) {
      this.targetTurnLeftWeight = 0;
      this.targetTurnRightWeight = 0;
      this.currentTurnLeftWeight = 0;
      this.currentTurnRightWeight = 0;
      if (this.turnLeftAction) this.turnLeftAction.setEffectiveWeight(0);
      if (this.turnRightAction) this.turnRightAction.setEffectiveWeight(0);
      return;
    }

    const blendRate = 12.0;
    this.currentTurnLeftWeight = THREE.MathUtils.damp(
      this.currentTurnLeftWeight,
      this.targetTurnLeftWeight,
      blendRate,
      delta,
    );
    this.currentTurnRightWeight = THREE.MathUtils.damp(
      this.currentTurnRightWeight,
      this.targetTurnRightWeight,
      blendRate,
      delta,
    );

    if (this.turnLeftAction) {
      this.turnLeftAction.enabled = true;
      if (!this.turnLeftAction.isRunning()) {
        this.turnLeftAction.play();
      }
      this.turnLeftAction.setEffectiveWeight(this.currentTurnLeftWeight);
    }
    if (this.turnRightAction) {
      this.turnRightAction.enabled = true;
      if (!this.turnRightAction.isRunning()) {
        this.turnRightAction.play();
      }
      this.turnRightAction.setEffectiveWeight(this.currentTurnRightWeight);
    }

    const totalTurnWeight = Math.min(1.0, this.currentTurnLeftWeight + this.currentTurnRightWeight);
    if (this.currentLowerAttackAction && this.currentLowerAttackAction.isRunning()) {
      this.currentLowerAttackAction.setEffectiveWeight(Math.max(0, 1.0 - totalTurnWeight));
    }
  }

  public startAttackAction(clipName: string, timeScale: number): THREE.AnimationAction | null {
    // 1. Immediately zero out all locomotion blend layer actions & master weight
    this.isLocomotionActive = false;
    this.locomotionMasterWeight = 0.0;
    const locoActions = [
      this.idleAction,
      this.walkForwardAction,
      this.walkBackAction,
      this.strafeLeftAction,
      this.strafeRightAction,
    ];
    for (const act of locoActions) {
      if (act) {
        act.setEffectiveWeight(0.0);
        act.fadeOut(0.12);
      }
    }

    // 2. Identify if this attack is full-body exempt (attack_jump, attack_360)
    const isFullBodyExempt = clipName === 'attack_jump' || clipName === 'attack_360';
    this.isFullBodyExemptAttack = isFullBodyExempt;

    // Reset previous lower idle action if any
    if (this.currentLowerIdleAction) {
      this.currentLowerIdleAction.stop();
      this.currentLowerIdleAction = null;
    }

    // Resolve split upper and lower actions
    let upperAction = this.upperActions.get(clipName) || null;
    let lowerAction = this.lowerActions.get(clipName) || null;
    let fullAction = this.actions.get(clipName) || null;

    if (!upperAction || !fullAction) {
      const clip = ModelLoader.findClip(this.rawClips, clipName);
      if (clip) {
        upperAction = this.upperActions.get(clip.name) || null;
        lowerAction = this.lowerActions.get(clip.name) || null;
        fullAction = this.actions.get(clip.name) || null;
      }
    }

    // Play upper body attack action independently so upper body (dual swords, arms, chest)
    // is never overridden or reset when turning
    if (upperAction) {
      upperAction.reset();
      upperAction.enabled = true;
      upperAction.setLoop(THREE.LoopOnce, 1);
      upperAction.clampWhenFinished = true;
      upperAction.setEffectiveTimeScale(timeScale);
      upperAction.setEffectiveWeight(1.0);
      upperAction.play();
      this.currentUpperAttackAction = upperAction;
    }

    // Lower body handling:
    // - Full-body exempt (jump, 360): lower body performs the attack sub-clip (full hips/pelvis twist)
    // - Turnable attacks (downward, combo, kick): lower body uses lower idle sub-clip to maintain 2H greatsword grip
    if (isFullBodyExempt) {
      if (lowerAction) {
        lowerAction.reset();
        lowerAction.enabled = true;
        lowerAction.setLoop(THREE.LoopOnce, 1);
        lowerAction.clampWhenFinished = true;
        lowerAction.setEffectiveTimeScale(timeScale);
        lowerAction.setEffectiveWeight(1.0);
        lowerAction.play();
        this.currentLowerAttackAction = lowerAction;
      }
    } else {
      let lowerIdle = this.lowerActions.get('idle');
      if (!lowerIdle) {
        const idleClip = ModelLoader.findClip(this.rawClips, 'idle');
        if (idleClip) {
          lowerIdle = this.lowerActions.get(idleClip.name);
        }
      }
      if (lowerIdle) {
        lowerIdle.reset();
        lowerIdle.enabled = true;
        lowerIdle.setLoop(THREE.LoopRepeat, Infinity);
        lowerIdle.clampWhenFinished = false;
        lowerIdle.setEffectiveWeight(1.0);
        lowerIdle.play();
        this.currentLowerIdleAction = lowerIdle;
      }
      this.currentLowerAttackAction = null;
    }

    // Route tracking through kinematicController for frames, VFX, and audio
    const trackAction = upperAction || fullAction || this.playAction(clipName, 0.15, THREE.LoopOnce, true, timeScale);
    if (this.kinematicController && trackAction) {
      this.kinematicController.playAction(clipName, trackAction, {
        fadeDuration: 0.15,
        loop: THREE.LoopOnce,
        clampWhenFinished: true,
        timeScale,
      });
    }

    this.currentAttackAction = trackAction;
    this.currentAction = trackAction;
    this.currentActionName = clipName;
    this.currentUpperActionName = clipName;
    return trackAction;
  }

  public endAttackAction(): void {
    if (this.currentUpperAttackAction) {
      this.currentUpperAttackAction.fadeOut(0.15);
      this.currentUpperAttackAction = null;
    }
    if (this.currentLowerAttackAction) {
      this.currentLowerAttackAction.fadeOut(0.15);
      this.currentLowerAttackAction = null;
    }
    if (this.currentLowerIdleAction) {
      this.currentLowerIdleAction.fadeOut(0.15);
      this.currentLowerIdleAction = null;
    }
    if (this.currentAttackAction) {
      this.currentAttackAction.fadeOut(0.15);
      this.currentAttackAction = null;
    }

    this.isFullBodyExemptAttack = false;

    // Guaranteed active base pose: immediately re-enable, play, and fadeIn idleAction to prevent T-Pose
    if (this.idleAction) {
      this.idleAction.enabled = true;
      this.idleAction.play();
      this.idleAction.setEffectiveWeight(1.0);
      this.idleAction.fadeIn(0.15);
    }

    // Cross-fade back into locomotion blend layer (~0.15s)
    this.isLocomotionActive = true;
    this.locomotionMasterWeight = 1.0;
    this.currentUpperActionName = 'idle';
    if (this.turnDirection === null) {
      this.currentLowerActionName = 'idle';
    }

    if (this.kinematicController) {
      this.kinematicController.reset();
    }
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

  /**
   * [Purpose]: Orchestrates per-frame boss lifecycle updates including animation mixer, kinematic motion, hitbox tracking, and AI subgoals.
   * @condition Invoked every tick from the primary 60Hz game loop when boss entity is active.
   * @param delta,elapsed,player,arenaRadius,arena Time step (seconds), total time, player spatial snapshot, arena bounding radius, and arena reference.
   * @returns Advances boss animation, physics transform, combat state, and telegraph/hitbox evaluations.
   */
  public update(
    delta: number,
    _elapsed: number,
    player: THREE.Vector3 | PlayerCombatSnapshot,
    arenaRadius: number,
    arena?: any,
  ): void {
    // Update lower-body turn layer weights
    this.updateTurnWeights(delta);

    if (this.mixer) {
      // T-Pose Fail-Safe Guard: Ensure mixer always has at least one active, weighted action
      let activeWeightSum = 0;
      for (const action of this.actions.values()) {
        if (action.isRunning() && action.enabled) {
          activeWeightSum += action.getEffectiveWeight();
        }
      }
      for (const action of this.upperActions.values()) {
        if (action.isRunning() && action.enabled) {
          activeWeightSum += action.getEffectiveWeight();
        }
      }
      if (this.currentLowerIdleAction?.isRunning() && this.currentLowerIdleAction.enabled) {
        activeWeightSum += this.currentLowerIdleAction.getEffectiveWeight();
      }
      if (this.turnLeftAction?.isRunning() && this.turnLeftAction.enabled) {
        activeWeightSum += this.turnLeftAction.getEffectiveWeight();
      }
      if (this.turnRightAction?.isRunning() && this.turnRightAction.enabled) {
        activeWeightSum += this.turnRightAction.getEffectiveWeight();
      }

      if (activeWeightSum < 0.05 && this.idleAction) {
        this.idleAction.enabled = true;
        this.idleAction.play();
        this.idleAction.setEffectiveWeight(1.0);
      }

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

    const playerSnapshot: PlayerCombatSnapshot = (player instanceof THREE.Vector3)
      ? {
          position: player,
          velocity: new THREE.Vector3(),
          isHealing: false,
          isAttacking: false,
          isStaggered: false,
        }
      : player;

    // Poise passive regeneration
    if (this.poise < this.maxPoise && this.state !== 'stagger') {
      this.poise = Math.min(this.maxPoise, this.poise + delta * 12.0);
    }

    // Phase 2 check (under 50% HP)
    if (!this.isPhase2 && this.hp <= this.maxHp * 0.5 && this.state !== 'phaseTransition') {
      this.triggerPhase2(playerSnapshot.position);
      return;
    }

    // Update Goal-Stack Boss AI
    this.ai.update(delta, playerSnapshot, arena, arenaRadius);

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
    this.ai.clearGoalStack();
    this.ai.pushSubgoal({ type: 'ATTACK', attack });
    this.ai.startAttack(attack);
  }

  public getBladeHitboxWorldPosition(target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    return BossCombatResolver.resolveBladeHitboxPosition(
      this.weapon,
      this.kinematicController,
      this.currentAttack,
      target,
    );
  }

  public getWeaponBladeSegment(
    outBase = new THREE.Vector3(),
    outTip = new THREE.Vector3(),
  ): WeaponBladeSegment {
    return BossCombatResolver.resolveWeaponBladeSegment(
      this.weapon,
      this.group.position,
      this.group.rotation.y,
      outBase,
      outTip,
    );
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
    return BossCombatResolver.resolveBodyCapsule(this.group.position, this.radius, 2.45);
  }

  public takeDamage(damage: number, poiseDamage: number): boolean {
    if (this.state === 'dead') return false;

    const { newHp, isDead } = BossCombatResolver.calculateDamage(this.hp, damage);
    this.hp = newHp;

    if (isDead) {
      this.state = 'dead';
      this.playAction('die', 0.15, THREE.LoopOnce, true, 1.0);
      return true;
    }

    const { newPoise, triggerStagger } = BossCombatResolver.calculatePoise(
      this.poise,
      this.maxPoise,
      poiseDamage,
      this.state,
    );
    this.poise = newPoise;

    if (triggerStagger) {
      this.state = 'stagger';
      this.stateTimer = 0;
      this.currentAttack = null;
      this.playAction('hit', 0.1, THREE.LoopOnce, true, 0.8);
    }

    return true;
  }

  public triggerPhase2(playerPos?: THREE.Vector3): void {
    this.isPhase2 = true;
    this.state = 'phaseTransition';
    this.stateTimer = 0;
    this.currentAttack = null;
    this.ai.clearGoalStack();
    this.ai.attackCooldown = 0;
    if (playerPos) {
      this.faceTarget(playerPos, this.ai.maxTurnRate, 0.05);
    }

    this.playAction('special', 0.2, THREE.LoopOnce, true, 1.0);
  }

  public faceTarget(targetPos: THREE.Vector3, turnRateOrMaxTurnRate: number, delta?: number): void {
    // Rotation tracking is frozen during full-body exempt attacks (jump leap, 360 spin)
    const isExempt =
      (this.currentAttack?.animationClip === 'attack_jump' ||
        this.currentAttack?.animationClip === 'attack_360') &&
      this.isAttackActiveFrames;
    if (isExempt) {
      this.setTurnDirection(null);
      return;
    }

    const dx = targetPos.x - this.group.position.x;
    const dz = targetPos.z - this.group.position.z;
    const targetAngle = Math.atan2(-dx, -dz);

    let diff = targetAngle - this.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const isAttacking =
      this.currentAttack !== null ||
      (this.currentUpperAttackAction !== null && this.currentUpperAttackAction.isRunning());

    if (isAttacking) {
      // During any attack, lower body does not activate turn clips (stays in 2H idle or full-body attack)
      this.setTurnDirection(null);
    } else {
      const turnThreshold = 0.08; // ~4.6 degrees deadzone
      if (diff > turnThreshold) {
        this.setTurnDirection('left');
      } else if (diff < -turnThreshold) {
        this.setTurnDirection('right');
      } else {
        this.setTurnDirection(null);
      }
    }

    if (delta !== undefined) {
      const maxStep = turnRateOrMaxTurnRate * delta;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
      this.group.rotation.y += step;
    } else {
      this.group.rotation.y += diff * Math.min(1.0, turnRateOrMaxTurnRate);
    }
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
    this.isAttackActiveFrames = false;

    // Reset Goal-Stack AI
    this.ai.reset();

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
    this.currentAttackAction = null;
    this.currentUpperAttackAction = null;
    this.currentLowerAttackAction = null;
    this.currentActionName = 'idle';
    this.currentUpperActionName = 'idle';
    this.currentLowerActionName = 'idle';

    // Reset turn animations
    this.setTurnDirection(null);
    this.currentTurnLeftWeight = 0;
    this.currentTurnRightWeight = 0;
    this.targetTurnLeftWeight = 0;
    this.targetTurnRightWeight = 0;
    this.turnLeftAction?.setEffectiveWeight(0);
    this.turnRightAction?.setEffectiveWeight(0);

    for (const action of this.upperActions.values()) {
      action.stop();
      action.reset();
      action.enabled = true;
      action.setEffectiveWeight(1.0);
    }
    for (const action of this.lowerActions.values()) {
      action.stop();
      action.reset();
      action.enabled = true;
      action.setEffectiveWeight(1.0);
    }

    // 3. Initialize synchronized locomotion blend layer
    this.initLocomotionBlendLayer();
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
    this.turnLeftAction?.stop();
    this.turnRightAction?.stop();
    this.upperActions.clear();
    this.lowerActions.clear();
    this.splitClips.clear();
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

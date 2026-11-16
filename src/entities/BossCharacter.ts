import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { type AttackDefinition, BOSS_ATTACKS } from '../combat/FrameCombat';
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
  private hasTriggeredGroundSlam = false;

  // Weapon & Material
  public readonly greatswordGroup = new THREE.Group();
  public swordObject: THREE.Object3D | null = null;
  public bladeMesh: THREE.Mesh | null = null;
  public readonly bladeHitbox = new THREE.Object3D();
  public readonly bladeBaseLocator = new THREE.Object3D();
  public readonly bladeTipLocator = new THREE.Object3D();
  public bladeMaterial: THREE.MeshStandardMaterial;
  public handBone: THREE.Object3D | null = null;
  private readonly defaultBladeColor = new THREE.Color(0xffffff);
  private readonly loader = new GLTFLoader();

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
  private vfxSystem: VFXSystem | null = null;
  private audioSystem: AudioSystem | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private currentAction: THREE.AnimationAction | null = null;
  private modelScene: THREE.Group | null = null;
  private rawClips: THREE.AnimationClip[] = [];

  public get modelId(): string {
    return this.currentModelId;
  }

  constructor(initialModelId = 'titan') {
    this.bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
    });

    this.defaultBladeColor.copy(this.bladeMaterial.color);
    this.loadPromise = this.loadModel(initialModelId);
  }

  private async ensureGreatswordLoaded(): Promise<void> {
    if (this.swordObject) return;

    const gltf = await this.loader.loadAsync('/assets/weapons/lower_orc_great_sword.glb');
    this.swordObject = gltf.scene;
    // Align grip to weapon origin (Y=0.7 shifts local grip at ~-0.65 to around hand level)
    this.swordObject.position.set(0, 0.7, 0);

    this.swordObject.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        this.bladeMesh = obj;
        if (obj.material) {
          const mat = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as THREE.MeshStandardMaterial;
          if (mat) {
            this.bladeMaterial = mat;
            this.defaultBladeColor.copy(mat.color);
          }
        }
      }
    });

    this.greatswordGroup.add(this.swordObject);

    // Collision hitbox and blade locators
    this.bladeHitbox.name = 'BossBladeHitbox';
    this.bladeHitbox.position.set(0, 1.05, 0);
    this.greatswordGroup.add(this.bladeHitbox);

    this.bladeBaseLocator.name = 'BossBladeBase';
    this.bladeBaseLocator.position.set(0, 0.35, 0);
    this.greatswordGroup.add(this.bladeBaseLocator);

    this.bladeTipLocator.name = 'BossBladeTip';
    this.bladeTipLocator.position.set(0, 1.7, 0);
    this.greatswordGroup.add(this.bladeTipLocator);
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
    await this.ensureGreatswordLoaded();

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
        this.updateIdle(delta, playerPos);
        break;
      case 'approach':
        this.updateApproach(delta, playerPos);
        break;
      case 'windup':
      case 'active':
      case 'recovery':
        this.updateAttackFrames(delta, playerPos);
        break;
      case 'stagger':
        this.updateStagger(delta);
        break;
      case 'phaseTransition':
        this.updatePhaseTransition(delta, playerPos);
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

  private updateIdle(delta: number, playerPos: THREE.Vector3): void {
    this.stateTimer += delta;
    this.faceTarget(playerPos, delta * 4.0);

    this.playAction('idle', 0.2, THREE.LoopRepeat, false, 1.0);

    const dist = this.distanceTo(playerPos);
    const idleLimit = this.isPhase2 ? 0.35 : 0.75;

    if (this.stateTimer >= idleLimit) {
      if (dist <= 3.2) {
        // Close range: quick kick, combo or downward slam
        const roll = Math.random();
        if (roll < 0.35) {
          this.chooseAttack(BOSS_ATTACKS.kick);
        } else if (roll < 0.70) {
          this.chooseAttack(BOSS_ATTACKS.downward);
        } else {
          this.chooseAttack(BOSS_ATTACKS.combo);
        }
      } else if (dist <= 5.5) {
        // Mid range: 360 spin, downward slam, or combo
        const roll = Math.random();
        if (this.isPhase2 && roll < 0.45) {
          this.chooseAttack(BOSS_ATTACKS.spin360);
        } else if (roll < 0.35) {
          this.chooseAttack(BOSS_ATTACKS.combo);
        } else if (roll < 0.70) {
          this.chooseAttack(BOSS_ATTACKS.downward);
        } else {
          this.state = 'approach';
          this.stateTimer = 0;
        }
      } else {
        // Long range (>5.5m): approach target, occasional leap
        if (Math.random() < 0.3) {
          this.chooseAttack(BOSS_ATTACKS.jump);
        } else {
          this.state = 'approach';
          this.stateTimer = 0;
        }
      }
    }
  }

  private updateApproach(delta: number, playerPos: THREE.Vector3): void {
    this.stateTimer += delta;
    this.faceTarget(playerPos, delta * 6.0);

    this.playAction('walking', 0.2, THREE.LoopRepeat, false, this.isPhase2 ? 1.3 : 1.0);

    const dist = this.distanceTo(playerPos);
    const speed = this.isPhase2 ? 4.2 : 3.2;

    const fwd = new THREE.Vector3(
      -Math.sin(this.group.rotation.y),
      0,
      -Math.cos(this.group.rotation.y)
    ).normalize();

    this.group.position.addScaledVector(fwd, speed * delta);

    if (dist <= 3.8 || this.stateTimer >= 2.2) {
      const roll = Math.random();
      if (this.isPhase2 && roll < 0.4) {
        this.chooseAttack(BOSS_ATTACKS.spin360);
      } else if (roll < 0.5) {
        this.chooseAttack(BOSS_ATTACKS.combo);
      } else {
        this.chooseAttack(BOSS_ATTACKS.downward);
      }
    }
  }

  public chooseAttack(attack: AttackDefinition): void {
    this.currentAttack = attack;
    this.attackTimer = 0;
    this.state = 'windup';
    this.hasHitCurrentSwing = false;
    this.hasSpawnedSlashArc = false;
    this.hasTriggeredGroundSlam = false;
    this.telegraphGlow = 0;

    const speedMod = this.isPhase2 ? 1.15 : 1.0;
    const totalDuration = (attack.startup + attack.active + attack.recovery) / speedMod;

    // Use specific clip defined in AttackDefinition (downward, combo, jump, 360, kick)
    const clipName = attack.animationClip || 'attack_heavy';
    const clip = ModelLoader.findClip(this.rawClips, clipName);
    const clipDuration = clip ? clip.duration : 2.5;
    const attackTimeScale = (clipDuration / totalDuration);

    this.playAction(clipName, 0.12, THREE.LoopOnce, true, attackTimeScale);
  }

  private updateAttackFrames(delta: number, playerPos: THREE.Vector3): void {
    if (!this.currentAttack) {
      this.state = 'idle';
      return;
    }

    this.attackTimer += delta;
    const speedMod = this.isPhase2 ? 1.15 : 1.0;
    const startup = this.currentAttack.startup / speedMod;
    const active = this.currentAttack.active / speedMod;
    const recovery = this.currentAttack.recovery / speedMod;

    if (this.attackTimer < startup) {
      this.state = 'windup';
      const progress = this.attackTimer / startup;
      if (progress < 0.75) {
        this.faceTarget(playerPos, delta * 4.0);
      }
      this.telegraphGlow = progress;
    } else if (this.attackTimer < startup + active) {
      if (this.state !== 'active') {
        this.state = 'active';
        if (!this.hasSpawnedSlashArc) {
          this.hasSpawnedSlashArc = true;
          this.vfxSystem?.spawnAttackSlashArc(
            this.group.position,
            this.group.rotation.y,
            this.currentAttack.name,
            this.currentAttack.isHeavy,
            true,
          );
        }
        if (this.currentAttack.animationClip === 'attack_jump') {
          this.triggerJumpGroundSlam();
        }
      }
      this.telegraphGlow = 1.0;

      const fwd = new THREE.Vector3(
        -Math.sin(this.group.rotation.y),
        0,
        -Math.cos(this.group.rotation.y)
      ).normalize();

      if (this.currentAttack.animationClip !== 'attack_jump') {
        const impulse = (this.currentAttack.forwardImpulse / active) * delta;
        this.group.position.addScaledVector(fwd, impulse);
      }
    } else if (this.attackTimer < startup + active + recovery) {
      this.state = 'recovery';
      this.telegraphGlow = Math.max(0, 1.0 - (this.attackTimer - startup - active) / (recovery * 0.5));
    } else {
      this.state = 'idle';
      this.stateTimer = 0;
      this.currentAttack = null;
      this.telegraphGlow = 0;
      this.playAction('idle', 0.2);
    }
  }

  public getBladeHitboxWorldPosition(target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    if (this.kinematicController && this.kinematicController.activeHitboxBone && this.currentAttack?.animationClip === 'kick') {
      return this.kinematicController.getHitboxWorldPosition(target);
    }
    this.bladeHitbox.updateMatrixWorld(true);
    return this.bladeHitbox.getWorldPosition(target);
  }

  public getWeaponBladeSegment(
    outBase = new THREE.Vector3(),
    outTip = new THREE.Vector3(),
  ): WeaponBladeSegment {
    if (this.bladeBaseLocator.parent && this.bladeTipLocator.parent) {
      this.bladeBaseLocator.updateMatrixWorld(true);
      this.bladeTipLocator.updateMatrixWorld(true);
      this.bladeBaseLocator.getWorldPosition(outBase);
      this.bladeTipLocator.getWorldPosition(outTip);
      return { base: outBase, tip: outTip, radius: 0.22 };
    }
    const fwd = new THREE.Vector3(
      -Math.sin(this.group.rotation.y),
      0,
      -Math.cos(this.group.rotation.y),
    );
    outBase.copy(this.group.position).add(new THREE.Vector3(0, 1.2, 0));
    outTip.copy(outBase).addScaledVector(fwd, 2.5);
    return { base: outBase, tip: outTip, radius: 0.22 };
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

  private updateStagger(delta: number): void {
    this.stateTimer += delta;
    if (this.stateTimer >= 2.2) {
      this.state = 'idle';
      this.stateTimer = 0;
      this.playAction('idle', 0.2);
    }
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

  private updatePhaseTransition(delta: number, playerPos?: THREE.Vector3): void {
    this.stateTimer += delta;
    if (playerPos) {
      this.faceTarget(playerPos, delta * 3.0);
    }
    this.telegraphGlow = Math.sin(this.stateTimer * 8.0) * 0.5 + 0.5;
    if (this.stateTimer >= 2.0) {
      this.state = 'idle';
      this.stateTimer = 0;
      this.telegraphGlow = 0;
      this.playAction('idle', 0.2);
    }
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

    this.bladeMaterial.color.copy(this.defaultBladeColor);
  }

  public dispose(): void {
    this.swordHitboxDebugger.dispose();
    this.footHitboxDebugger.dispose();
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    if (this.greatswordGroup.parent) {
      this.greatswordGroup.parent.remove(this.greatswordGroup);
    }
    if (this.swordObject) {
      this.swordObject.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
      this.swordObject = null;
    }
    this.greatswordGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
    this.bladeMaterial.dispose();
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

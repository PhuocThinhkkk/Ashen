import * as THREE from 'three';
import { type AttackDefinition, BOSS_ATTACKS } from '../combat/FrameCombat';
import { ModelLoader } from '../utils/ModelLoader';

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

  // Telegraph warning indicator
  public telegraphGlow = 0;

  // Weapon & Material
  public readonly greatswordGroup = new THREE.Group();
  public bladeMesh: THREE.Mesh | null = null;
  public readonly bladeHitbox = new THREE.Object3D();
  public readonly bladeMaterial: THREE.MeshStandardMaterial;
  public handBone: THREE.Object3D | null = null;

  // Model & Animation State
  public isLoaded = false;
  public loadPromise: Promise<void>;
  public mixer: THREE.AnimationMixer | null = null;
  public currentActionName = '';
  public currentModelId = 'titan';
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private currentAction: THREE.AnimationAction | null = null;
  private modelScene: THREE.Group | null = null;
  private rawClips: THREE.AnimationClip[] = [];

  public get modelId(): string {
    return this.currentModelId;
  }

  constructor(initialModelId = 'titan') {
    this.bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0x222428,
      emissive: 0xff4400,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.9,
    });

    this.buildGreatsword();
    this.loadPromise = this.loadModel(initialModelId);
  }

  private buildGreatsword(): void {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0x8c6d2c,
      roughness: 0.3,
      metalness: 0.85,
    });
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x2a1c0e,
      roughness: 0.7,
    });

    // Grip
    const gripGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.65, 8);
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.y = -0.32;
    grip.castShadow = true;
    this.greatswordGroup.add(grip);

    // Crossguard
    const guardGeo = new THREE.BoxGeometry(0.75, 0.1, 0.14);
    const guard = new THREE.Mesh(guardGeo, goldMat);
    guard.position.y = 0.04;
    guard.castShadow = true;
    this.greatswordGroup.add(guard);

    // Heavy Blade
    const bladeGeo = new THREE.BoxGeometry(0.22, 2.2, 0.04);
    this.bladeMesh = new THREE.Mesh(bladeGeo, this.bladeMaterial);
    this.bladeMesh.position.y = 1.15;
    this.bladeMesh.castShadow = true;
    this.greatswordGroup.add(this.bladeMesh);

    // Collision hitbox parented directly to the sword mesh
    this.bladeHitbox.name = 'BossBladeHitbox';
    this.bladeHitbox.position.set(0, 0, 0);
    this.bladeMesh.add(this.bladeHitbox);
  }

  public async loadModel(modelId: string): Promise<void> {
    this.isLoaded = false;
    this.currentModelId = modelId;

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

    // 3. Load GLTF model dynamically via ModelLoader
    const bossGltf = await ModelLoader.loadModel('boss', modelId);
    this.modelScene = bossGltf.scene;
    this.rawClips = bossGltf.animations;

    // Scale to 1.15x (~2.46m height) and align forward orientation (-Z)
    this.modelScene.scale.set(1.15, 1.15, 1.15);
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

    // 4. Locate target socket hand bone (specifically hand.R, handR, PalmR, Palm.R)
    this.handBone = ModelLoader.findSocketBone(this.modelScene, [
      'hand.R',
      'handR',
      'Palm.R',
      'PalmR',
      'RightHand',
      'mixamorigRightHand',
    ]);
    if (!this.handBone) {
      console.warn(`[BossCharacter] Hand socket bone not found in model "${modelId}".`);
    }

    // 5. Parent Greatsword directly to hand bone node with local rotation/position offsets
    if (this.handBone) {
      this.greatswordGroup.position.set(0, 0, 0);
      this.greatswordGroup.rotation.set(-Math.PI * 0.4, 0, 0.4);
      this.handBone.add(this.greatswordGroup);
      this.handBone.updateMatrixWorld(true);
      this.greatswordGroup.updateMatrixWorld(true);
      this.bladeHitbox.updateMatrixWorld(true);
    }

    // 6. Setup Animation Mixer with standardized clips
    this.mixer = new THREE.AnimationMixer(this.modelScene);

    for (const clip of bossGltf.animations) {
      ModelLoader.stripRootMotion(clip, 'hips');
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
    }

    this.group.add(this.modelScene);
    this.isLoaded = true;

    // Play initial idle animation
    this.playAction('idle', 0.1);
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

    action.reset();
    action.setLoop(loop, loop === THREE.LoopRepeat ? Infinity : 1);
    action.clampWhenFinished = clampWhenFinished;
    action.timeScale = timeScale;

    if (this.currentAction) {
      this.currentAction.crossFadeTo(action, fadeDuration, true);
    }
    action.play();
    this.currentAction = action;
    this.currentActionName = name;
    return action;
  }

  public update(delta: number, elapsed: number, playerPos: THREE.Vector3, arenaRadius: number): void {
    if (this.mixer) {
      this.mixer.update(delta);
    }
    if (this.modelScene) {
      this.modelScene.updateMatrixWorld(true);
    }
    if (this.handBone) {
      this.handBone.updateMatrixWorld(true);
      this.greatswordGroup.updateMatrixWorld(true);
      this.bladeHitbox.updateMatrixWorld(true);
    }

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

    // Visual flame glow pulsing
    const baseGlow = this.isPhase2 ? 0.9 : 0.35;
    this.bladeMaterial.emissiveIntensity = baseGlow + this.telegraphGlow * 1.5 + Math.sin(elapsed * 6.0) * 0.15;
  }

  private updateIdle(delta: number, playerPos: THREE.Vector3): void {
    this.stateTimer += delta;
    this.faceTarget(playerPos, delta * 4.0);

    this.playAction('idle', 0.2, THREE.LoopRepeat, false, 1.0);

    const dist = this.distanceTo(playerPos);
    const idleLimit = this.isPhase2 ? 0.4 : 0.8;

    if (this.stateTimer >= idleLimit) {
      if (dist <= 3.8) {
        this.chooseAttack(Math.random() > 0.5 ? BOSS_ATTACKS.sweep : BOSS_ATTACKS.slam);
      } else if (dist <= 7.5) {
        if (Math.random() > 0.4) {
          this.state = 'approach';
          this.stateTimer = 0;
        } else {
          this.chooseAttack(BOSS_ATTACKS.rush);
        }
      } else {
        this.chooseAttack(BOSS_ATTACKS.rush);
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

    if (dist <= 3.6 || this.stateTimer >= 2.5) {
      this.chooseAttack(Math.random() > 0.4 ? BOSS_ATTACKS.sweep : BOSS_ATTACKS.slam);
    }
  }

  private chooseAttack(attack: AttackDefinition): void {
    this.currentAttack = attack;
    this.attackTimer = 0;
    this.state = 'windup';
    this.hasHitCurrentSwing = false;
    this.telegraphGlow = 0;

    const speedMod = this.isPhase2 ? 1.15 : 1.0;
    const totalDuration = (attack.startup + attack.active + attack.recovery) / speedMod;
    const attackTimeScale = 2.25 / totalDuration;

    this.playAction('attack', 0.15, THREE.LoopOnce, true, attackTimeScale);
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
      this.state = 'active';
      this.telegraphGlow = 1.0;

      const fwd = new THREE.Vector3(
        -Math.sin(this.group.rotation.y),
        0,
        -Math.cos(this.group.rotation.y)
      ).normalize();

      const impulse = (this.currentAttack.forwardImpulse / active) * delta;
      this.group.position.addScaledVector(fwd, impulse);
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
    this.bladeHitbox.updateMatrixWorld(true);
    return this.bladeHitbox.getWorldPosition(target);
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
    this.bladeMaterial.color.setHex(0x551100);
    this.bladeMaterial.emissive.setHex(0xff3300);
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
    this.telegraphGlow = 0;

    this.group.position.copy(spawnPos);
    this.group.position.y = 0;
    this.group.rotation.set(0, Math.PI, 0);

    this.bladeMaterial.color.setHex(0x222428);
    this.bladeMaterial.emissive.setHex(0xff4400);

    this.playAction('idle', 0.1);
  }

  public dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    if (this.greatswordGroup.parent) {
      this.greatswordGroup.parent.remove(this.greatswordGroup);
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

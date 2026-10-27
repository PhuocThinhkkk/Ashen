import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  type AttackDefinition,
  type DodgeDefinition,
  PLAYER_ATTACKS,
  PLAYER_DODGE,
} from '../combat/FrameCombat';
import type { CombatInputs } from '../core/InputController';

export type PlayerState = 'idle' | 'moving' | 'dodge' | 'attack' | 'stagger' | 'dead';

function processInPlace(clip: THREE.AnimationClip, rootBoneName: string): void {
  const rootLower = rootBoneName.toLowerCase();
  for (const track of clip.tracks) {
    if (track instanceof THREE.VectorKeyframeTrack && track.name.endsWith('.position')) {
      const boneName = track.name.split('.')[0].toLowerCase();
      if (boneName === rootLower || boneName.endsWith(`|${rootLower}`)) {
        const v = track.values;
        const x0 = v[0];
        const z0 = v[2];
        for (let i = 0; i < v.length; i += 3) {
          v[i] = x0;
          v[i + 2] = z0;
        }
      }
    }
  }
}

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

  // Dodge Frame Data
  public readonly dodgeConfig: DodgeDefinition = PLAYER_DODGE;
  public dodgeTimer = 0;
  public dodgeDirection = new THREE.Vector3();
  public isInvulnerable = false;

  // Stagger
  public staggerTimer = 0;

  // Model & Animation State
  public isLoaded = false;
  public readonly loadPromise: Promise<void>;
  public mixer: THREE.AnimationMixer | null = null;
  public currentActionName = '';
  public handBone: THREE.Object3D | null = null;
  public swordObject: THREE.Object3D | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private currentAction: THREE.AnimationAction | null = null;
  private modelScene: THREE.Group | null = null;

  constructor() {
    this.loadPromise = this.loadAssets();
  }

  private async loadAssets(): Promise<void> {
    const loader = new GLTFLoader();

    // 1. Load Player Knight model
    const knightGltf = await loader.loadAsync('/assets/test-models/KnightCharacter.glb');
    this.modelScene = knightGltf.scene;

    // Scale to exactly 1.80m height and orient to Three.js standard -Z forward
    const rawBox = new THREE.Box3().setFromObject(this.modelScene);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    const scaleFactor = 1.80 / (rawSize.y || 1);
    this.modelScene.scale.set(scaleFactor, scaleFactor, scaleFactor);
    this.modelScene.rotation.y = Math.PI;
    this.modelScene.updateMatrixWorld(true);

    // Shadows & bone search
    this.modelScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
      if (obj instanceof THREE.Bone) {
        const name = obj.name.toLowerCase();
        if (name === 'palmr' || name === 'palm.r' || name.includes('palmr') || name.includes('middlehand.r')) {
          this.handBone = obj;
        }
      }
    });

    // 2. Load Weapon (Sword.glb) and socket into PalmR bone
    const swordGltf = await loader.loadAsync('/assets/test-models/Sword.glb');
    this.swordObject = swordGltf.scene;
    this.swordObject.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
      }
    });
    this.swordObject.position.set(0, 0, 0);
    this.swordObject.rotation.set(0, 0, 0);
    this.swordObject.scale.set(0.01, 0.01, 0.01);

    if (this.handBone) {
      this.handBone.add(this.swordObject);
    }

    // 3. Process animations and strip root motion
    this.mixer = new THREE.AnimationMixer(this.modelScene);

    for (const clip of knightGltf.animations) {
      processInPlace(clip, 'Hips');
      processInPlace(clip, 'Body');
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
    }

    this.group.add(this.modelScene);
    this.isLoaded = true;

    // Start in idle posture
    this.playAction('HumanArmature|Idle_swordRight', 0.1);
  }

  public playAction(
    name: string,
    fadeDuration = 0.15,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat,
    clampWhenFinished = false,
    timeScale = 1.0,
  ): THREE.AnimationAction | null {
    const action = this.actions.get(name);
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

  public update(
    delta: number,
    elapsed: number,
    inputs: CombatInputs,
    cameraYaw: number,
    lockedTargetPos: THREE.Vector3 | null,
    arenaRadius: number,
  ): void {
    if (this.mixer) {
      this.mixer.update(delta);
    }

    if (this.state === 'dead') {
      if (this.currentActionName !== 'HumanArmature|Death') {
        this.playAction('HumanArmature|Death', 0.1, THREE.LoopOnce, true, 1.0);
      }
      return;
    }

    // 1. Stamina Regeneration
    if (this.staminaRegenDelay > 0) {
      this.staminaRegenDelay -= delta;
    } else if (this.stamina < this.maxStamina && this.state !== 'dodge' && this.state !== 'attack') {
      const regenRate = inputs.sprint && inputs.move.lengthSq() > 0 ? 0 : 36.0;
      this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * delta);
    }

    // 2. Handle Current State
    switch (this.state) {
      case 'dodge':
        this.updateDodge(delta);
        break;
      case 'attack':
        this.updateAttack(delta, inputs, lockedTargetPos);
        break;
      case 'stagger':
        this.updateStagger(delta);
        break;
      case 'idle':
      case 'moving':
        this.updateLocomotion(delta, elapsed, inputs, cameraYaw, lockedTargetPos);
        break;
    }

    // 3. Keep Inside Arena
    const maxR = arenaRadius - this.radius - 0.5;
    const distSq = this.group.position.x * this.group.position.x + this.group.position.z * this.group.position.z;
    if (distSq > maxR * maxR) {
      const dist = Math.sqrt(distSq);
      this.group.position.x = (this.group.position.x / dist) * maxR;
      this.group.position.z = (this.group.position.z / dist) * maxR;
    }
  }

  private updateLocomotion(
    delta: number,
    _elapsed: number,
    inputs: CombatInputs,
    cameraYaw: number,
    lockedTargetPos: THREE.Vector3 | null,
  ): void {
    // Check Dodge input first (high priority)
    if (inputs.dodge && this.stamina >= this.dodgeConfig.staminaCost) {
      this.startDodge(inputs, cameraYaw);
      return;
    }

    // Check Attack input
    if (inputs.lightAttack && this.stamina >= PLAYER_ATTACKS.light1.staminaCost) {
      if (lockedTargetPos) {
        const dx = lockedTargetPos.x - this.group.position.x;
        const dz = lockedTargetPos.z - this.group.position.z;
        this.group.rotation.y = Math.atan2(-dx, -dz);
      }
      this.startAttack(PLAYER_ATTACKS.light1, 1);
      return;
    }
    if (inputs.heavyAttack && this.stamina >= PLAYER_ATTACKS.heavy.staminaCost) {
      if (lockedTargetPos) {
        const dx = lockedTargetPos.x - this.group.position.x;
        const dz = lockedTargetPos.z - this.group.position.z;
        this.group.rotation.y = Math.atan2(-dx, -dz);
      }
      this.startAttack(PLAYER_ATTACKS.heavy, 0);
      return;
    }

    // Camera-relative direction calculation
    const sinYaw = Math.sin(cameraYaw);
    const cosYaw = Math.cos(cameraYaw);
    const fwdX = -sinYaw;
    const fwdZ = -cosYaw;
    const rightX = cosYaw;
    const rightZ = -sinYaw;

    const moveDirX = inputs.move.x * rightX - inputs.move.y * fwdX;
    const moveDirZ = inputs.move.x * rightZ - inputs.move.y * fwdZ;
    const moveMag = Math.sqrt(moveDirX * moveDirX + moveDirZ * moveDirZ);

    if (moveMag > 0.05) {
      const isSprinting = inputs.sprint && this.stamina > 5;
      const speed = isSprinting ? 7.2 : 4.4;

      if (isSprinting) {
        this.stamina = Math.max(0, this.stamina - 14 * delta);
        this.staminaRegenDelay = 0.8;
      }

      this.velocity.x = (moveDirX / moveMag) * speed;
      this.velocity.z = (moveDirZ / moveMag) * speed;
      this.group.position.x += this.velocity.x * delta;
      this.group.position.z += this.velocity.z * delta;

      // Facing Direction
      if (lockedTargetPos) {
        const dx = lockedTargetPos.x - this.group.position.x;
        const dz = lockedTargetPos.z - this.group.position.z;
        const targetAngle = Math.atan2(-dx, -dz);
        let diff = targetAngle - this.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.group.rotation.y += diff * Math.min(1.0, delta * 12.0);
      } else {
        const targetAngle = Math.atan2(-this.velocity.x, -this.velocity.z);
        let diff = targetAngle - this.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.group.rotation.y += diff * Math.min(1.0, delta * 14.0);
      }

      this.state = 'moving';
      if (isSprinting) {
        this.playAction('HumanArmature|Run', 0.15, THREE.LoopRepeat, false, 1.0);
      } else {
        this.playAction('HumanArmature|Walking', 0.15, THREE.LoopRepeat, false, 1.0);
      }
    } else {
      this.velocity.set(0, 0, 0);
      this.state = 'idle';

      if (lockedTargetPos) {
        const dx = lockedTargetPos.x - this.group.position.x;
        const dz = lockedTargetPos.z - this.group.position.z;
        const targetAngle = Math.atan2(-dx, -dz);
        let diff = targetAngle - this.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.group.rotation.y += diff * Math.min(1.0, delta * 10.0);
      }

      this.playAction('HumanArmature|Idle_swordRight', 0.2, THREE.LoopRepeat, false, 1.0);
    }
  }

  private startDodge(inputs: CombatInputs, cameraYaw: number): void {
    this.state = 'dodge';
    this.dodgeTimer = 0;
    this.isInvulnerable = false;
    this.stamina -= this.dodgeConfig.staminaCost;
    this.staminaRegenDelay = 1.0;

    // Compute dodge direction
    if (inputs.move.lengthSq() > 0.05) {
      const sinYaw = Math.sin(cameraYaw);
      const cosYaw = Math.cos(cameraYaw);
      const fwdX = -sinYaw;
      const fwdZ = -cosYaw;
      const rightX = cosYaw;
      const rightZ = -sinYaw;

      this.dodgeDirection.set(
        inputs.move.x * rightX - inputs.move.y * fwdX,
        0,
        inputs.move.x * rightZ - inputs.move.y * fwdZ,
      ).normalize();
    } else {
      this.dodgeDirection.set(
        Math.sin(this.group.rotation.y),
        0,
        Math.cos(this.group.rotation.y),
      ).normalize();
    }

    this.group.rotation.y = Math.atan2(-this.dodgeDirection.x, -this.dodgeDirection.z);
    this.playAction('HumanArmature|Roll_sword', 0.08, THREE.LoopOnce, true, 2.5);
  }

  private updateDodge(delta: number): void {
    this.dodgeTimer += delta;

    this.isInvulnerable =
      this.dodgeTimer >= this.dodgeConfig.invulnerableStart &&
      this.dodgeTimer <= this.dodgeConfig.invulnerableEnd;

    const progress = this.dodgeTimer / this.dodgeConfig.duration;
    const speedCurve = Math.cos(progress * Math.PI * 0.5);
    const speed = this.dodgeConfig.speed * speedCurve;

    this.group.position.addScaledVector(this.dodgeDirection, speed * delta);

    if (this.dodgeTimer >= this.dodgeConfig.duration) {
      this.state = 'idle';
      this.isInvulnerable = false;
      this.playAction('HumanArmature|Idle_swordRight', 0.15);
    }
  }

  public startAttack(attack: AttackDefinition, comboStep: number): void {
    this.state = 'attack';
    this.currentAttack = attack;
    this.attackTimer = 0;
    this.attackPhase = 'startup';
    this.comboStep = comboStep;
    this.comboQueued = false;
    this.hasHitCurrentSwing = false;

    this.stamina = Math.max(0, this.stamina - attack.staminaCost);
    this.staminaRegenDelay = 1.1;

    if (attack.isHeavy) {
      this.playAction('HumanArmature|swordAttackJump', 0.08, THREE.LoopOnce, true, 0.95);
    } else {
      this.playAction('HumanArmature|Run_swordAttack', 0.08, THREE.LoopOnce, true, 1.15);
    }
  }

  private updateAttack(delta: number, inputs: CombatInputs, lockedTargetPos: THREE.Vector3 | null = null): void {
    if (!this.currentAttack) {
      this.state = 'idle';
      return;
    }

    this.attackTimer += delta;

    if (this.attackPhase === 'recovery' && inputs.lightAttack && this.comboStep > 0 && this.comboStep < 3) {
      this.comboQueued = true;
    }

    const { startup, active, recovery, forwardImpulse } = this.currentAttack;

    if (this.attackTimer < startup) {
      this.attackPhase = 'startup';
      if (lockedTargetPos) {
        const dx = lockedTargetPos.x - this.group.position.x;
        const dz = lockedTargetPos.z - this.group.position.z;
        const targetAngle = Math.atan2(-dx, -dz);
        let diff = targetAngle - this.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.group.rotation.y += diff * Math.min(1.0, delta * 8.0);
      }
      const step = (delta / startup) * forwardImpulse * 0.2;
      const fwd = new THREE.Vector3(-Math.sin(this.group.rotation.y), 0, -Math.cos(this.group.rotation.y));
      this.group.position.addScaledVector(fwd, step);
    } else if (this.attackTimer < startup + active) {
      this.attackPhase = 'active';
      const step = (delta / active) * forwardImpulse * 0.8;
      const fwd = new THREE.Vector3(-Math.sin(this.group.rotation.y), 0, -Math.cos(this.group.rotation.y));
      this.group.position.addScaledVector(fwd, step);
    } else if (this.attackTimer < startup + active + recovery) {
      this.attackPhase = 'recovery';
    } else {
      if (this.comboQueued && this.comboStep === 1 && this.stamina >= PLAYER_ATTACKS.light2.staminaCost) {
        this.startAttack(PLAYER_ATTACKS.light2, 2);
      } else if (this.comboQueued && this.comboStep === 2 && this.stamina >= PLAYER_ATTACKS.light3.staminaCost) {
        this.startAttack(PLAYER_ATTACKS.light3, 3);
      } else {
        this.state = 'idle';
        this.currentAttack = null;
        this.attackPhase = 'none';
        this.comboStep = 0;
        this.comboQueued = false;
        this.playAction('HumanArmature|Idle_swordRight', 0.15);
      }
    }
  }

  public takeDamage(damage: number, isHeavy: boolean): boolean {
    if (this.isInvulnerable || this.state === 'dead') return false;

    this.hp = Math.max(0, this.hp - damage);

    if (this.hp <= 0) {
      this.state = 'dead';
      this.velocity.set(0, 0, 0);
      this.playAction('HumanArmature|Death', 0.1, THREE.LoopOnce, true, 1.0);
      return true;
    }

    if (isHeavy || this.state !== 'attack') {
      this.state = 'stagger';
      this.staggerTimer = isHeavy ? 0.45 : 0.25;
      this.currentAttack = null;
      // Stagger fallback: rapid blend to idle flinch
      this.playAction('HumanArmature|Idle', 0.05, THREE.LoopRepeat, false, 1.5);
    }

    return true;
  }

  private updateStagger(delta: number): void {
    this.staggerTimer -= delta;
    if (this.staggerTimer <= 0) {
      this.state = 'idle';
      this.playAction('HumanArmature|Idle_swordRight', 0.15);
    }
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
    this.isInvulnerable = false;
    this.dodgeTimer = 0;
    this.staggerTimer = 0;

    this.group.position.copy(spawnPos);
    this.group.position.y = 0;
    this.group.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, 0);

    this.playAction('HumanArmature|Idle_swordRight', 0.1);
  }

  public dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
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

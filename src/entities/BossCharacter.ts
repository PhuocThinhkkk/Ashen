import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { type AttackDefinition, BOSS_ATTACKS } from '../combat/FrameCombat';

export type BossState =
  | 'idle'
  | 'approach'
  | 'windup'
  | 'active'
  | 'recovery'
  | 'stagger'
  | 'phaseTransition'
  | 'dead';

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
  public readonly bladeMaterial: THREE.MeshStandardMaterial;
  public handBone: THREE.Object3D | null = null;

  // Model & Animation State
  public isLoaded = false;
  public readonly loadPromise: Promise<void>;
  public mixer: THREE.AnimationMixer | null = null;
  public currentActionName = '';
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private currentAction: THREE.AnimationAction | null = null;
  private modelScene: THREE.Group | null = null;

  constructor() {
    this.bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0x222428,
      emissive: 0xff4400,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.9,
    });

    this.buildGreatsword();
    this.loadPromise = this.loadAssets();
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
    const blade = new THREE.Mesh(bladeGeo, this.bladeMaterial);
    blade.position.y = 1.15;
    blade.castShadow = true;
    this.greatswordGroup.add(blade);
  }

  private async loadAssets(): Promise<void> {
    const loader = new GLTFLoader();

    const bossGltf = await loader.loadAsync('/assets/test-models/enemy_2.glb');
    this.modelScene = bossGltf.scene;

    // Scale to 1.15x (~2.46m height) and align forward orientation (-Z)
    this.modelScene.scale.set(1.15, 1.15, 1.15);
    this.modelScene.rotation.y = Math.PI;
    this.modelScene.updateMatrixWorld(true);

    // Hide helper meshes (hand_shape and Cylinder) and find handR bone
    this.modelScene.traverse((obj) => {
      if (obj.name === 'hand_shape' || obj.name === 'Cylinder') {
        obj.visible = false;
      }
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
      if (obj instanceof THREE.Bone || (obj as any).isBone) {
        const name = obj.name.toLowerCase();
        if (name === 'handr' || name === 'hand.r' || name.includes('handr') || name.includes('hand.r')) {
          this.handBone = obj;
        }
      }
    });

    // Socket verified greatsword model to handR bone
    if (this.handBone) {
      this.greatswordGroup.position.set(0, 0, 0);
      this.greatswordGroup.rotation.set(-Math.PI * 0.4, 0, 0.4);
      this.handBone.add(this.greatswordGroup);
    }

    // Process animations
    this.mixer = new THREE.AnimationMixer(this.modelScene);

    for (const clip of bossGltf.animations) {
      processInPlace(clip, 'hips');
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
    }

    this.group.add(this.modelScene);
    this.isLoaded = true;

    // Play initial idle
    this.playAction('idle', 0.1);
  }

  public playAction(
    name: string,
    fadeDuration = 0.2,
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

  public update(delta: number, elapsed: number, playerPos: THREE.Vector3, arenaRadius: number): void {
    if (this.mixer) {
      this.mixer.update(delta);
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
    this.playAction('taunt', 0.2, THREE.LoopOnce, true, 1.0);
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

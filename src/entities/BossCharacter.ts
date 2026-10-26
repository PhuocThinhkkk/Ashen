import * as THREE from 'three';
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

  // Meshes & Weapon Sockets
  private readonly bodyMesh: THREE.Mesh;
  private readonly greatswordGroup = new THREE.Group();
  private readonly bladeMaterial: THREE.MeshStandardMaterial;

  constructor() {
    // 1. Materials
    const obsidianArmorMat = new THREE.MeshStandardMaterial({
      color: 0x14161a,
      roughness: 0.35,
      metalness: 0.88,
    });
    const darkGoldMat = new THREE.MeshStandardMaterial({
      color: 0x7a5e2a,
      roughness: 0.4,
      metalness: 0.8,
    });
    const emberEyeMat = new THREE.MeshBasicMaterial({
      color: 0xff3300,
    });
    this.bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0x222428,
      emissive: 0xff4400,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.9,
    });

    // 2. Imposing Boss Silhouette (Height ~2.8m)
    // Legs & Base
    const torsoGeo = new THREE.CylinderGeometry(0.55, 0.45, 1.2, 10);
    this.bodyMesh = new THREE.Mesh(torsoGeo, obsidianArmorMat);
    this.bodyMesh.position.y = 1.6;
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.group.add(this.bodyMesh);

    // Heavy Pauldrons
    const pauldronGeo = new THREE.BoxGeometry(0.48, 0.36, 0.55);
    const pLeft = new THREE.Mesh(pauldronGeo, darkGoldMat);
    pLeft.position.set(-0.78, 2.1, 0);
    pLeft.castShadow = true;
    this.group.add(pLeft);

    const pRight = new THREE.Mesh(pauldronGeo, darkGoldMat);
    pRight.position.set(0.78, 2.1, 0);
    pRight.castShadow = true;
    this.group.add(pRight);

    // Horned Great Helm
    const helmGeo = new THREE.BoxGeometry(0.52, 0.58, 0.56);
    const helm = new THREE.Mesh(helmGeo, obsidianArmorMat);
    helm.position.set(0, 2.45, 0);
    helm.castShadow = true;

    // Glowing Horns
    const hornGeo = new THREE.ConeGeometry(0.12, 0.65, 6);
    const hornL = new THREE.Mesh(hornGeo, darkGoldMat);
    hornL.position.set(-0.28, 0.35, -0.05);
    hornL.rotation.z = 0.5;
    hornL.rotation.x = -0.2;
    helm.add(hornL);

    const hornR = new THREE.Mesh(hornGeo, darkGoldMat);
    hornR.position.set(0.28, 0.35, -0.05);
    hornR.rotation.z = -0.5;
    hornR.rotation.x = -0.2;
    helm.add(hornR);

    // Slit Eye Visor
    const eyeGeo = new THREE.BoxGeometry(0.38, 0.06, 0.08);
    const eyes = new THREE.Mesh(eyeGeo, emberEyeMat);
    eyes.position.set(0, 0.05, -0.29);
    helm.add(eyes);
    this.group.add(helm);

    // Massive Two-Handed Greatsword
    this.buildGreatsword();
    this.greatswordGroup.position.set(0.85, 1.4, -0.3);
    this.greatswordGroup.rotation.set(-0.4, 0.2, -0.5);
    this.group.add(this.greatswordGroup);
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

    // Massive Crossguard
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

  public update(delta: number, elapsed: number, playerPos: THREE.Vector3, arenaRadius: number): void {
    if (this.state === 'dead') return;

    // Poise passive regeneration
    if (this.poise < this.maxPoise && this.state !== 'stagger') {
      this.poise = Math.min(this.maxPoise, this.poise + delta * 12.0);
    }

    // Phase 2 check (under 50% HP)
    if (!this.isPhase2 && this.hp <= this.maxHp * 0.5 && this.state !== 'phaseTransition') {
      this.triggerPhase2();
      return;
    }

    // Finite State Machine
    switch (this.state) {
      case 'idle':
        this.updateIdle(delta, playerPos);
        break;
      case 'approach':
        this.updateApproach(delta, elapsed, playerPos);
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
        this.updatePhaseTransition(delta);
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

    const dist = this.distanceTo(playerPos);
    const idleLimit = this.isPhase2 ? 0.4 : 0.8;

    if (this.stateTimer >= idleLimit) {
      if (dist <= 3.8) {
        // Close range: choose between Sweep or Slam
        this.chooseAttack(Math.random() > 0.5 ? BOSS_ATTACKS.sweep : BOSS_ATTACKS.slam);
      } else if (dist <= 7.5) {
        // Medium range: approach or rush
        if (Math.random() > 0.4) {
          this.state = 'approach';
          this.stateTimer = 0;
        } else {
          this.chooseAttack(BOSS_ATTACKS.rush);
        }
      } else {
        // Far range: rush gap closer or approach
        this.chooseAttack(BOSS_ATTACKS.rush);
      }
    }
  }

  private updateApproach(delta: number, elapsed: number, playerPos: THREE.Vector3): void {
    this.stateTimer += delta;
    this.faceTarget(playerPos, delta * 6.0);

    const dist = this.distanceTo(playerPos);
    const speed = this.isPhase2 ? 4.2 : 3.2;

    // Walk forward
    const fwd = new THREE.Vector3(
      -Math.sin(this.group.rotation.y),
      0,
      -Math.cos(this.group.rotation.y)
    ).normalize();

    this.group.position.addScaledVector(fwd, speed * delta);
    this.group.position.y = Math.sin(elapsed * 8.0) * 0.04;

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
      // Slow turn tracking during windup, stops tracking right before release
      const progress = this.attackTimer / startup;
      if (progress < 0.75) {
        this.faceTarget(playerPos, delta * 4.0);
      }

      // Visual telegraph tell: blade draws back and glows with intense heat
      this.telegraphGlow = progress;

      if (this.currentAttack.name === 'Ashen Cleave') {
        // Draw blade back to right shoulder
        this.greatswordGroup.rotation.set(-0.8 - 0.6 * progress, 0.4 + 1.2 * progress, -0.6);
      } else if (this.currentAttack.name === 'Sundering Smite') {
        // Raise sword high overhead with both hands
        this.greatswordGroup.rotation.set(-2.2 * progress, 0.1, 0.2);
        this.greatswordGroup.position.set(0, 1.8 + 0.4 * progress, -0.1);
      } else {
        // Ash Rush: crouch stance
        this.greatswordGroup.rotation.set(-0.2, 0.1, -0.4);
      }
    } else if (this.attackTimer < startup + active) {
      this.state = 'active';
      this.telegraphGlow = 1.0;

      // Forward lunge impulse
      const fwd = new THREE.Vector3(
        -Math.sin(this.group.rotation.y),
        0,
        -Math.cos(this.group.rotation.y)
      ).normalize();

      const impulse = (this.currentAttack.forwardImpulse / active) * delta;
      this.group.position.addScaledVector(fwd, impulse);

      const activeProgress = (this.attackTimer - startup) / active;

      if (this.currentAttack.name === 'Ashen Cleave') {
        // Swift horizontal slash from right to left
        this.greatswordGroup.rotation.set(0.2, 1.6 - 3.2 * activeProgress, 0.3);
      } else if (this.currentAttack.name === 'Sundering Smite') {
        // Overhead smash slamming into the arena floor
        this.greatswordGroup.rotation.set(-2.2 + 2.8 * activeProgress, 0, 0);
        this.greatswordGroup.position.set(0, 2.2 - 1.2 * activeProgress, -0.6);
      } else {
        // Forward piercing thrust
        this.greatswordGroup.rotation.set(1.4, 0, 0);
        this.greatswordGroup.position.set(0, 1.4, -0.8 - activeProgress * 0.6);
      }
    } else if (this.attackTimer < startup + active + recovery) {
      this.state = 'recovery'; // PUNISH WINDOW!
      this.telegraphGlow = Math.max(0, 1.0 - (this.attackTimer - startup - active) / (recovery * 0.5));

      // Blade resting on ground during recovery
      const recProgress = (this.attackTimer - startup - active) / recovery;
      if (recProgress > 0.8) {
        // Slowly lifting back up
        this.greatswordGroup.rotation.set(-0.4, 0.2, -0.5);
        this.greatswordGroup.position.set(0.85, 1.4, -0.3);
      }
    } else {
      // Finished: return to idle
      this.state = 'idle';
      this.stateTimer = 0;
      this.currentAttack = null;
      this.telegraphGlow = 0;
      this.greatswordGroup.rotation.set(-0.4, 0.2, -0.5);
      this.greatswordGroup.position.set(0.85, 1.4, -0.3);
    }
  }

  public takeDamage(damage: number, poiseDamage: number): boolean {
    if (this.state === 'dead') return false;

    this.hp = Math.max(0, this.hp - damage);

    if (this.hp <= 0) {
      this.state = 'dead';
      this.group.rotation.x = -Math.PI / 2; // collapse forward
      this.group.position.y = 0.4;
      return true;
    }

    // Poise break / stagger check
    this.poise -= poiseDamage;
    if (this.poise <= 0 && this.state !== 'stagger' && this.state !== 'phaseTransition') {
      this.state = 'stagger';
      this.stateTimer = 0;
      this.currentAttack = null;
      this.poise = this.maxPoise;
      this.group.position.y = 0.4; // drop to one knee
    }

    return true;
  }

  private updateStagger(delta: number): void {
    this.stateTimer += delta;
    if (this.stateTimer >= 2.2) {
      // Recover from stagger
      this.state = 'idle';
      this.stateTimer = 0;
      this.group.position.y = 0;
    }
  }

  private triggerPhase2(): void {
    this.isPhase2 = true;
    this.state = 'phaseTransition';
    this.stateTimer = 0;
    this.currentAttack = null;
    this.bladeMaterial.color.setHex(0x551100);
    this.bladeMaterial.emissive.setHex(0xff3300);
  }

  private updatePhaseTransition(delta: number): void {
    this.stateTimer += delta;
    // Roar & ignite animation
    this.telegraphGlow = Math.sin(this.stateTimer * 8.0) * 0.5 + 0.5;
    if (this.stateTimer >= 2.0) {
      this.state = 'idle';
      this.stateTimer = 0;
      this.telegraphGlow = 0;
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
    this.group.rotation.set(0, Math.PI, 0); // Face player (+Z)
    this.greatswordGroup.rotation.set(-0.4, 0.2, -0.5);
    this.greatswordGroup.position.set(0.85, 1.4, -0.3);
    this.bladeMaterial.emissive.setHex(0xff4400);
  }

  public dispose(): void {
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

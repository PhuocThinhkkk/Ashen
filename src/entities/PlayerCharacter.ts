import * as THREE from 'three';
import {
  type AttackDefinition,
  type DodgeDefinition,
  PLAYER_ATTACKS,
  PLAYER_DODGE,
} from '../combat/FrameCombat';
import type { CombatInputs } from '../core/InputController';

export type PlayerState = 'idle' | 'moving' | 'dodge' | 'attack' | 'stagger' | 'dead';

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

  // Meshes & Sockets
  private readonly swordGroup = new THREE.Group();
  private readonly bodyMesh: THREE.Mesh;
  private readonly helmMesh: THREE.Mesh;
  private readonly capeMesh: THREE.Mesh;
  private swordBaseRotation = new THREE.Euler(0, 0, 0);

  constructor() {
    // 1. Build Player Mesh Hierarchy (Atmospheric Stylized Dark Knight)
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x222a36,
      roughness: 0.45,
      metalness: 0.75,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0x9b7b3a,
      roughness: 0.35,
      metalness: 0.85,
    });
    const visorMat = new THREE.MeshBasicMaterial({
      color: 0x44ddff,
    });
    const capeMat = new THREE.MeshStandardMaterial({
      color: 0x181e28,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });

    // Torso / Plate
    const bodyGeo = new THREE.CapsuleGeometry(0.38, 0.72, 6, 12);
    this.bodyMesh = new THREE.Mesh(bodyGeo, armorMat);
    this.bodyMesh.position.y = 0.85;
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.group.add(this.bodyMesh);

    // Pauldrons (Shoulders)
    const pauldronGeo = new THREE.BoxGeometry(0.24, 0.18, 0.32);
    const pLeft = new THREE.Mesh(pauldronGeo, goldMat);
    pLeft.position.set(-0.46, 1.15, 0);
    pLeft.castShadow = true;
    this.group.add(pLeft);

    const pRight = new THREE.Mesh(pauldronGeo, goldMat);
    pRight.position.set(0.46, 1.15, 0);
    pRight.castShadow = true;
    this.group.add(pRight);

    // Helmet with glowing slit
    const helmGeo = new THREE.BoxGeometry(0.36, 0.4, 0.4);
    this.helmMesh = new THREE.Mesh(helmGeo, armorMat);
    this.helmMesh.position.set(0, 1.5, 0);
    this.helmMesh.castShadow = true;

    const visorGeo = new THREE.BoxGeometry(0.26, 0.05, 0.06);
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.position.set(0, 0.04, -0.21);
    this.helmMesh.add(visorMesh);
    this.group.add(this.helmMesh);

    // Flowing Cape
    const capeGeo = new THREE.PlaneGeometry(0.7, 1.1, 4, 4);
    this.capeMesh = new THREE.Mesh(capeGeo, capeMat);
    this.capeMesh.position.set(0, 0.9, 0.28);
    this.capeMesh.rotation.x = 0.15;
    this.capeMesh.castShadow = true;
    this.group.add(this.capeMesh);

    // Sword in Right Hand Socket
    this.buildSword();
    this.swordGroup.position.set(0.5, 0.8, -0.2);
    this.swordBaseRotation.set(-0.3, 0.2, -0.4);
    this.swordGroup.rotation.copy(this.swordBaseRotation);
    this.group.add(this.swordGroup);
  }

  private buildSword(): void {
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xc8d4e4,
      roughness: 0.25,
      metalness: 0.95,
    });
    const hiltMat = new THREE.MeshStandardMaterial({
      color: 0x6a4a22,
      roughness: 0.6,
      metalness: 0.2,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xb5954a,
      roughness: 0.35,
      metalness: 0.85,
    });

    // Grip
    const gripGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.32, 8);
    const grip = new THREE.Mesh(gripGeo, hiltMat);
    grip.position.y = -0.16;
    grip.castShadow = true;
    this.swordGroup.add(grip);

    // Crossguard
    const guardGeo = new THREE.BoxGeometry(0.36, 0.05, 0.08);
    const guard = new THREE.Mesh(guardGeo, goldMat);
    guard.position.y = 0.02;
    guard.castShadow = true;
    this.swordGroup.add(guard);

    // Pommel
    const pommelGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const pommel = new THREE.Mesh(pommelGeo, goldMat);
    pommel.position.y = -0.34;
    pommel.castShadow = true;
    this.swordGroup.add(pommel);

    // Blade
    const bladeGeo = new THREE.BoxGeometry(0.10, 1.15, 0.02);
    const blade = new THREE.Mesh(bladeGeo, steelMat);
    blade.position.y = 0.62;
    blade.castShadow = true;
    this.swordGroup.add(blade);
  }

  public update(
    delta: number,
    elapsed: number,
    inputs: CombatInputs,
    cameraYaw: number,
    lockedTargetPos: THREE.Vector3 | null,
    arenaRadius: number,
  ): void {
    if (this.state === 'dead') return;

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
        this.updateAttack(delta, inputs);
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

    // 4. Update Weapon Visuals during attacks
    this.updateSwordAnimation(delta);
  }

  private updateLocomotion(
    delta: number,
    elapsed: number,
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
      this.startAttack(PLAYER_ATTACKS.light1, 1);
      return;
    }
    if (inputs.heavyAttack && this.stamina >= PLAYER_ATTACKS.heavy.staminaCost) {
      this.startAttack(PLAYER_ATTACKS.heavy, 0);
      return;
    }

    // Camera-relative direction calculation
    // Camera forward is (-sin(yaw), 0, -cos(yaw))
    // Camera right is (cos(yaw), 0, -sin(yaw))
    const sinYaw = Math.sin(cameraYaw);
    const cosYaw = Math.cos(cameraYaw);

    const fwdX = -sinYaw;
    const fwdZ = -cosYaw;
    const rightX = cosYaw;
    const rightZ = -sinYaw;

    // inputs.move.x is horizontal (-1 left, +1 right)
    // inputs.move.y is vertical (-1 forward, +1 backward)
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
        // Face locked boss while strafing
        const dx = lockedTargetPos.x - this.group.position.x;
        const dz = lockedTargetPos.z - this.group.position.z;
        const targetAngle = Math.atan2(-dx, -dz);
        let diff = targetAngle - this.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.group.rotation.y += diff * Math.min(1.0, delta * 12.0);
      } else {
        // Face movement direction
        const targetAngle = Math.atan2(-this.velocity.x, -this.velocity.z);
        let diff = targetAngle - this.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.group.rotation.y += diff * Math.min(1.0, delta * 14.0);
      }

      this.state = 'moving';
      // Walk bob
      this.group.position.y = Math.sin(elapsed * 12.0) * 0.05;
      this.capeMesh.rotation.x = 0.35 + Math.sin(elapsed * 12.0) * 0.12;
    } else {
      this.velocity.set(0, 0, 0);
      this.state = 'idle';
      this.group.position.y = 0;
      this.capeMesh.rotation.x = 0.15 + Math.sin(elapsed * 2.0) * 0.04;

      if (lockedTargetPos) {
        const dx = lockedTargetPos.x - this.group.position.x;
        const dz = lockedTargetPos.z - this.group.position.z;
        const targetAngle = Math.atan2(-dx, -dz);
        let diff = targetAngle - this.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.group.rotation.y += diff * Math.min(1.0, delta * 10.0);
      }
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
      // Roll backward if stationary
      this.dodgeDirection.set(
        Math.sin(this.group.rotation.y),
        0,
        Math.cos(this.group.rotation.y),
      ).normalize();
    }

    // Turn mesh towards roll direction
    this.group.rotation.y = Math.atan2(-this.dodgeDirection.x, -this.dodgeDirection.z);
  }

  private updateDodge(delta: number): void {
    this.dodgeTimer += delta;

    // Check i-frames
    this.isInvulnerable =
      this.dodgeTimer >= this.dodgeConfig.invulnerableStart &&
      this.dodgeTimer <= this.dodgeConfig.invulnerableEnd;

    // Roll movement curve (fast initial impulse, decelerating)
    const progress = this.dodgeTimer / this.dodgeConfig.duration;
    const speedCurve = Math.cos(progress * Math.PI * 0.5);
    const speed = this.dodgeConfig.speed * speedCurve;

    this.group.position.addScaledVector(this.dodgeDirection, speed * delta);

    // Roll visual dip
    this.group.position.y = Math.sin(progress * Math.PI) * 0.25;
    this.bodyMesh.rotation.x = progress * Math.PI * 2;

    if (this.dodgeTimer >= this.dodgeConfig.duration) {
      this.state = 'idle';
      this.isInvulnerable = false;
      this.bodyMesh.rotation.x = 0;
      this.group.position.y = 0;
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
  }

  private updateAttack(delta: number, inputs: CombatInputs): void {
    if (!this.currentAttack) {
      this.state = 'idle';
      return;
    }

    this.attackTimer += delta;

    // Queue combo hit if player attacks during recovery window
    if (this.attackPhase === 'recovery' && inputs.lightAttack && this.comboStep > 0 && this.comboStep < 3) {
      this.comboQueued = true;
    }

    const { startup, active, recovery, forwardImpulse } = this.currentAttack;

    if (this.attackTimer < startup) {
      this.attackPhase = 'startup';
      // Slight forward step
      const step = (delta / startup) * forwardImpulse * 0.2;
      const fwd = new THREE.Vector3(-Math.sin(this.group.rotation.y), 0, -Math.cos(this.group.rotation.y));
      this.group.position.addScaledVector(fwd, step);
    } else if (this.attackTimer < startup + active) {
      this.attackPhase = 'active';
      // Forward lunge during active damage window
      const step = (delta / active) * forwardImpulse * 0.8;
      const fwd = new THREE.Vector3(-Math.sin(this.group.rotation.y), 0, -Math.cos(this.group.rotation.y));
      this.group.position.addScaledVector(fwd, step);
    } else if (this.attackTimer < startup + active + recovery) {
      this.attackPhase = 'recovery';
    } else {
      // Attack finished: proceed to next combo step or return to idle
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
      }
    }
  }

  private updateSwordAnimation(delta: number): void {
    if (this.state === 'attack' && this.currentAttack) {
      const { startup, active, recovery } = this.currentAttack;

      if (this.attackPhase === 'startup') {
        // Wind-up: pull sword back
        const p = this.attackTimer / startup;
        this.swordGroup.rotation.set(-1.2 * p, 0.6 * p, -0.6);
      } else if (this.attackPhase === 'active') {
        // Swift slash arc across front
        const p = (this.attackTimer - startup) / active;
        this.swordGroup.rotation.set(0.6 - 1.8 * p, -0.8 + 1.6 * p, 0.4);
      } else {
        // Recovery: return to base
        const p = (this.attackTimer - startup - active) / recovery;
        this.swordGroup.rotation.x = THREE.MathUtils.lerp(this.swordGroup.rotation.x, this.swordBaseRotation.x, p);
        this.swordGroup.rotation.y = THREE.MathUtils.lerp(this.swordGroup.rotation.y, this.swordBaseRotation.y, p);
        this.swordGroup.rotation.z = THREE.MathUtils.lerp(this.swordGroup.rotation.z, this.swordBaseRotation.z, p);
      }
    } else {
      // Idle / locomotion weapon posture
      this.swordGroup.rotation.x = THREE.MathUtils.lerp(this.swordGroup.rotation.x, this.swordBaseRotation.x, delta * 8.0);
      this.swordGroup.rotation.y = THREE.MathUtils.lerp(this.swordGroup.rotation.y, this.swordBaseRotation.y, delta * 8.0);
      this.swordGroup.rotation.z = THREE.MathUtils.lerp(this.swordGroup.rotation.z, this.swordBaseRotation.z, delta * 8.0);
    }
  }

  public takeDamage(damage: number, isHeavy: boolean): boolean {
    if (this.isInvulnerable || this.state === 'dead') return false;

    this.hp = Math.max(0, this.hp - damage);

    if (this.hp <= 0) {
      this.state = 'dead';
      this.group.rotation.x = Math.PI / 2; // collapse backwards
      this.group.position.y = 0.2;
      return true;
    }

    if (isHeavy || this.state !== 'attack') {
      this.state = 'stagger';
      this.staggerTimer = isHeavy ? 0.45 : 0.25;
      this.currentAttack = null;
    }

    return true;
  }

  private updateStagger(delta: number): void {
    this.staggerTimer -= delta;
    if (this.staggerTimer <= 0) {
      this.state = 'idle';
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
    this.group.rotation.set(0, 0, 0); // Face boss (-Z)
    this.bodyMesh.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
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

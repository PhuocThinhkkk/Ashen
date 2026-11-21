import * as THREE from 'three';
import { BOSS_ATTACKS, type AttackDefinition } from '../../combat/FrameCombat';
import { ModelLoader } from '../../utils/ModelLoader';
import type { BossCharacter } from '../BossCharacter';

/**
 * ============================================================================
 * BOSS SPEED & MOVEMENT CONFIGURATION
 * Edit these values to adjust all boss speeds, movement, turning, and lunges.
 * ============================================================================
 */
export const BOSS_CONFIG = {
  // 1. Forward Walk / Approach Speeds (m/s)
  approachSpeedPhase1: 2.2,
  approachSpeedPhase2: 3.2,

  // 2. Lateral Strafe / Circling Speeds (m/s)
  strafeSpeedPhase1: 1.4,
  strafeSpeedPhase2: 2.0,

  // 3. Rotation & Tracking Speed (degrees per second)
  turnRateDegreesPerSec: 100, // 100 deg/sec clamped angular tracking

  // 4. Attack Animation Speed Multipliers
  attackSpeedPhase1: 1.0,
  attackSpeedPhase2: 1.15, // Phase 2 attacks execute 15% faster

  // 5. Preferred Orbit Distance (meters)
  preferredOrbitRadius: 5.5,

  // 6. Heavy Jump Attack Speeds (m/s)
  jumpRunStartSpeed: 2.2, // Run-up acceleration start (m/s)
  jumpRunEndSpeed: 5.0,   // Run-up acceleration peak (m/s)
  jumpLeapSpeed: 9.32,    // Airborne forward leap speed (m/s)

  // 7. Forward Lunge Impulses per Attack (meters) - locked to 0 for stationary non-jump attacks
  impulses: {
    combo: 0.0,
    jump: 7.0,
    downward: 0.0,
    spin360: 0.0,
    kick: 0.0,
  },

  // 8. Heal Punish Behavior (Set true to automatically interrupt drink with jump attack)
  punishHealWithJump: false,
};

export const FULL_BODY_EXEMPT_CLIPS = new Set(['attack_jump', 'attack_360']);

export type BossSubgoalType = 'STRAFE_INSPECT' | 'APPROACH' | 'ATTACK' | 'COMBO_CHECK';

export interface BossSubgoal {
  type: BossSubgoalType;
  duration?: number;
  timer?: number;
  attack?: AttackDefinition;
  strafeDir?: 1 | -1;
  preferredDistance?: number;
  maxDistance?: number;
}

export interface PlayerCombatSnapshot {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  isHealing: boolean;
  isAttacking: boolean;
  isStaggered: boolean;
}

export class BossAI {
  public readonly boss: BossCharacter;
  public goalStack: BossSubgoal[] = [];
  public attackCooldown = 0;
  public strafeDir: 1 | -1 = 1;
  public isAttackActiveFrames = false;

  private readonly raycaster = new THREE.Raycaster();
  public readonly preferredOrbitRadius = BOSS_CONFIG.preferredOrbitRadius;
  public readonly maxTurnRate = THREE.MathUtils.degToRad(BOSS_CONFIG.turnRateDegreesPerSec);

  constructor(boss: BossCharacter) {
    this.boss = boss;
    this.attackCooldown = 0;
  }

  public reset(): void {
    this.goalStack = [];
    this.attackCooldown = 0;
    this.strafeDir = 1;
    this.isAttackActiveFrames = false;
  }

  public pushSubgoal(subgoal: BossSubgoal): void {
    this.goalStack.push(subgoal);
  }

  public popSubgoal(): BossSubgoal | undefined {
    return this.goalStack.pop();
  }

  public clearGoalStack(): void {
    this.goalStack.length = 0;
  }

  public getCurrentSubgoal(): BossSubgoal | null {
    return this.goalStack.length > 0 ? this.goalStack[this.goalStack.length - 1] : null;
  }

  /**
   * Queues a multi-hit combo in reverse LIFO order:
   * ATTACK (followup) -> COMBO_CHECK -> ATTACK (opener)
   */
  public queueCombo(opener: AttackDefinition, followup: AttackDefinition, maxDistance = 4.2): void {
    this.goalStack.push({
      type: 'ATTACK',
      attack: followup,
    });
    this.goalStack.push({
      type: 'COMBO_CHECK',
      maxDistance,
    });
    this.goalStack.push({
      type: 'ATTACK',
      attack: opener,
    });
    // Immediately trigger opener
    this.startAttack(opener);
  }

  public startAttack(attack: AttackDefinition): void {
    const b = this.boss;
    b.currentAttack = attack;
    b.attackTimer = 0;
    b.state = 'windup';
    b.hasHitCurrentSwing = false;
    b.hasSpawnedSlashArc = false;
    b.hasTriggeredGroundSlam = false;
    b.telegraphGlow = 0;
    this.isAttackActiveFrames = false;

    const speedMod = b.isPhase2 ? BOSS_CONFIG.attackSpeedPhase2 : BOSS_CONFIG.attackSpeedPhase1;
    const totalDuration = (attack.startup + attack.active + attack.recovery) / speedMod;

    const clipName = attack.animationClip || 'attack_heavy';
    const clip = ModelLoader.findClip(b.rawClips, clipName);
    const clipDuration = clip ? clip.duration : 2.5;
    const attackTimeScale = clipDuration / totalDuration;

    // Cross-fade out of locomotion blend layer and fade into attack action
    b.startAttackAction(clipName, attackTimeScale);
  }

  public update(
    dt: number,
    player: PlayerCombatSnapshot,
    arena?: any,
    arenaRadius = 21.0,
  ): void {
    const b = this.boss;

    if (b.state === 'dead') {
      return;
    }

    if (b.state === 'stagger') {
      this.updateStagger(dt);
      return;
    }

    if (b.state === 'phaseTransition') {
      this.updatePhaseTransition(dt, player.position);
      return;
    }

    if (this.checkAndExecuteHealPunish(player)) {
      return;
    }

    // --- Attack State Execution ---
    if (b.state === 'windup' || b.state === 'active' || b.state === 'recovery') {
      this.updateAttackFrames(dt, player.position);
      return;
    }

    // --- Attack Cooldown & Stack Population ---
    this.updateCooldownAndEnsureSubgoal(dt);

    // If stack is completely empty, pick next goal based on player distance
    if (this.goalStack.length === 0) {
      this.evaluateNextGoalByDistance(dt, player.position);
      return;
    }

    // --- Execute Active Subgoal (Top of LIFO stack) ---
    const activeSubgoal = this.goalStack[this.goalStack.length - 1];
    if (!activeSubgoal) return;

    this.executeActiveSubgoal(dt, activeSubgoal, player, arena, arenaRadius);
  }

  private checkAndExecuteHealPunish(player: PlayerCombatSnapshot): boolean {
    const b = this.boss;
    const isStrafeOrApproach =
      b.state === 'idle' ||
      b.state === 'approach' ||
      (this.getCurrentSubgoal()?.type === 'STRAFE_INSPECT' || this.getCurrentSubgoal()?.type === 'APPROACH');

    if (BOSS_CONFIG.punishHealWithJump && isStrafeOrApproach && player.isHealing) {
      this.clearGoalStack();
      this.attackCooldown = 0;
      const punishAttack = BOSS_ATTACKS.jump; // fast gap-closing punish lunge (7m forward impulse, 6m range)
      this.pushSubgoal({
        type: 'ATTACK',
        attack: punishAttack,
      });
      this.startAttack(punishAttack);
      return true;
    }
    return false;
  }

  private updateCooldownAndEnsureSubgoal(dt: number): void {
    if (this.attackCooldown > 0) {
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
      if (this.goalStack.length === 0) {
        // Whenever attackCooldown > 0, push a STRAFE_INSPECT subgoal (1.5s–3.0s)
        const strafeDuration = Math.min(3.0, Math.max(1.5, this.attackCooldown));
        this.pushSubgoal({
          type: 'STRAFE_INSPECT',
          duration: strafeDuration,
          timer: 0,
          strafeDir: Math.random() < 0.5 ? 1 : -1,
        });
      }
    }
  }

  private evaluateNextGoalByDistance(dt: number, playerPos: THREE.Vector3): void {
    const b = this.boss;
    const dist = b.distanceTo(playerPos);
    if (dist <= 3.6) {
      // Close range: combo
      b.stateTimer = 0;
      const opener = Math.random() < 0.4 ? BOSS_ATTACKS.kick : BOSS_ATTACKS.combo;
      const followup = b.isPhase2 && Math.random() < 0.5 ? BOSS_ATTACKS.spin360 : BOSS_ATTACKS.downward;
      this.queueCombo(opener, followup);
    } else if (dist <= 6.0) {
      // Mid range: approach or combo
      b.stateTimer = 0;
      if (b.isPhase2 && Math.random() < 0.35) {
        this.startAttack(BOSS_ATTACKS.spin360);
      } else if (Math.random() < 0.5) {
        this.pushSubgoal({
          type: 'APPROACH',
          duration: 2.2,
          timer: 0,
          preferredDistance: 3.2,
        });
      } else {
        this.queueCombo(BOSS_ATTACKS.combo, BOSS_ATTACKS.downward);
      }
    } else {
      // Long range (> 6m): brief initial observation before approaching
      b.stateTimer += dt;
      b.state = 'idle';
      b.faceTarget(playerPos, this.maxTurnRate, dt);
      b.updateLocomotionWeights(dt, 0, 0);
      const idleLimit = b.isPhase2 ? 0.35 : 0.65;
      if (b.stateTimer >= idleLimit) {
        b.stateTimer = 0;
        if (Math.random() < 0.35) {
          this.startAttack(BOSS_ATTACKS.jump);
        } else {
          this.pushSubgoal({
            type: 'APPROACH',
            duration: 2.5,
            timer: 0,
            preferredDistance: 3.5,
          });
        }
      }
    }
  }

  private executeActiveSubgoal(
    dt: number,
    activeSubgoal: BossSubgoal,
    player: PlayerCombatSnapshot,
    arena?: any,
    arenaRadius = 21.0,
  ): void {
    const b = this.boss;

    switch (activeSubgoal.type) {
      case 'COMBO_CHECK': {
        const dist = b.distanceTo(player.position);
        const maxDist = activeSubgoal.maxDistance ?? 4.2;
        if (dist > maxDist) {
          // Player dodged out of range! Clear remaining queued attacks and return directly to STRAFE_INSPECT
          this.clearGoalStack();
          this.attackCooldown = 1.5 + Math.random() * 1.3;
          this.pushSubgoal({
            type: 'STRAFE_INSPECT',
            duration: Math.min(3.0, Math.max(1.5, this.attackCooldown)),
            timer: 0,
            strafeDir: Math.random() < 0.5 ? 1 : -1,
          });
        } else {
          // Player is still in range: pop COMBO_CHECK and immediately start followup attack
          this.goalStack.pop();
          const next = this.goalStack[this.goalStack.length - 1];
          if (next && next.type === 'ATTACK' && next.attack) {
            this.startAttack(next.attack);
          }
        }
        break;
      }

      case 'ATTACK': {
        if (activeSubgoal.attack && b.state !== 'windup' && b.state !== 'active' && b.state !== 'recovery') {
          this.startAttack(activeSubgoal.attack);
        }
        break;
      }

      case 'STRAFE_INSPECT': {
        activeSubgoal.timer = (activeSubgoal.timer ?? 0) + dt;
        b.state = 'idle';

        const dist = b.distanceTo(player.position);

        // If player pushes in close during strafe (< 3.2m), respond with counter combo
        if (dist <= 3.2 && activeSubgoal.timer >= 0.5) {
          this.goalStack.pop();
          const opener = Math.random() < 0.4 ? BOSS_ATTACKS.kick : BOSS_ATTACKS.combo;
          const followup = b.isPhase2 ? BOSS_ATTACKS.spin360 : BOSS_ATTACKS.downward;
          this.queueCombo(opener, followup);
          return;
        }

        // 1. Capped turn rate: lock yaw onto player
        b.faceTarget(player.position, this.maxTurnRate, dt);

        // 2. Lateral right vector & orbit radius ~5.5m
        const preferred = this.preferredOrbitRadius;
        let radialFactor = 0;
        if (dist > preferred + 0.35) {
          radialFactor = Math.min(1.0, (dist - preferred) * 0.7); // forward toward player
        } else if (dist < preferred - 0.35) {
          radialFactor = -Math.min(1.0, (preferred - dist) * 0.7); // backward away from player
        }

        const currentStrafeDir: 1 | -1 = activeSubgoal.strafeDir ?? this.strafeDir;
        const yaw = b.group.rotation.y;
        const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
        let strafeVec = right.clone().multiplyScalar(currentStrafeDir);

        // 3. Short raycaster (~2m) in active strafe direction every frame
        const rayOrigin = b.group.position.clone();
        rayOrigin.y = 1.0;
        this.raycaster.set(rayOrigin, strafeVec.clone().normalize());
        this.raycaster.far = 2.0;

        let hitWall = false;
        const obstacles = arena?.getCollisionObstacles ? arena.getCollisionObstacles() : [];
        if (obstacles.length > 0) {
          const hits = this.raycaster.intersectObjects(obstacles, false);
          if (hits.length > 0 && hits[0].distance <= 2.0) {
            hitWall = true;
          }
        }

        // Boundary check against arena radius
        const futurePos = b.group.position.clone().addScaledVector(strafeVec, 2.0);
        if (futurePos.length() >= arenaRadius - b.radius - 0.5) {
          hitWall = true;
        }

        if (hitWall) {
          const inverted: 1 | -1 = currentStrafeDir === 1 ? -1 : 1;
          this.strafeDir = inverted;
          activeSubgoal.strafeDir = inverted;
          strafeVec = right.clone().multiplyScalar(inverted);
        }

        const strafeSpeed = b.isPhase2 ? BOSS_CONFIG.strafeSpeedPhase2 : BOSS_CONFIG.strafeSpeedPhase1;
        const moveStep = strafeVec.multiplyScalar(strafeSpeed);
        if (radialFactor !== 0) {
          moveStep.addScaledVector(fwd, radialFactor * (strafeSpeed * 0.65));
        }
        b.group.position.addScaledVector(moveStep, dt);

        // Smooth locomotion weight blending update
        b.updateLocomotionWeights(dt, activeSubgoal.strafeDir ?? this.strafeDir, radialFactor);

        const maxDuration = activeSubgoal.duration ?? 2.5;
        if (activeSubgoal.timer >= maxDuration || (this.attackCooldown <= 0 && activeSubgoal.timer >= 1.5)) {
          this.goalStack.pop();
        }
        break;
      }

      case 'APPROACH': {
        activeSubgoal.timer = (activeSubgoal.timer ?? 0) + dt;
        b.state = 'approach';

        // Face player with capped turn rate
        b.faceTarget(player.position, this.maxTurnRate, dt);

        const dist = b.distanceTo(player.position);
        const speed = b.isPhase2 ? BOSS_CONFIG.approachSpeedPhase2 : BOSS_CONFIG.approachSpeedPhase1;
        const yaw = b.group.rotation.y;
        const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();

        b.group.position.addScaledVector(fwd, speed * dt);

        // Locomotion blend: forward walk
        b.updateLocomotionWeights(dt, 0, 1.0);

        const prefDist = activeSubgoal.preferredDistance ?? 3.4;
        const maxTime = activeSubgoal.duration ?? 2.2;
        if (dist <= prefDist || activeSubgoal.timer >= maxTime) {
          this.goalStack.pop();
          if (this.goalStack.length === 0) {
            if (dist > 4.2 || Math.random() < 0.25) {
              this.startAttack(BOSS_ATTACKS.jump);
            } else {
              const roll = Math.random();
              if (b.isPhase2 && roll < 0.35) {
                this.startAttack(BOSS_ATTACKS.spin360);
              } else if (roll < 0.65) {
                this.queueCombo(BOSS_ATTACKS.combo, BOSS_ATTACKS.downward);
              } else {
                this.startAttack(BOSS_ATTACKS.downward);
              }
            }
          }
        }
        break;
      }
    }
  }

  public updateAttackFrames(dt: number, playerPos: THREE.Vector3): void {
    const b = this.boss;
    if (!b.currentAttack) {
      b.state = 'idle';
      this.isAttackActiveFrames = false;
      b.endAttackAction();
      return;
    }

    b.attackTimer += dt;
    const speedMod = b.isPhase2 ? BOSS_CONFIG.attackSpeedPhase2 : BOSS_CONFIG.attackSpeedPhase1;
    const startup = b.currentAttack.startup / speedMod;
    const active = b.currentAttack.active / speedMod;
    const recovery = b.currentAttack.recovery / speedMod;

    if (b.attackTimer < startup) {
      b.state = 'windup';
      this.isAttackActiveFrames = false;
      const progress = b.attackTimer / startup;

      // Capped turn rate wind-up tracking
      b.faceTarget(playerPos, this.maxTurnRate, dt);
      b.telegraphGlow = progress;
    } else if (b.attackTimer < startup + active) {
      // Hitbox / active swing frame
      if (b.state !== 'active') {
        b.state = 'active';
        if (!b.hasSpawnedSlashArc) {
          b.hasSpawnedSlashArc = true;
          b.vfxSystem?.spawnAttackSlashArc(
            b.group.position,
            b.group.rotation.y,
            b.currentAttack.name,
            b.currentAttack.isHeavy,
            true,
          );
        }
        if (b.currentAttack.animationClip === 'attack_jump') {
          b.triggerJumpGroundSlam?.();
        }
      }
      b.telegraphGlow = 1.0;

      if (b.currentAttack.animationClip && FULL_BODY_EXEMPT_CLIPS.has(b.currentAttack.animationClip)) {
        // Jump / 360 Attack exception: freeze mid-air/spin rotation during active leap/swing
        this.isAttackActiveFrames = true;
      } else {
        // Non-jump attacks: lock positional movement (0 translation), allow in-place turning towards player
        this.isAttackActiveFrames = false;
        b.faceTarget(playerPos, this.maxTurnRate, dt);
      }
    } else if (b.attackTimer < startup + active + recovery) {
      b.state = 'recovery';
      b.telegraphGlow = Math.max(0, 1.0 - (b.attackTimer - startup - active) / (recovery * 0.5));
      if (b.currentAttack.animationClip && FULL_BODY_EXEMPT_CLIPS.has(b.currentAttack.animationClip)) {
        this.isAttackActiveFrames = false;
        b.setTurnDirection?.(null);
      } else {
        // Non-jump attacks: allow in-place turning towards target during recovery
        this.isAttackActiveFrames = false;
        b.faceTarget(playerPos, this.maxTurnRate, dt);
      }
    } else {
      // Attack complete!
      b.state = 'idle';
      b.stateTimer = 0;
      b.currentAttack = null;
      b.telegraphGlow = 0;
      this.isAttackActiveFrames = false;
      b.setTurnDirection?.(null);

      // Cross-fade back into locomotion blend layer
      b.endAttackAction();

      // Pop the completed ATTACK subgoal from the stack
      const top = this.getCurrentSubgoal();
      if (top && top.type === 'ATTACK') {
        this.popSubgoal();
      }

      // Check if stack is now empty (combo finished)
      if (this.goalStack.length === 0) {
        this.attackCooldown = 1.5 + Math.random() * 1.3; // 1.5s–2.8s cooldown
        this.pushSubgoal({
          type: 'STRAFE_INSPECT',
          duration: Math.min(3.0, Math.max(1.5, this.attackCooldown)),
          timer: 0,
          strafeDir: Math.random() < 0.5 ? 1 : -1,
        });
      }
    }
  }

  public updateStagger(dt: number): void {
    const b = this.boss;
    b.stateTimer += dt;
    this.isAttackActiveFrames = false;
    if (b.stateTimer >= 2.2) {
      b.state = 'idle';
      b.stateTimer = 0;
      b.playAction('idle', 0.2);
    }
  }

  public updatePhaseTransition(dt: number, playerPos?: THREE.Vector3): void {
    const b = this.boss;
    b.stateTimer += dt;
    this.isAttackActiveFrames = false;
    if (playerPos) {
      b.faceTarget(playerPos, this.maxTurnRate, dt);
    }
    b.telegraphGlow = Math.sin(b.stateTimer * 8.0) * 0.5 + 0.5;
    if (b.stateTimer >= 2.0) {
      b.state = 'idle';
      b.stateTimer = 0;
      b.telegraphGlow = 0;
      this.clearGoalStack();
      this.attackCooldown = 1.5;
      this.pushSubgoal({
        type: 'STRAFE_INSPECT',
        duration: 2.0,
        timer: 0,
        strafeDir: 1,
      });
      b.playAction('idle', 0.2);
    }
  }

  // --- Static legacy wrappers for backward compatibility ---
  public static updateIdle(boss: BossCharacter, delta: number, playerPos: THREE.Vector3): void {
    boss.ai.update(delta, {
      position: playerPos,
      velocity: new THREE.Vector3(),
      isHealing: false,
      isAttacking: false,
      isStaggered: false,
    });
  }

  public static updateApproach(boss: BossCharacter, delta: number, playerPos: THREE.Vector3): void {
    boss.ai.update(delta, {
      position: playerPos,
      velocity: new THREE.Vector3(),
      isHealing: false,
      isAttacking: false,
      isStaggered: false,
    });
  }

  public static chooseAttack(boss: BossCharacter, attack: AttackDefinition): void {
    boss.ai.clearGoalStack();
    boss.ai.pushSubgoal({ type: 'ATTACK', attack });
    boss.ai.startAttack(attack);
  }

  public static updateAttackFrames(boss: BossCharacter, delta: number, playerPos: THREE.Vector3): void {
    boss.ai.updateAttackFrames(delta, playerPos);
  }

  public static updateStagger(boss: BossCharacter, delta: number): void {
    boss.ai.updateStagger(delta);
  }

  public static updatePhaseTransition(boss: BossCharacter, delta: number, playerPos?: THREE.Vector3): void {
    boss.ai.updatePhaseTransition(delta, playerPos);
  }
}

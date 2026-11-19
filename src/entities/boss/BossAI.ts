import * as THREE from 'three';
import { BOSS_ATTACKS, type AttackDefinition } from '../../combat/FrameCombat';
import { ModelLoader } from '../../utils/ModelLoader';
import type { BossCharacter } from '../BossCharacter';

export class BossAI {
  public static updateIdle(boss: BossCharacter, delta: number, playerPos: THREE.Vector3): void {
    const b = boss as any;
    b.stateTimer += delta;
    b.faceTarget(playerPos, delta * 4.0);

    b.playAction('idle', 0.2, THREE.LoopRepeat, false, 1.0);

    const dist = b.distanceTo(playerPos);
    const idleLimit = b.isPhase2 ? 0.35 : 0.75;

    if (b.stateTimer >= idleLimit) {
      if (dist <= 3.2) {
        // Close range: quick kick, combo or downward slam
        const roll = Math.random();
        if (roll < 0.35) {
          boss.chooseAttack(BOSS_ATTACKS.kick);
        } else if (roll < 0.7) {
          boss.chooseAttack(BOSS_ATTACKS.downward);
        } else {
          boss.chooseAttack(BOSS_ATTACKS.combo);
        }
      } else if (dist <= 5.5) {
        // Mid range: 360 spin, downward slam, or combo
        const roll = Math.random();
        if (b.isPhase2 && roll < 0.45) {
          boss.chooseAttack(BOSS_ATTACKS.spin360);
        } else if (roll < 0.35) {
          boss.chooseAttack(BOSS_ATTACKS.combo);
        } else if (roll < 0.7) {
          boss.chooseAttack(BOSS_ATTACKS.downward);
        } else {
          b.state = 'approach';
          b.stateTimer = 0;
        }
      } else {
        // Long range (>5.5m): approach target, occasional leap
        if (Math.random() < 0.3) {
          boss.chooseAttack(BOSS_ATTACKS.jump);
        } else {
          b.state = 'approach';
          b.stateTimer = 0;
        }
      }
    }
  }

  public static updateApproach(boss: BossCharacter, delta: number, playerPos: THREE.Vector3): void {
    const b = boss as any;
    b.stateTimer += delta;
    b.faceTarget(playerPos, delta * 6.0);

    b.playAction('walking', 0.2, THREE.LoopRepeat, false, b.isPhase2 ? 1.3 : 1.0);

    const dist = b.distanceTo(playerPos);
    const speed = b.isPhase2 ? 4.2 : 3.2;

    const fwd = new THREE.Vector3(
      -Math.sin(b.group.rotation.y),
      0,
      -Math.cos(b.group.rotation.y),
    ).normalize();

    b.group.position.addScaledVector(fwd, speed * delta);

    if (dist <= 3.8 || b.stateTimer >= 2.2) {
      const roll = Math.random();
      if (b.isPhase2 && roll < 0.4) {
        boss.chooseAttack(BOSS_ATTACKS.spin360);
      } else if (roll < 0.5) {
        boss.chooseAttack(BOSS_ATTACKS.combo);
      } else {
        boss.chooseAttack(BOSS_ATTACKS.downward);
      }
    }
  }

  public static chooseAttack(boss: BossCharacter, attack: AttackDefinition): void {
    const b = boss as any;
    b.currentAttack = attack;
    b.attackTimer = 0;
    b.state = 'windup';
    b.hasHitCurrentSwing = false;
    b.hasSpawnedSlashArc = false;
    b.hasTriggeredGroundSlam = false;
    b.telegraphGlow = 0;

    const speedMod = b.isPhase2 ? 1.15 : 1.0;
    const totalDuration = (attack.startup + attack.active + attack.recovery) / speedMod;

    // Use specific clip defined in AttackDefinition (downward, combo, jump, 360, kick)
    const clipName = attack.animationClip || 'attack_heavy';
    const clip = ModelLoader.findClip(b.rawClips, clipName);
    const clipDuration = clip ? clip.duration : 2.5;
    const attackTimeScale = clipDuration / totalDuration;

    b.playAction(clipName, 0.12, THREE.LoopOnce, true, attackTimeScale);
  }

  public static updateAttackFrames(boss: BossCharacter, delta: number, playerPos: THREE.Vector3): void {
    const b = boss as any;
    if (!b.currentAttack) {
      b.state = 'idle';
      return;
    }

    b.attackTimer += delta;
    const speedMod = b.isPhase2 ? 1.15 : 1.0;
    const startup = b.currentAttack.startup / speedMod;
    const active = b.currentAttack.active / speedMod;
    const recovery = b.currentAttack.recovery / speedMod;

    if (b.attackTimer < startup) {
      b.state = 'windup';
      const progress = b.attackTimer / startup;
      if (progress < 0.75) {
        b.faceTarget(playerPos, delta * 4.0);
      }
      b.telegraphGlow = progress;
    } else if (b.attackTimer < startup + active) {
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
          b.triggerJumpGroundSlam();
        }
      }
      b.telegraphGlow = 1.0;

      const fwd = new THREE.Vector3(
        -Math.sin(b.group.rotation.y),
        0,
        -Math.cos(b.group.rotation.y),
      ).normalize();

      if (b.currentAttack.animationClip !== 'attack_jump') {
        const impulse = (b.currentAttack.forwardImpulse / active) * delta;
        b.group.position.addScaledVector(fwd, impulse);
      }
    } else if (b.attackTimer < startup + active + recovery) {
      b.state = 'recovery';
      b.telegraphGlow = Math.max(0, 1.0 - (b.attackTimer - startup - active) / (recovery * 0.5));
    } else {
      b.state = 'idle';
      b.stateTimer = 0;
      b.currentAttack = null;
      b.telegraphGlow = 0;
      b.playAction('idle', 0.2);
    }
  }

  public static updateStagger(boss: BossCharacter, delta: number): void {
    const b = boss as any;
    b.stateTimer += delta;
    if (b.stateTimer >= 2.2) {
      b.state = 'idle';
      b.stateTimer = 0;
      b.playAction('idle', 0.2);
    }
  }

  public static updatePhaseTransition(boss: BossCharacter, delta: number, playerPos?: THREE.Vector3): void {
    const b = boss as any;
    b.stateTimer += delta;
    if (playerPos) {
      b.faceTarget(playerPos, delta * 3.0);
    }
    b.telegraphGlow = Math.sin(b.stateTimer * 8.0) * 0.5 + 0.5;
    if (b.stateTimer >= 2.0) {
      b.state = 'idle';
      b.stateTimer = 0;
      b.telegraphGlow = 0;
      b.playAction('idle', 0.2);
    }
  }
}

import * as THREE from 'three';
import { PLAYER_ATTACKS, type AttackDefinition } from '../../combat/FrameCombat';
import type { CombatInputs } from '../../core/types';
import type { PlayerCharacter } from '../PlayerCharacter';

export class PlayerCombat {
  public static startAttack(player: PlayerCharacter, attack: AttackDefinition, comboStep: number): void {
    player.state = 'attack';
    player.currentAttack = attack;
    player.attackTimer = 0;
    player.attackPhase = 'startup';
    player.comboStep = comboStep;
    player.comboQueued = false;
    player.hasHitCurrentSwing = false;
    player.hasSpawnedSlashArc = false;

    player.stamina = Math.max(0, player.stamina - attack.staminaCost);
    player.staminaRegenDelay = 1.1;

    const clipName = attack.isHeavy ? 'attack_heavy' : 'attack_light';
    const timeScale = attack.isHeavy ? 0.95 : 1.15;
    player.playFullBodyAction(clipName, 0.08, THREE.LoopOnce, true, timeScale);
  }

  public static startMidAirAttack(player: PlayerCharacter, attack: AttackDefinition): void {
    if (player.isGrounded || player.isDrinking) return;

    player.isAirborneAttack = true;
    player.currentAttack = attack;
    player.attackTimer = 0;
    player.attackPhase = 'startup';
    player.comboStep = 0;
    player.comboQueued = false;
    player.hasHitCurrentSwing = false;
    player.hasSpawnedSlashArc = false;

    player.stamina = Math.max(0, player.stamina - attack.staminaCost);
    player.staminaRegenDelay = 1.1;

    const clipName = attack.isHeavy ? 'attack_heavy' : 'attack_light';
    player.playUpperBodyAction(clipName, 0.08, THREE.LoopOnce, true, attack.isHeavy ? 1.0 : 1.2);
  }

  /**
   * [Purpose]: Advances attack frame timers through startup, active hitbox, and recovery phases while managing combo inputs and cancel windows.
   * @condition Executed every frame during player attack state ('attack' or airborne attack).
   * @param player,delta,inputs,lockedTargetPos PlayerCharacter context, frame delta in seconds, current player inputs, and optional lock target.
   * @returns Updates attackPhase, triggers weapon swing audio/VFX, checks combo chaining, and clears upper body overrides upon recovery.
   */
  public static updateAttack(
    player: PlayerCharacter,
    delta: number,
    inputs: CombatInputs,
    lockedTargetPos: THREE.Vector3 | null = null,
  ): void {
    if (!player.currentAttack) {
      player.state = 'idle';
      return;
    }

    player.attackTimer += delta;

    if (player.attackPhase === 'recovery') {
      if (inputs.dodge && player.stamina > 0) {
        player.currentAttack = null;
        player.attackPhase = 'none';
        player.comboStep = 0;
        player.comboQueued = false;
        player.startDodge(inputs);
        return;
      }
      if (inputs.lightAttack && player.comboStep > 0 && player.comboStep < 3) {
        player.comboQueued = true;
      }
    }

    const { startup, active, recovery, forwardImpulse } = player.currentAttack;

    if (player.attackTimer < startup) {
      player.attackPhase = 'startup';
      if (lockedTargetPos) {
        const dx = lockedTargetPos.x - player.group.position.x;
        const dz = lockedTargetPos.z - player.group.position.z;
        const targetAngle = Math.atan2(-dx, -dz);
        let diff = targetAngle - player.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.group.rotation.y += diff * Math.min(1.0, delta * 8.0);
      }
      const step = (delta / startup) * forwardImpulse * 0.2;
      const fwd = new THREE.Vector3(-Math.sin(player.group.rotation.y), 0, -Math.cos(player.group.rotation.y));
      player.group.position.addScaledVector(fwd, step);
    } else if (player.attackTimer < startup + active) {
      if (player.attackPhase !== 'active') {
        player.attackPhase = 'active';
        if (!player.hasSpawnedSlashArc) {
          player.hasSpawnedSlashArc = true;
          player.vfxSystem?.spawnAttackSlashArc(
            player.group.position,
            player.group.rotation.y,
            player.currentAttack.name,
            player.currentAttack.isHeavy,
            false,
          );
        }
      }
      const step = (delta / active) * forwardImpulse * 0.8;
      const fwd = new THREE.Vector3(-Math.sin(player.group.rotation.y), 0, -Math.cos(player.group.rotation.y));
      player.group.position.addScaledVector(fwd, step);
    } else if (player.attackTimer < startup + active + recovery) {
      player.attackPhase = 'recovery';
    } else {
      if (player.comboQueued && player.comboStep === 1 && player.stamina >= PLAYER_ATTACKS.light2.staminaCost) {
        PlayerCombat.startAttack(player, PLAYER_ATTACKS.light2, 2);
      } else if (player.comboQueued && player.comboStep === 2 && player.stamina >= PLAYER_ATTACKS.light3.staminaCost) {
        PlayerCombat.startAttack(player, PLAYER_ATTACKS.light3, 3);
      } else {
        player.state = 'idle';
        player.currentAttack = null;
        player.attackPhase = 'none';
        player.comboStep = 0;
        player.comboQueued = false;
        player.playFullBodyAction('idle', 0.15);
      }
    }
  }

  /**
   * [Purpose]: Applies incoming damage to player health pool, checks death condition, and triggers stagger flinch animations and interrupts.
   * @condition Invoked when an enemy attack blade or projectile intersects the player's hurtbox outside of invulnerability frames.
   * @param player,damage,isHeavy Player character instance, numeric damage amount, and heavy impact flag that forces stagger.
   * @returns Returns true if damage was successfully applied; false if player was invulnerable or dead.
   */
  public static takeDamage(player: PlayerCharacter, damage: number, isHeavy: boolean): boolean {
    if (player.isInvulnerable || player.state === 'dead') return false;

    player.hp = Math.max(0, player.hp - damage);

    if (player.hp <= 0) {
      player.state = 'dead';
      player.interruptDrink();
      player.isAirborneAttack = false;
      player.setDodgeIFrameVisual(false);
      if (player.upperBodyAction) player.upperBodyAction.paused = false;
      if (player.lowerBodyAction) player.lowerBodyAction.paused = false;
      player.velocity.set(0, 0, 0);
      player.playFullBodyAction('death', 0.1, THREE.LoopOnce, true, 1.0);
      return true;
    }

    if (isHeavy || player.state !== 'attack') {
      player.state = 'stagger';
      player.interruptDrink();
      player.isAirborneAttack = false;
      player.setDodgeIFrameVisual(false);
      if (player.upperBodyAction) player.upperBodyAction.paused = false;
      if (player.lowerBodyAction) player.lowerBodyAction.paused = false;
      player.staggerTimer = isHeavy ? 0.45 : 0.25;
      player.currentAttack = null;
      // High-impact stagger reaction animation
      player.playFullBodyAction('hit', 0.05, THREE.LoopOnce, true, isHeavy ? 1.0 : 1.3);
    }

    return true;
  }

  public static updateStagger(player: PlayerCharacter, delta: number): void {
    player.staggerTimer -= delta;
    if (player.staggerTimer <= 0) {
      player.state = 'idle';
      player.playFullBodyAction('idle', 0.15);
    }
  }
}

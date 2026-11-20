import * as THREE from 'three';
import { PLAYER_ATTACKS } from '../../combat/FrameCombat';
import type { CombatInputs } from '../../core/types';
import type { PlayerCharacter } from '../PlayerCharacter';

export class PlayerLocomotion {
  public static startDrink(player: PlayerCharacter): void {
    if (
      !player.isGrounded ||
      player.state === 'dodge' ||
      player.state === 'stagger' ||
      player.state === 'dead' ||
      player.isDrinking ||
      player.healCharges <= 0
    ) {
      return;
    }

    player.isDrinking = true;
    player.hasHealedDuringDrink = false;
    player.drinkTimer = 0;

    if (player.flaskMesh) {
      player.flaskMesh.visible = true;
    }

    // Crossfade upper body into drinking clip (LoopOnce, clampWhenFinished = true)
    player.playUpperBodyAction('drinking', 0.18, THREE.LoopOnce, true, 2.5);
  }

  public static startJump(player: PlayerCharacter): void {
    if (
      !player.isGrounded ||
      player.state === 'dodge' ||
      player.state === 'stagger' ||
      player.state === 'dead' ||
      player.isDrinking
    ) {
      return;
    }

    player.state = 'jumping';
    player.isGrounded = false;
    player.verticalVelocity = player.jumpImpulse;
    player.stamina = Math.max(0, player.stamina - 15);
    player.staminaRegenDelay = 0.8;

    player.playFullBodyAction('jumping', 0.10, THREE.LoopOnce, true, 1.2);
  }

  public static updateAirbornePhysics(player: PlayerCharacter, delta: number, inputs: CombatInputs): void {
    if (!player.isGrounded || player.group.position.y > 0) {
      player.verticalVelocity += player.gravity * delta;
      player.group.position.y += player.verticalVelocity * delta;

      if (player.group.position.y <= 0) {
        // Landing contact!
        player.group.position.y = 0;
        player.verticalVelocity = 0;
        player.isGrounded = true;

        player.audioSystem?.playLandingThud(false);
        player.vfxSystem?.spawnFootDustKickup(player.group.position, 8);

        // Clean up mid-air attack
        if (player.isAirborneAttack) {
          player.isAirborneAttack = false;
          player.currentAttack = null;
          player.attackPhase = 'none';
          player.clearUpperBodyOverride(0.12);
        }

        if (player.state === 'jumping') {
          const isMoving = inputs.move.lengthSq() > 0.05;
          player.state = isMoving ? 'moving' : 'idle';
          player.playFullBodyAction(isMoving ? 'walk' : 'idle', 0.15);
        }
      }
    }
  }

  public static updateDrinkingState(player: PlayerCharacter, delta: number): void {
    if (player.isDrinking) {
      player.drinkTimer += delta;
      const drinkAction = player.upperActions.get('drinking');
      const actionProgress = drinkAction && drinkAction.getClip().duration > 0
        ? drinkAction.time / drinkAction.getClip().duration
        : 0;
      const timerProgress = player.drinkTimer / player.drinkDuration;
      const progress = Math.max(actionProgress, timerProgress);

      // Heal tick at ~55% progress: consume bottle charge and restore HP
      if (!player.hasHealedDuringDrink && progress >= 0.55) {
        player.hasHealedDuringDrink = true;
        player.healCharges = Math.max(0, player.healCharges - 1);
        player.heal(40);
      }

      // Finish drinking
      if (progress >= 0.98 || player.drinkTimer >= player.drinkDuration) {
        player.isDrinking = false;
        if (player.flaskMesh) player.flaskMesh.visible = false;
        player.clearUpperBodyOverride(0.18);
      }
    }
  }

  public static updateJumping(
    player: PlayerCharacter,
    delta: number,
    _elapsed: number,
    inputs: CombatInputs,
    cameraYaw: number,
    lockedTargetPos: THREE.Vector3 | null,
  ): void {
    // Check Mid-Air Attack input
    if (
      !player.isAirborneAttack &&
      (inputs.lightAttack || inputs.heavyAttack) &&
      player.stamina >= PLAYER_ATTACKS.light1.staminaCost
    ) {
      player.startMidAirAttack(inputs.heavyAttack ? PLAYER_ATTACKS.heavy : PLAYER_ATTACKS.light1);
    }

    // Horizontal air control
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
      const speed = 4.2;
      player.velocity.x = (moveDirX / moveMag) * speed;
      player.velocity.z = (moveDirZ / moveMag) * speed;
      player.group.position.x += player.velocity.x * delta;
      player.group.position.z += player.velocity.z * delta;

      if (lockedTargetPos) {
        const dx = lockedTargetPos.x - player.group.position.x;
        const dz = lockedTargetPos.z - player.group.position.z;
        const targetAngle = Math.atan2(-dx, -dz);
        let diff = targetAngle - player.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.group.rotation.y += diff * Math.min(1.0, delta * 12.0);
      } else {
        const targetAngle = Math.atan2(-player.velocity.x, -player.velocity.z);
        let diff = targetAngle - player.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.group.rotation.y += diff * Math.min(1.0, delta * 12.0);
      }
    } else {
      player.velocity.x *= 0.92;
      player.velocity.z *= 0.92;
      player.group.position.x += player.velocity.x * delta;
      player.group.position.z += player.velocity.z * delta;

      if (lockedTargetPos) {
        const dx = lockedTargetPos.x - player.group.position.x;
        const dz = lockedTargetPos.z - player.group.position.z;
        const targetAngle = Math.atan2(-dx, -dz);
        let diff = targetAngle - player.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.group.rotation.y += diff * Math.min(1.0, delta * 10.0);
      }
    }

    // Mid-air attack phase progression
    if (player.isAirborneAttack && player.currentAttack) {
      player.attackTimer += delta;
      const { startup, active, recovery } = player.currentAttack;

      if (player.attackTimer < startup) {
        player.attackPhase = 'startup';
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
      } else if (player.attackTimer < startup + active + recovery) {
        player.attackPhase = 'recovery';
      } else {
        // Attack completed mid-air before landing
        player.isAirborneAttack = false;
        player.currentAttack = null;
        player.attackPhase = 'none';
        player.clearUpperBodyOverride(0.15);
      }
    }
  }

  public static updateLocomotion(
    player: PlayerCharacter,
    delta: number,
    _elapsed: number,
    inputs: CombatInputs,
    cameraYaw: number,
    lockedTargetPos: THREE.Vector3 | null,
  ): void {
    // Check Dodge input first (high priority) - allows dodge-canceling drinking
    if (inputs.dodge && player.stamina > 0) {
      player.startDodge(inputs, cameraYaw);
      return;
    }

    // Check Jump input - disabled while drinking
    if (!player.isDrinking && inputs.jump && player.isGrounded && player.stamina >= 15) {
      player.startJump();
      return;
    }

    // Check Drink / Heal input
    if (inputs.heal && player.isGrounded && !player.isDrinking && player.healCharges > 0) {
      player.startDrink();
    }

    // Check Attack input - disabled while drinking
    if (!player.isDrinking) {
      if (inputs.lightAttack && player.stamina >= PLAYER_ATTACKS.light1.staminaCost) {
        if (lockedTargetPos) {
          const dx = lockedTargetPos.x - player.group.position.x;
          const dz = lockedTargetPos.z - player.group.position.z;
          player.group.rotation.y = Math.atan2(-dx, -dz);
        }
        player.startAttack(PLAYER_ATTACKS.light1, 1);
        return;
      }
      if (inputs.heavyAttack && player.stamina >= PLAYER_ATTACKS.heavy.staminaCost) {
        if (lockedTargetPos) {
          const dx = lockedTargetPos.x - player.group.position.x;
          const dz = lockedTargetPos.z - player.group.position.z;
          player.group.rotation.y = Math.atan2(-dx, -dz);
        }
        player.startAttack(PLAYER_ATTACKS.heavy, 0);
        return;
      }
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
      const isSprinting = !player.isDrinking && inputs.sprint && player.stamina > 5;
      let walkSpeed = moveMag < 0.65 ? 2.2 + 2.2 * (moveMag / 0.65) : 4.4;

      // Apply 0.55x walk speed penalty while drinking
      if (player.isDrinking) {
        walkSpeed *= 0.55;
      }

      const speed = isSprinting ? 7.2 : walkSpeed;

      if (isSprinting) {
        player.stamina = Math.max(0, player.stamina - 14 * delta);
        player.staminaRegenDelay = 0.8;
      }

      player.velocity.x = (moveDirX / moveMag) * speed;
      player.velocity.z = (moveDirZ / moveMag) * speed;
      player.group.position.x += player.velocity.x * delta;
      player.group.position.z += player.velocity.z * delta;

      // Facing Direction
      if (lockedTargetPos) {
        const dx = lockedTargetPos.x - player.group.position.x;
        const dz = lockedTargetPos.z - player.group.position.z;
        const targetAngle = Math.atan2(-dx, -dz);
        let diff = targetAngle - player.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.group.rotation.y += diff * Math.min(1.0, delta * 12.0);
      } else {
        const targetAngle = Math.atan2(-player.velocity.x, -player.velocity.z);
        let diff = targetAngle - player.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.group.rotation.y += diff * Math.min(1.0, delta * 14.0);
      }

      player.state = 'moving';
      const currentAnim = player.isUpperBodyOverride ? player.currentLowerActionName : player.currentActionName;
      if (isSprinting) {
        if (currentAnim !== 'run') {
          player.playAction('run', 0.15, THREE.LoopRepeat, false, 1.0);
        }
      } else {
        const animSpeed = moveMag < 0.65 ? Math.max(0.7, moveMag / 0.65) : 1.0;
        if (currentAnim !== 'walk') {
          player.playAction('walk', 0.15, THREE.LoopRepeat, false, animSpeed);
        } else if (player.lowerBodyAction) {
          player.lowerBodyAction.setEffectiveTimeScale(animSpeed);
        }
      }
    } else {
      player.velocity.set(0, 0, 0);
      player.state = 'idle';

      if (lockedTargetPos) {
        const dx = lockedTargetPos.x - player.group.position.x;
        const dz = lockedTargetPos.z - player.group.position.z;
        const targetAngle = Math.atan2(-dx, -dz);
        let diff = targetAngle - player.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.group.rotation.y += diff * Math.min(1.0, delta * 10.0);
      }

      const currentAnim = player.isUpperBodyOverride ? player.currentLowerActionName : player.currentActionName;
      if (currentAnim !== 'idle') {
        player.playAction('idle', 0.2, THREE.LoopRepeat, false, 1.0);
      }
    }
  }
}

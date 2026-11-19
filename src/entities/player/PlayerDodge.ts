import * as THREE from 'three';
import { DODGE_CONFIG } from '../../combat/KinematicData';
import type { CombatInputs } from '../../core/types';
import type { PlayerCharacter } from '../PlayerCharacter';

export class PlayerDodgeHandler {
  public static startDodge(
    player: PlayerCharacter,
    inputs?: CombatInputs,
    cameraYaw = 0,
    explicitDirection?: THREE.Vector3,
  ): void {
    player.state = 'dodge';
    player.dodgeTimer = 0;
    player.isInvulnerable = false;
    player.stamina = Math.max(0, player.stamina - player.dodgeConfig.staminaCost);
    player.staminaRegenDelay = 1.0;

    // Interrupt drinking if active
    if (player.isDrinking) {
      player.isDrinking = false;
      if (player.flaskMesh) player.flaskMesh.visible = false;
    }

    // Compute dodge direction
    if (explicitDirection) {
      player.dodgeDirection.copy(explicitDirection).normalize();
    } else if (inputs && inputs.move.lengthSq() > 0.05) {
      const sinYaw = Math.sin(cameraYaw);
      const cosYaw = Math.cos(cameraYaw);
      const fwdX = -sinYaw;
      const fwdZ = -cosYaw;
      const rightX = cosYaw;
      const rightZ = -sinYaw;

      player.dodgeDirection.set(
        inputs.move.x * rightX - inputs.move.y * fwdX,
        0,
        inputs.move.x * rightZ - inputs.move.y * fwdZ,
      ).normalize();
    } else {
      player.dodgeDirection.set(
        Math.sin(player.group.rotation.y),
        0,
        Math.cos(player.group.rotation.y),
      ).normalize();
    }

    player.group.rotation.y = Math.atan2(-player.dodgeDirection.x, -player.dodgeDirection.z);
    player.playFullBodyAction('dodge', 0.04, THREE.LoopOnce, true, 1.0);
    if (player.upperBodyAction) {
      player.upperBodyAction.time = 0;
      player.upperBodyAction.paused = true;
    }
    if (player.lowerBodyAction) {
      player.lowerBodyAction.time = 0;
      player.lowerBodyAction.paused = true;
    }
  }

  public static setDodgeAnimTime(player: PlayerCharacter, targetTime: number): void {
    if (player.upperBodyAction && player.currentUpperActionName === 'dodge') {
      player.upperBodyAction.time = targetTime;
    }
    if (player.lowerBodyAction && player.currentLowerActionName === 'dodge') {
      player.lowerBodyAction.time = targetTime;
    }
    const fullAction = player.actions.get('dodge');
    if (fullAction) {
      fullAction.time = targetTime;
    }
  }

  public static setDodgeIFrameVisual(modelScene: THREE.Group | null, active: boolean): void {
    if (!modelScene) return;
    const flashColor = new THREE.Color(0xff4433);
    modelScene.traverse((obj) => {
      if (
        obj.name.toLowerCase().includes('sword') ||
        obj.name.toLowerCase().includes('hitbox') ||
        obj.name.toLowerCase().includes('flask')
      ) {
        return;
      }
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (active) {
              mat.emissive.copy(flashColor);
              mat.emissiveIntensity = 0.65;
            } else {
              mat.emissive.setHex(0x000000);
              mat.emissiveIntensity = 0;
            }
          }
        }
      }
    });
  }

  public static updateDodge(player: PlayerCharacter, delta: number, modelScene: THREE.Group | null): void {
    player.dodgeTimer += delta;

    const {
      startupStartFrame,
      startupEndFrame,
      startupDuration,
      iframeStartFrame,
      iframeEndFrame,
      iframeDuration,
      recoveryStartFrame,
      recoveryEndFrame,
      recoveryDuration,
      totalDistanceMeters,
    } = DODGE_CONFIG;

    const TOTAL_DURATION = startupDuration + iframeDuration + recoveryDuration;
    const IFRAME_END = startupDuration + iframeDuration;

    // Peak speed for half-sine traversal curve
    const peakSpeed = (totalDistanceMeters * 0.9) / ((2 / Math.PI) * iframeDuration);

    if (player.dodgeTimer < startupDuration) {
      // 1. Startup / Delay (Windup dive anticipation)
      player.isInvulnerable = false;
      PlayerDodgeHandler.setDodgeIFrameVisual(modelScene, false);

      const progress = Math.min(1.0, player.dodgeTimer / startupDuration);
      const frame = startupStartFrame + progress * (startupEndFrame - startupStartFrame);
      PlayerDodgeHandler.setDodgeAnimTime(player, (frame - 1) / 60);

      const startupSpeed = (totalDistanceMeters * 0.1) / startupDuration;
      player.group.position.addScaledVector(player.dodgeDirection, startupSpeed * delta);
    } else if (player.dodgeTimer < IFRAME_END) {
      // 2. Active I-Frames (Core invulnerability)
      player.isInvulnerable = true;
      PlayerDodgeHandler.setDodgeIFrameVisual(modelScene, true);

      const progress = Math.min(1.0, (player.dodgeTimer - startupDuration) / iframeDuration);
      const frame = iframeStartFrame + progress * (iframeEndFrame - iframeStartFrame);
      PlayerDodgeHandler.setDodgeAnimTime(player, (frame - 1) / 60);

      const speedCurve = Math.sin(progress * Math.PI);
      player.group.position.addScaledVector(player.dodgeDirection, peakSpeed * speedCurve * delta);
    } else if (player.dodgeTimer < TOTAL_DURATION) {
      // 3. Recovery (Landing and standing up)
      player.isInvulnerable = false;
      PlayerDodgeHandler.setDodgeIFrameVisual(modelScene, false);

      const progress = Math.min(1.0, (player.dodgeTimer - IFRAME_END) / recoveryDuration);
      const frame = recoveryStartFrame + progress * (recoveryEndFrame - recoveryStartFrame);
      PlayerDodgeHandler.setDodgeAnimTime(player, (frame - 1) / 60);

      const decaySpeed = (1.0 - progress) * 0.8;
      player.group.position.addScaledVector(player.dodgeDirection, decaySpeed * delta);
    } else {
      // 4. Roll Complete
      player.state = 'idle';
      player.isInvulnerable = false;
      PlayerDodgeHandler.setDodgeIFrameVisual(modelScene, false);
      if (player.upperBodyAction) player.upperBodyAction.paused = false;
      if (player.lowerBodyAction) player.lowerBodyAction.paused = false;
      const fullAction = player.actions.get('dodge');
      if (fullAction) fullAction.paused = false;
    }
  }
}

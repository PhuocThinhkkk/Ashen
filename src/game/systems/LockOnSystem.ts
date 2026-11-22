import type * as THREE from 'three';
import type { SoulslikeCamera } from '../../systems/SoulslikeCamera';

export class LockOnSystem {
  /**
   * [Purpose]: Evaluates lock-on toggle requests, proximity checks, and target validity to track target focus.
   * @condition Called each simulation frame during input consumption and camera updates.
   * @param cameraRig Camera controller; playerPosition and targetPosition are 3D vectors; maxLockDistance in units.
   * @returns The active locked target position vector if locked on, or null if disengaged or out of range.
   */
  public static updateLockOn(
    cameraRig: SoulslikeCamera,
    toggleRequested: boolean,
    playerPosition: THREE.Vector3,
    targetPosition: THREE.Vector3,
    isTargetDead: boolean,
    maxLockDistance = 26.0,
  ): THREE.Vector3 | null {
    if (toggleRequested && !isTargetDead) {
      const locked = cameraRig.toggleLockOn(targetPosition);
      if (!locked) {
        cameraRig.setLockedTarget(null);
      }
    }

    if (cameraRig.isLockedOn) {
      const dist = playerPosition.distanceTo(targetPosition);
      if (isTargetDead || dist > maxLockDistance) {
        cameraRig.setLockedTarget(null);
      } else {
        cameraRig.setLockedTarget(targetPosition);
      }
    }

    return cameraRig.isLockedOn ? targetPosition : null;
  }
}

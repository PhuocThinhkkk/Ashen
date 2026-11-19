import * as THREE from 'three';

/**
 * Calculates and applies procedural target-lock downward pitch tilt across spine bones.
 * Must run AFTER mixer.update() in late-update so AnimationMixer does not overwrite it.
 */
export function updateSpinePitchTilt(
  delta: number,
  lockedTargetPos: THREE.Vector3 | null,
  isAirborne: boolean,
  playerPos: THREE.Vector3,
  currentTiltAngle: number,
  spineBones: THREE.Object3D[],
  modelScene: THREE.Group | null,
  handBone: THREE.Object3D | null,
): number {
  let targetPitch = 0;

  if (isAirborne && lockedTargetPos && playerPos.y > lockedTargetPos.y) {
    const deltaY = playerPos.y - lockedTargetPos.y;
    const horizontalDist = Math.hypot(
      playerPos.x - lockedTargetPos.x,
      playerPos.z - lockedTargetPos.z,
    );
    const rawAngle = Math.atan2(deltaY, Math.max(0.1, horizontalDist));
    // Clamp pitch to [0, 30 degrees / 0.52 rad]
    targetPitch = THREE.MathUtils.clamp(rawAngle, 0, 0.52);
  }

  // Smoothly interpolate tilt angle in and out
  let newTilt = THREE.MathUtils.lerp(
    currentTiltAngle,
    targetPitch,
    Math.min(1.0, delta * 12.0),
  );
  if (newTilt < 0.0005) {
    newTilt = 0;
  }

  // Distribute pitch across Spine, Spine1, Spine2 local X-axis
  if (newTilt > 0 && spineBones.length > 0) {
    const anglePerBone = newTilt / spineBones.length;
    const tiltQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      anglePerBone,
    );
    for (const bone of spineBones) {
      bone.quaternion.multiply(tiltQuat);
      bone.updateMatrix();
    }
    if (modelScene) {
      modelScene.updateMatrixWorld(true);
    }
    if (handBone) {
      handBone.updateMatrixWorld(true);
    }
  }

  return newTilt;
}

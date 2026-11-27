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
  compensateLowerBodyYaw = false,
): number {
  let targetPitch = 0;

  if (isAirborne && lockedTargetPos && playerPos.y > 0.05) {
    // Aim from player chest (~1.35m) toward locked target center (~1.25m)
    const deltaY = playerPos.y + 1.35 - (lockedTargetPos.y + 1.25);
    const horizontalDist = Math.hypot(
      playerPos.x - lockedTargetPos.x,
      playerPos.z - lockedTargetPos.z,
    );
    if (deltaY > 0) {
      const rawAngle = Math.atan2(deltaY, Math.max(0.1, horizontalDist));
      // Clamp pitch to [0, 30 degrees / 0.52 rad]
      targetPitch = THREE.MathUtils.clamp(rawAngle, 0, 0.52);
    }
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

  // When an upper-body attack overrides jumping lower-body, the jumping clip rotates Hips ~70-110 deg
  // around Y; counter-yaw Spine[0] back to align the torso forward axis with character forward (-Z)
  if (compensateLowerBodyYaw && spineBones.length > 0 && spineBones[0].parent && modelScene?.parent) {
    const groupObj = modelScene.parent;
    groupObj.updateMatrixWorld(true);
    const groupWorldQuat = new THREE.Quaternion();
    groupObj.getWorldQuaternion(groupWorldQuat);

    const hips = spineBones[0].parent;
    hips.updateMatrixWorld(true);
    const hipsWorldQuat = new THREE.Quaternion();
    hips.getWorldQuaternion(hipsWorldQuat);

    // Mixamo rig local forward is +Z (rotated PI on modelScene to face world -Z)
    const hipsRelQuat = groupWorldQuat.clone().invert().multiply(hipsWorldQuat);
    const hipsFwdLocal = new THREE.Vector3(0, 0, 1).applyQuaternion(hipsRelQuat);
    hipsFwdLocal.y = 0;
    if (hipsFwdLocal.lengthSq() > 1e-6) {
      hipsFwdLocal.normalize();
      const hipsFwdWorld = hipsFwdLocal.applyQuaternion(groupWorldQuat).normalize();
      const wantFwdWorld = new THREE.Vector3(0, 0, -1).applyQuaternion(groupWorldQuat).normalize();
      const yawCorrWorld = new THREE.Quaternion().setFromUnitVectors(hipsFwdWorld, wantFwdWorld);
      const corrInParent = hipsWorldQuat.clone().invert().multiply(yawCorrWorld).multiply(hipsWorldQuat);
      spineBones[0].quaternion.premultiply(corrInParent);
      spineBones[0].updateMatrixWorld(true);
    }
  }

  // Distribute pitch forward around character right axis in each spine bone's parent frame
  if (newTilt > 0 && spineBones.length > 0) {
    const anglePerBone = newTilt / spineBones.length;
    const charRightWorld = new THREE.Vector3(1, 0, 0);
    if (modelScene?.parent) {
      modelScene.parent.updateMatrixWorld(true);
      const groupWorldQuat = new THREE.Quaternion();
      modelScene.parent.getWorldQuaternion(groupWorldQuat);
      charRightWorld.applyQuaternion(groupWorldQuat).normalize();
    }

    const parentWorldQuat = new THREE.Quaternion();
    const axisInParent = new THREE.Vector3();
    const tiltQuat = new THREE.Quaternion();

    for (const bone of spineBones) {
      if (bone.parent) {
        bone.parent.updateMatrixWorld(true);
        bone.parent.getWorldQuaternion(parentWorldQuat);
        axisInParent.copy(charRightWorld).applyQuaternion(parentWorldQuat.invert()).normalize();
      } else {
        axisInParent.copy(charRightWorld);
      }
      tiltQuat.setFromAxisAngle(axisInParent, -anglePerBone);
      bone.quaternion.premultiply(tiltQuat);
      bone.updateMatrixWorld(true);
    }
    if (modelScene) {
      modelScene.updateMatrixWorld(true);
    }
    if (handBone) {
      handBone.updateMatrixWorld(true);
    }
  } else if (compensateLowerBodyYaw) {
    modelScene?.updateMatrixWorld(true);
    handBone?.updateMatrixWorld(true);
  }

  return newTilt;
}

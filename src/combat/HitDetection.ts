import * as THREE from 'three';
import type { AttackDefinition } from './FrameCombat';

export interface HitResult {
  hit: boolean;
  damage: number;
  poiseDamage: number;
  isHeavy: boolean;
  contactPoint?: THREE.Vector3;
}

const vToTarget = new THREE.Vector3();
const vAttackerForward = new THREE.Vector3();

/**
 * [Purpose]: Evaluates geometric distance, attack reach, horizontal angular arc, and target invulnerability to determine attack impact.
 * @condition Called during active attack frames when performing radial/arc hitbox collision queries against an entity.
 * @param attackerPosition,attackerRotationY,attack,targetPosition,targetRadius,targetInvulnerable Attacker coordinates, orientation, attack stats, target coordinates/radius, and i-frame status.
 * @returns HitResult object detailing whether a hit occurred, damage/poise values, heavy flag, and computed 3D contact point.
 */
export function checkAttackHit(
  attackerPosition: THREE.Vector3,
  attackerRotationY: number,
  attack: AttackDefinition,
  targetPosition: THREE.Vector3,
  targetRadius: number,
  targetInvulnerable: boolean,
): HitResult {
  if (targetInvulnerable) {
    return { hit: false, damage: 0, poiseDamage: 0, isHeavy: false };
  }

  // Vector from attacker to target in XZ plane
  vToTarget.set(targetPosition.x - attackerPosition.x, 0, targetPosition.z - attackerPosition.z);
  const distance = vToTarget.length();

  const maxRange = attack.range + targetRadius;
  if (distance > maxRange || distance < 0.001) {
    return { hit: false, damage: 0, poiseDamage: 0, isHeavy: false };
  }

  // Attacker forward vector in XZ plane (0 angle is facing -Z in Three.js standard)
  vAttackerForward.set(
    -Math.sin(attackerRotationY),
    0,
    -Math.cos(attackerRotationY)
  ).normalize();

  vToTarget.normalize();
  const angleCos = vAttackerForward.dot(vToTarget);
  const minCos = Math.cos(attack.arcAngle / 2);

  if (angleCos >= minCos || distance <= targetRadius) {
    // Contact point directly on target's surface facing the attacker
    const contact = targetPosition.clone().addScaledVector(vToTarget, -targetRadius * 0.75);
    contact.y = targetPosition.y + 1.15;
    return {
      hit: true,
      damage: attack.damage,
      poiseDamage: attack.poiseDamage,
      isHeavy: !!attack.isHeavy,
      contactPoint: contact,
    };
  }

  return { hit: false, damage: 0, poiseDamage: 0, isHeavy: false };
}

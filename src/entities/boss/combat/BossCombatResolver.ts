import * as THREE from 'three';
import type { WeaponBladeSegment, BodyCapsule } from '../../../combat/WeaponCollisionSystem';
import type { BossWeapon } from '../BossWeapon';
import type { KinematicCombatController } from '../../../combat/KinematicCombatController';
import type { AttackDefinition } from '../../../combat/FrameCombat';

export class BossCombatResolver {
  public static calculateDamage(
    currentHp: number,
    incomingDamage: number,
  ): { newHp: number; isDead: boolean } {
    const newHp = Math.max(0, currentHp - incomingDamage);
    return { newHp, isDead: newHp <= 0 };
  }

  public static calculatePoise(
    currentPoise: number,
    maxPoise: number,
    incomingPoiseDamage: number,
    currentState: string,
  ): { newPoise: number; triggerStagger: boolean } {
    const remainingPoise = currentPoise - incomingPoiseDamage;
    if (remainingPoise <= 0 && currentState !== 'stagger' && currentState !== 'phaseTransition') {
      return { newPoise: maxPoise, triggerStagger: true };
    }
    return { newPoise: Math.max(0, remainingPoise), triggerStagger: false };
  }

  public static resolveBladeHitboxPosition(
    weapon: BossWeapon,
    kinematicController: KinematicCombatController | null,
    currentAttack: AttackDefinition | null,
    target: THREE.Vector3 = new THREE.Vector3(),
  ): THREE.Vector3 {
    if (kinematicController?.activeHitboxBone && currentAttack?.animationClip === 'kick') {
      return kinematicController.getHitboxWorldPosition(target);
    }
    return weapon.getBladeHitboxWorldPosition(target);
  }

  public static resolveWeaponBladeSegment(
    weapon: BossWeapon,
    bossPosition: THREE.Vector3,
    bossRotationY: number,
    outBase: THREE.Vector3 = new THREE.Vector3(),
    outTip: THREE.Vector3 = new THREE.Vector3(),
  ): WeaponBladeSegment {
    return weapon.getWeaponBladeSegment(bossPosition, bossRotationY, outBase, outTip);
  }

  public static resolveBodyCapsule(position: THREE.Vector3, radius = 1.1, height = 2.45): BodyCapsule {
    return {
      position,
      radius,
      height,
    };
  }
}

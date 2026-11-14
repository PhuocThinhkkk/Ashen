import * as THREE from 'three';
import type { PlayerCharacter } from '../../entities/PlayerCharacter';
import type { BossCharacter } from '../../entities/BossCharacter';
import {
  WeaponCollisionSystem,
  type WeaponBladeSegment,
} from '../../combat/WeaponCollisionSystem';

export class DuelCombatResolver {
  private static prevPlayerBlade: WeaponBladeSegment | null = null;
  private static prevBossBlade: WeaponBladeSegment | null = null;

  public static lastBladeToPlayerDistance = 999;
  public static lastBladeToBossDistance = 999;

  public static resolve(
    player: PlayerCharacter | null,
    boss: BossCharacter | null,
    onCombatLog: (text: string) => void,
    onContact?: (point: THREE.Vector3) => void,
  ): void {
    if (!player || !boss) return;

    // 1. Player Weapon Segment & Hit Boss
    const playerBlade = player.getWeaponBladeSegment();
    const bossCapsule = boss.getBodyCapsule();

    const playerCol = WeaponCollisionSystem.testSweptBladeToBody(
      playerBlade,
      this.prevPlayerBlade,
      bossCapsule,
    );
    this.lastBladeToBossDistance = playerCol.distance;

    if (
      player.state === 'attack' &&
      player.attackPhase === 'active' &&
      player.currentAttack &&
      !player.hasHitCurrentSwing &&
      boss.state !== 'dead'
    ) {
      if (playerCol.hit) {
        player.hasHitCurrentSwing = true;
        boss.takeDamage(player.currentAttack.damage, player.currentAttack.poiseDamage);
        if (playerCol.contactPoint) onContact?.(playerCol.contactPoint);
        onCombatLog(
          `[HIT] WEAPON HIT BOSS! DMG: ${player.currentAttack.damage} (Blade Dist: ${playerCol.distance.toFixed(2)}m) | Boss HP: ${Math.round(boss.hp)}`,
        );
      }
    }

    // 2. Boss Weapon Segment & Hit Player
    const isKick = boss.currentAttack?.animationClip === 'kick';
    const playerCapsule = player.getBodyCapsule();
    let bossCol;

    if (isKick) {
      const footPos = boss.getFootLocation();
      bossCol = WeaponCollisionSystem.testSphereToBody(footPos, 0.35, playerCapsule);
    } else {
      const bossBlade = boss.getWeaponBladeSegment();
      bossCol = WeaponCollisionSystem.testSweptBladeToBody(
        bossBlade,
        this.prevBossBlade,
        playerCapsule,
      );
      this.prevBossBlade = {
        base: bossBlade.base.clone(),
        tip: bossBlade.tip.clone(),
        radius: bossBlade.radius,
      };
    }
    this.lastBladeToPlayerDistance = bossCol.distance;

    if (
      (boss.state === 'active' || boss.isHitboxActive()) &&
      boss.currentAttack &&
      !boss.hasHitCurrentSwing &&
      player.state !== 'dead'
    ) {
      if (bossCol.hit) {
        boss.hasHitCurrentSwing = true;
        if (player.isInvulnerable) {
          onCombatLog(
            `[EVADED] WEAPON EVADED BY DODGE ROLL I-FRAMES! (Blade Dist: ${bossCol.distance.toFixed(2)}m)`,
          );
        } else {
          player.takeDamage(boss.currentAttack.damage, !!boss.currentAttack.isHeavy);
          if (bossCol.contactPoint) onContact?.(bossCol.contactPoint);
          onCombatLog(
            `[HIT] WEAPON HIT PLAYER! DMG: ${boss.currentAttack.damage} (Blade Dist: ${bossCol.distance.toFixed(2)}m) | Player HP: ${Math.round(player.hp)}`,
          );
        }
      }
    }

    this.prevPlayerBlade = {
      base: playerBlade.base.clone(),
      tip: playerBlade.tip.clone(),
      radius: playerBlade.radius,
    };
  }

  public static reset(): void {
    this.prevPlayerBlade = null;
    this.prevBossBlade = null;
    this.lastBladeToPlayerDistance = 999;
    this.lastBladeToBossDistance = 999;
  }
}

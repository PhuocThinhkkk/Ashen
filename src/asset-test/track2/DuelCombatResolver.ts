import type { PlayerCharacter } from '../../entities/PlayerCharacter';
import type { BossCharacter } from '../../entities/BossCharacter';
import { checkAttackHit } from '../../combat/HitDetection';

export class DuelCombatResolver {
  public static resolve(
    player: PlayerCharacter | null,
    boss: BossCharacter | null,
    onCombatLog: (text: string) => void,
  ): void {
    if (!player || !boss) return;

    // 1. Player attack hits Boss
    if (
      player.state === 'attack' &&
      player.attackPhase === 'active' &&
      player.currentAttack &&
      !player.hasHitCurrentSwing &&
      boss.state !== 'dead'
    ) {
      const hit = checkAttackHit(
        player.group.position,
        player.group.rotation.y,
        player.currentAttack,
        boss.group.position,
        boss.radius,
        false,
      );
      if (hit.hit) {
        player.hasHitCurrentSwing = true;
        boss.takeDamage(hit.damage, hit.poiseDamage);
        onCombatLog(`🗡️ Player hit Boss! DMG: ${hit.damage} | Boss HP: ${Math.round(boss.hp)}`);
      }
    }

    // 2. Boss attack hits Player
    if (
      (boss.state === 'active' || boss.isHitboxActive()) &&
      boss.currentAttack &&
      !boss.hasHitCurrentSwing &&
      player.state !== 'dead'
    ) {
      const isInvulnerable = player.isInvulnerable;
      const hit = checkAttackHit(
        boss.group.position,
        boss.group.rotation.y,
        boss.currentAttack,
        player.group.position,
        player.radius,
        isInvulnerable,
      );
      if (hit.hit) {
        boss.hasHitCurrentSwing = true;
        if (isInvulnerable) {
          onCombatLog(`🛡️ ATTACK EVADED BY DODGE ROLL I-FRAMES! (Clean Dodge)`);
        } else {
          player.takeDamage(hit.damage, !!hit.isHeavy);
          onCombatLog(`💥 Boss hit Player! DMG: ${hit.damage} | Player HP: ${Math.round(player.hp)}`);
        }
      }
    }
  }
}

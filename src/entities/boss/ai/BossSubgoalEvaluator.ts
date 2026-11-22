import { BOSS_ATTACKS, type AttackDefinition } from '../../../combat/FrameCombat';
import { BOSS_CONFIG, type BossSubgoal } from '../BossAI';
import type { IBossAIHost } from '../types';

export class BossSubgoalEvaluator {
  /**
   * Evaluates if boss can and should interrupt player heal with an immediate jump attack.
   */
  public static shouldPunishPlayerHealing(
    host: IBossAIHost,
    currentSubgoal: BossSubgoal | null,
    isPlayerHealing: boolean,
  ): boolean {
    if (!BOSS_CONFIG.punishHealWithJump || !isPlayerHealing) {
      return false;
    }

    const isStrafeOrApproach =
      host.state === 'idle' ||
      host.state === 'approach' ||
      currentSubgoal?.type === 'STRAFE_INSPECT' ||
      currentSubgoal?.type === 'APPROACH';

    return isStrafeOrApproach;
  }

  /**
   * [Purpose]: Evaluates boss-to-player distance and combat phase to choose an offensive action plan (combo sequence, solo attack, or approach).
   * @condition Called by BossAI whenever the subgoal queue becomes empty and a new offensive behavior must be selected.
   * @param distanceToPlayer,isPhase2 Euclidean distance to player in meters, and whether Phase 2 aggression rules apply.
   * @returns Action descriptor object containing action type ('COMBO' | 'ATTACK' | 'APPROACH') and associated attack definitions.
   */
  public static selectOffensiveActionByDistance(
    distanceToPlayer: number,
    isPhase2: boolean,
  ): { type: 'COMBO' | 'ATTACK' | 'APPROACH'; opener?: AttackDefinition; followup?: AttackDefinition; attack?: AttackDefinition; approachDuration?: number } {
    if (distanceToPlayer <= 3.6) {
      // Close range: combo
      const opener = Math.random() < 0.4 ? BOSS_ATTACKS.kick : BOSS_ATTACKS.combo;
      const followup = isPhase2 && Math.random() < 0.5 ? BOSS_ATTACKS.spin360 : BOSS_ATTACKS.downward;
      return { type: 'COMBO', opener, followup };
    }

    if (distanceToPlayer <= 6.0) {
      // Mid range
      if (isPhase2 && Math.random() < 0.35) {
        return { type: 'ATTACK', attack: BOSS_ATTACKS.spin360 };
      }
      if (Math.random() < 0.5) {
        return { type: 'APPROACH', approachDuration: 2.2 };
      }
      return { type: 'COMBO', opener: BOSS_ATTACKS.combo, followup: BOSS_ATTACKS.downward };
    }

    // Long range
    return { type: 'APPROACH', approachDuration: 2.5 };
  }

  /**
   * Evaluates COMBO_CHECK condition when player rolls away or stays close.
   */
  public static shouldContinueCombo(distanceToPlayer: number, maxDistance = 4.2): boolean {
    return distanceToPlayer <= maxDistance;
  }
}

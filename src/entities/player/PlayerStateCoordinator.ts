import type { PlayerCharacter, PlayerState } from '../PlayerCharacter';

/**
 * Coordinates high-level state transitions and priorities for the player.
 */
export class PlayerStateCoordinator {
  /**
   * [Purpose]: Validates whether the player can legitimately transition from the current state to the requested target state based on priority rules.
   * @condition Invoked prior to initiating state changes such as dodging, attacking, jumping, or recovering.
   * @param player,newState PlayerCharacter instance containing current state and stamina, and candidate target PlayerState.
   * @returns Boolean indicating whether the state transition is permitted.
   */
  public static canTransitionTo(player: PlayerCharacter, newState: PlayerState): boolean {
    if (player.state === 'dead') return false;
    if (player.state === 'stagger' && newState !== 'dead') return false;

    if (newState === 'dodge') {
      // Dodge roll has high priority: cancels drinking and movement
      return player.stamina >= 15;
    }

    return true;
  }

  public static canStartDrinking(player: PlayerCharacter): boolean {
    // Drinking allowed when grounded and not staggering or dodging
    return (
      player.isGrounded &&
      player.state !== 'stagger' &&
      player.state !== 'dodge' &&
      player.healCharges > 0 &&
      !player.isDrinking
    );
  }

  public static handleInterruptDrink(player: PlayerCharacter): void {
    if (!player.isDrinking) return;

    player.isDrinking = false;
    if (player.flaskMesh) {
      player.flaskMesh.visible = false;
    }
    player.clearUpperBodyOverride(0.12);
  }
}

import * as THREE from 'three';
import type { IBossAIHost } from '../types';

export class BossPhaseManager {
  private host: IBossAIHost;

  constructor(host: IBossAIHost) {
    this.host = host;
  }

  public triggerPhase2(): void {
    this.host.isPhase2 = true;
    this.host.state = 'phaseTransition';
    this.host.stateTimer = 0;
    this.host.currentAttack = null;
  }

  /**
   * [Purpose]: Advances phase transition duration timer, updates telegraph visual glow pulsing, turns boss to face player, and triggers completion callback.
   * @condition Called during the 60Hz tick while boss is in the 'phaseTransition' invulnerability state.
   * @param dt,playerPos,onComplete Frame time step in seconds, optional player position vector, and completion callback fired upon transition end.
   * @returns Updates host stateTimer, telegraphGlow intensity, and resets state back to 'idle' when timer reaches duration threshold.
   */
  public updatePhaseTransition(dt: number, playerPos?: THREE.Vector3, onComplete?: () => void): void {
    this.host.stateTimer += dt;
    if (playerPos) {
      this.host.faceTarget(playerPos, THREE.MathUtils.degToRad(100), dt);
    }

    // Pulsing aura telegraph glow
    this.host.telegraphGlow = Math.sin(this.host.stateTimer * 8.0) * 0.5 + 0.5;

    if (this.host.stateTimer >= 2.0) {
      this.host.state = 'idle';
      this.host.stateTimer = 0;
      this.host.telegraphGlow = 0;
      if (onComplete) {
        onComplete();
      }
    }
  }
}

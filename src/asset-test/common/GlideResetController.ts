import * as THREE from 'three';

export class GlideResetController {
  public landingTimer = -1;
  public resetGlideProgress = -1;
  public isActionActive = false;
  public readonly actionStartPos = new THREE.Vector3();
  public lastDispText = 'Δ0.00m';

  constructor(public readonly defaultPosition: THREE.Vector3) {}

  public onActionStart(currentPos: THREE.Vector3): void {
    this.isActionActive = true;
    this.actionStartPos.copy(currentPos);
    this.landingTimer = -1;
    this.resetGlideProgress = -1;
  }

  public onActionEnd(currentPos: THREE.Vector3, autoReset: boolean, isBoss = false): void {
    this.isActionActive = false;
    const dist = currentPos.distanceTo(this.actionStartPos);
    const deltaZ = isBoss
      ? this.actionStartPos.z - currentPos.z
      : currentPos.z - this.actionStartPos.z;
    this.lastDispText = `Δ${dist.toFixed(2)}m (Z:${deltaZ >= 0 ? '+' : ''}${deltaZ.toFixed(2)}m)`;
    if (autoReset) {
      this.landingTimer = 1.0;
    }
  }

  /**
   * [Purpose]: Updates landing delay countdown and smoothly glides entity transform back to default rest position.
   * @condition Called on each frame update for entities configured with kinematic glide reset enabled.
   * @param delta Frame delta time in seconds, and group THREE.Group transform to be interpolated.
   * @returns Linearly interpolates group position towards defaultPosition until reset completion.
   */
  public updateGlide(delta: number, group: THREE.Group): void {
    if (this.landingTimer > 0) {
      this.landingTimer -= delta;
      if (this.landingTimer <= 0) {
        this.resetGlideProgress = 0;
      }
    }

    if (this.resetGlideProgress >= 0) {
      this.resetGlideProgress += delta * 2.5; // ~0.4s smooth glide
      if (this.resetGlideProgress >= 1.0) {
        this.resetGlideProgress = -1;
        group.position.copy(this.defaultPosition);
      } else {
        group.position.lerp(this.defaultPosition, Math.min(1.0, delta * 12.0));
      }
    }
  }

  public reset(group: THREE.Group): void {
    this.landingTimer = -1;
    this.resetGlideProgress = -1;
    this.isActionActive = false;
    group.position.copy(this.defaultPosition);
  }
}

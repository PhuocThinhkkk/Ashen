import * as THREE from 'three';

export interface LocomotionWeights {
  idle: number;
  walkForward: number;
  walkBack: number;
  strafeLeft: number;
  strafeRight: number;
}

export interface LocomotionActions {
  idleAction: THREE.AnimationAction | null;
  walkForwardAction: THREE.AnimationAction | null;
  walkBackAction: THREE.AnimationAction | null;
  strafeLeftAction: THREE.AnimationAction | null;
  strafeRightAction: THREE.AnimationAction | null;
}

/**
 * Manages 2D directional blend weights and phase synchronization for boss movement.
 */
export class BossLocomotionBlend {
  public currentWeights: LocomotionWeights = {
    idle: 1.0,
    walkForward: 0.0,
    walkBack: 0.0,
    strafeLeft: 0.0,
    strafeRight: 0.0,
  };

  public locomotionMasterWeight = 1.0;
  public isLocomotionActive = true;

  // Lower-Body Turn Layer Weights
  public turnDirection: 'left' | 'right' | null = null;
  public currentTurnLeftWeight = 0;
  public currentTurnRightWeight = 0;
  public targetTurnLeftWeight = 0;
  public targetTurnRightWeight = 0;

  /**
   * Synchronizes phase of running walk/strafe clips so footfalls match smoothly.
   */
  public syncLocomotionPhases(actions: LocomotionActions): void {
    const { walkForwardAction, walkBackAction, strafeLeftAction, strafeRightAction } = actions;
    if (walkForwardAction && walkForwardAction.isRunning()) {
      const clipDur = walkForwardAction.getClip().duration;
      if (clipDur > 0) {
        const phase = (walkForwardAction.time % clipDur) / clipDur;
        if (walkBackAction) walkBackAction.time = phase * walkBackAction.getClip().duration;
        if (strafeLeftAction) strafeLeftAction.time = phase * strafeLeftAction.getClip().duration;
        if (strafeRightAction) strafeRightAction.time = phase * strafeRightAction.getClip().duration;
      }
    }
  }

  /**
   * Computes target directional weights from strafe and radial inputs.
   */
  public calculateDirectionalWeights(strafeDir: number, radialFactor: number): LocomotionWeights {
    const moveMag = Math.min(1.0, Math.sqrt(strafeDir * strafeDir + radialFactor * radialFactor));
    if (moveMag <= 0.05) {
      return { idle: 1.0, walkForward: 0, walkBack: 0, strafeLeft: 0, strafeRight: 0 };
    }

    const rawFwd = Math.max(0, radialFactor);
    const rawBack = Math.max(0, -radialFactor);
    const rawLeft = Math.max(0, -strafeDir);
    const rawRight = Math.max(0, strafeDir);
    const sum = rawFwd + rawBack + rawLeft + rawRight;

    if (sum <= 0.001) {
      return { idle: 1.0, walkForward: 0, walkBack: 0, strafeLeft: 0, strafeRight: 0 };
    }

    return {
      idle: Math.max(0, 1.0 - moveMag),
      walkForward: (rawFwd / sum) * moveMag,
      walkBack: (rawBack / sum) * moveMag,
      strafeLeft: (rawLeft / sum) * moveMag,
      strafeRight: (rawRight / sum) * moveMag,
    };
  }

  /**
   * [Purpose]: Interpolates locomotion blend weights toward target directional inputs and applies effective weights to animation actions.
   * @condition Invoked every frame during boss locomotion update to produce seamless multi-directional footwork.
   * @param delta,strafeDir,radialFactor,actions Frame delta time (s), lateral strafe sign, forward/backward factor, and container of active locomotion actions.
   * @returns Dominant animation action name based on current highest blend weight.
   */
  public updateWeights(
    delta: number,
    strafeDir: number,
    radialFactor: number,
    actions: LocomotionActions,
  ): string {
    this.syncLocomotionPhases(actions);
    const targets = this.calculateDirectionalWeights(strafeDir, radialFactor);

    const blendRate = 10.0;
    this.currentWeights.idle = THREE.MathUtils.damp(this.currentWeights.idle, targets.idle, blendRate, delta);
    this.currentWeights.walkForward = THREE.MathUtils.damp(this.currentWeights.walkForward, targets.walkForward, blendRate, delta);
    this.currentWeights.walkBack = THREE.MathUtils.damp(this.currentWeights.walkBack, targets.walkBack, blendRate, delta);
    this.currentWeights.strafeLeft = THREE.MathUtils.damp(this.currentWeights.strafeLeft, targets.strafeLeft, blendRate, delta);
    this.currentWeights.strafeRight = THREE.MathUtils.damp(this.currentWeights.strafeRight, targets.strafeRight, blendRate, delta);

    // Floor check to prevent 0 total weight
    const totalBlended =
      this.currentWeights.idle +
      this.currentWeights.walkForward +
      this.currentWeights.walkBack +
      this.currentWeights.strafeLeft +
      this.currentWeights.strafeRight;
    if (totalBlended < 0.05) {
      this.currentWeights.idle = 1.0;
    }

    // Damp master weight
    const targetMaster = this.isLocomotionActive ? 1.0 : 0.0;
    this.locomotionMasterWeight = THREE.MathUtils.damp(
      this.locomotionMasterWeight,
      targetMaster,
      1.0 / 0.15,
      delta,
    );

    // Apply effective weights to mixer actions
    const master = this.locomotionMasterWeight;
    const items = [
      { action: actions.idleAction, weight: this.currentWeights.idle * master },
      { action: actions.walkForwardAction, weight: this.currentWeights.walkForward * master },
      { action: actions.walkBackAction, weight: this.currentWeights.walkBack * master },
      { action: actions.strafeLeftAction, weight: this.currentWeights.strafeLeft * master },
      { action: actions.strafeRightAction, weight: this.currentWeights.strafeRight * master },
    ];

    for (const item of items) {
      if (!item.action) continue;
      item.action.enabled = true;
      if (item.weight > 0.001 && !item.action.isRunning()) {
        item.action.play();
      }
      item.action.setEffectiveWeight(item.weight);
    }

    return this.resolveDominantActionName(master);
  }

  private resolveDominantActionName(master: number): string {
    if (!this.isLocomotionActive || master <= 0.3) {
      return 'idle';
    }

    let maxWeight = this.currentWeights.idle;
    let dominant = 'idle';

    if (this.currentWeights.strafeLeft > maxWeight) {
      maxWeight = this.currentWeights.strafeLeft;
      dominant = 'strafe_left';
    }
    if (this.currentWeights.strafeRight > maxWeight) {
      maxWeight = this.currentWeights.strafeRight;
      dominant = 'strafe_right';
    }
    if (this.currentWeights.walkForward > maxWeight) {
      maxWeight = this.currentWeights.walkForward;
      dominant = 'walking';
    }
    if (this.currentWeights.walkBack > maxWeight) {
      dominant = 'walk_back';
    }

    return dominant;
  }
}

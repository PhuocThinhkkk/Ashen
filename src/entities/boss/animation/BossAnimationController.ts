import * as THREE from 'three';
import { splitClipByBodyPart } from '../../../utils/AnimationSplitter';

export class BossAnimationController {
  public mixer: THREE.AnimationMixer | null = null;
  public readonly actions = new Map<string, THREE.AnimationAction>();
  public currentAction: THREE.AnimationAction | null = null;
  public currentActionName = '';

  // Dual-layer Upper / Lower Actions & Split Clips
  public readonly upperActions = new Map<string, THREE.AnimationAction>();
  public readonly lowerActions = new Map<string, THREE.AnimationAction>();
  public readonly splitClips = new Map<string, { upper: THREE.AnimationClip; lower: THREE.AnimationClip }>();

  public currentUpperAttackAction: THREE.AnimationAction | null = null;
  public currentLowerAttackAction: THREE.AnimationAction | null = null;
  public currentLowerIdleAction: THREE.AnimationAction | null = null;

  public setupMixer(root: THREE.Object3D): THREE.AnimationMixer {
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this.actions.clear();
    this.upperActions.clear();
    this.lowerActions.clear();
    this.splitClips.clear();
    this.mixer = new THREE.AnimationMixer(root);
    return this.mixer;
  }

  /**
   * [Purpose]: Registers animation clips with the AnimationMixer and partitions them into upper- and lower-body sub-clips for skeletal layering.
   * @condition Invoked during model loading after the AnimationMixer has been bound to the model root.
   * @param clips Array of AnimationClip assets imported from the boss 3D model.
   * @returns Populates full-body actions map and upper/lower layer sub-clip action registries.
   */
  public registerClips(clips: THREE.AnimationClip[]): void {
    if (!this.mixer) return;

    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);

      // Split into upper and lower sub-clips for layering
      try {
        const split = splitClipByBodyPart(clip);
        if (split) {
          this.splitClips.set(clip.name, split);
          this.upperActions.set(clip.name, this.mixer.clipAction(split.upper));
          this.lowerActions.set(clip.name, this.mixer.clipAction(split.lower));
        }
      } catch {
        // Fallback if bone hierarchy lacks spine
      }
    }
  }

  public playAction(
    name: string,
    crossFadeDuration = 0.2,
    loopMode: THREE.AnimationActionLoopStyles = THREE.LoopRepeat,
    clampWhenFinished = false,
    timeScale = 1.0,
  ): THREE.AnimationAction | null {
    if (!this.mixer) return null;

    const action = this.actions.get(name);
    if (!action) return null;

    action.setLoop(loopMode, loopMode === THREE.LoopOnce ? 1 : Infinity);
    action.clampWhenFinished = clampWhenFinished;
    action.timeScale = timeScale;

    if (this.currentAction && this.currentAction !== action) {
      action.reset();
      action.enabled = true;
      action.play();
      this.currentAction.crossFadeTo(action, crossFadeDuration, false);
    } else {
      action.reset();
      action.enabled = true;
      action.play();
    }

    this.currentAction = action;
    this.currentActionName = name;
    return action;
  }
}

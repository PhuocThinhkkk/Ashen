import * as THREE from 'three';
import { ModelLoader } from '../../utils/ModelLoader';
import { splitClipByBodyPart } from '../../utils/AnimationSplitter';
import type { KinematicCombatController } from '../../combat/KinematicCombatController';

export class PlayerDualLayerAnimator {
  public upperBodyAction: THREE.AnimationAction | null = null;
  public lowerBodyAction: THREE.AnimationAction | null = null;
  public currentUpperActionName = '';
  public currentLowerActionName = '';
  public currentActionName = '';
  public currentAction: THREE.AnimationAction | null = null;
  public isUpperBodyOverride = false;

  public readonly upperActions = new Map<string, THREE.AnimationAction>();
  public readonly lowerActions = new Map<string, THREE.AnimationAction>();
  public readonly splitClips = new Map<string, { upper: THREE.AnimationClip; lower: THREE.AnimationClip }>();
  public readonly actions = new Map<string, THREE.AnimationAction>();

  private rawClips: THREE.AnimationClip[] = [];

  public clear(): void {
    this.upperActions.clear();
    this.lowerActions.clear();
    this.splitClips.clear();
    this.actions.clear();
    this.rawClips = [];
    this.upperBodyAction = null;
    this.lowerBodyAction = null;
    this.currentAction = null;
    this.currentUpperActionName = '';
    this.currentLowerActionName = '';
    this.currentActionName = '';
    this.isUpperBodyOverride = false;
  }

  public initAnimations(
    mixer: THREE.AnimationMixer,
    clips: THREE.AnimationClip[],
    kinematicController: KinematicCombatController | null,
  ): void {
    this.clear();
    this.rawClips = clips;

    for (const clip of clips) {
      kinematicController?.stripRootMotion(clip);

      // Pre-generate split upper and lower sub-clips
      const split = splitClipByBodyPart(clip);
      this.splitClips.set(clip.name, split);

      const upperAction = mixer.clipAction(split.upper);
      const lowerAction = mixer.clipAction(split.lower);
      this.upperActions.set(clip.name, upperAction);
      this.lowerActions.set(clip.name, lowerAction);

      // Full-body action for compatibility
      const fullAction = mixer.clipAction(clip);
      this.actions.set(clip.name, fullAction);
    }
  }

  public findActionPair(name: string): {
    upperAction: THREE.AnimationAction | null;
    lowerAction: THREE.AnimationAction | null;
    resolvedName: string;
  } {
    let resolvedName = name;
    let upperAction = this.upperActions.get(name) || null;
    let lowerAction = this.lowerActions.get(name) || null;

    if (!upperAction || !lowerAction) {
      const clip = ModelLoader.findClip(this.rawClips, name);
      if (clip) {
        resolvedName = clip.name;
        upperAction = this.upperActions.get(clip.name) || null;
        lowerAction = this.lowerActions.get(clip.name) || null;
      }
    }

    return { upperAction, lowerAction, resolvedName };
  }

  public playFullBodyAction(
    name: string,
    fadeDuration = 0.15,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat,
    clampWhenFinished = false,
    timeScale = 1.0,
  ): { upper: THREE.AnimationAction | null; lower: THREE.AnimationAction | null } {
    const { upperAction, lowerAction, resolvedName } = this.findActionPair(name);
    if (!upperAction || !lowerAction) return { upper: null, lower: null };

    // 1. Lower Body Action setup & crossfade
    lowerAction.enabled = true;
    lowerAction.setLoop(loop, loop === THREE.LoopRepeat ? Infinity : 1);
    lowerAction.clampWhenFinished = clampWhenFinished;
    lowerAction.setEffectiveTimeScale(timeScale);

    if (this.lowerBodyAction && this.lowerBodyAction !== lowerAction) {
      lowerAction.reset();
      lowerAction.setEffectiveWeight(1.0);
      this.lowerBodyAction.crossFadeTo(lowerAction, fadeDuration, false);
      lowerAction.setEffectiveTimeScale(timeScale);
      lowerAction.play();
    } else if (!lowerAction.isRunning()) {
      lowerAction.reset();
      lowerAction.setEffectiveWeight(1.0);
      if (fadeDuration > 0) lowerAction.fadeIn(fadeDuration);
      lowerAction.play();
    }

    // 2. Upper Body Action setup & crossfade
    upperAction.enabled = true;
    upperAction.setLoop(loop, loop === THREE.LoopRepeat ? Infinity : 1);
    upperAction.clampWhenFinished = clampWhenFinished;
    upperAction.setEffectiveTimeScale(timeScale);

    if (this.upperBodyAction && this.upperBodyAction !== upperAction) {
      upperAction.reset();
      upperAction.setEffectiveWeight(1.0);
      this.upperBodyAction.crossFadeTo(upperAction, fadeDuration, false);
      upperAction.setEffectiveTimeScale(timeScale);
      upperAction.play();
    } else if (!upperAction.isRunning()) {
      upperAction.reset();
      upperAction.setEffectiveWeight(1.0);
      if (fadeDuration > 0) upperAction.fadeIn(fadeDuration);
      upperAction.play();
    }

    // Synchronize time across both layers
    upperAction.time = lowerAction.time;

    this.lowerBodyAction = lowerAction;
    this.upperBodyAction = upperAction;
    this.currentLowerActionName = resolvedName;
    this.currentUpperActionName = resolvedName;
    this.currentActionName = resolvedName;
    this.isUpperBodyOverride = false;

    const fullAction = this.actions.get(resolvedName);
    this.currentAction = fullAction || lowerAction;

    return { upper: upperAction, lower: lowerAction };
  }

  public playUpperBodyAction(
    name: string,
    fadeDuration = 0.18,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopOnce,
    clampWhenFinished = true,
    timeScale = 1.0,
  ): THREE.AnimationAction | null {
    const { upperAction, resolvedName } = this.findActionPair(name);
    if (!upperAction) return null;

    upperAction.enabled = true;
    upperAction.reset();
    upperAction.setLoop(loop, loop === THREE.LoopRepeat ? Infinity : 1);
    upperAction.clampWhenFinished = clampWhenFinished;
    upperAction.setEffectiveTimeScale(timeScale);
    upperAction.setEffectiveWeight(1.0);

    if (this.upperBodyAction && this.upperBodyAction !== upperAction) {
      this.upperBodyAction.crossFadeTo(upperAction, fadeDuration, false);
      upperAction.setEffectiveTimeScale(timeScale);
    } else if (fadeDuration > 0) {
      upperAction.fadeIn(fadeDuration);
    }
    upperAction.play();

    this.upperBodyAction = upperAction;
    this.currentUpperActionName = resolvedName;
    this.isUpperBodyOverride = true;

    return upperAction;
  }

  public playLowerBodyAction(
    name: string,
    fadeDuration = 0.15,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat,
    clampWhenFinished = false,
    timeScale = 1.0,
  ): THREE.AnimationAction | null {
    if (!this.isUpperBodyOverride) {
      return this.playFullBodyAction(name, fadeDuration, loop, clampWhenFinished, timeScale).lower;
    }

    const { lowerAction, resolvedName } = this.findActionPair(name);
    if (!lowerAction) return null;

    lowerAction.enabled = true;
    lowerAction.setLoop(loop, loop === THREE.LoopRepeat ? Infinity : 1);
    lowerAction.clampWhenFinished = clampWhenFinished;
    lowerAction.setEffectiveTimeScale(timeScale);

    if (this.lowerBodyAction && this.lowerBodyAction !== lowerAction) {
      lowerAction.reset();
      lowerAction.setEffectiveWeight(1.0);
      this.lowerBodyAction.crossFadeTo(lowerAction, fadeDuration, false);
      lowerAction.setEffectiveTimeScale(timeScale);
      lowerAction.play();
    } else if (!lowerAction.isRunning()) {
      lowerAction.reset();
      lowerAction.setEffectiveWeight(1.0);
      if (fadeDuration > 0) lowerAction.fadeIn(fadeDuration);
      lowerAction.play();
    }

    this.lowerBodyAction = lowerAction;
    this.currentLowerActionName = resolvedName;

    return lowerAction;
  }

  public clearUpperBodyOverride(fadeDuration = 0.18): void {
    if (!this.isUpperBodyOverride) return;

    const baseName = this.currentLowerActionName || 'idle';
    const { upperAction } = this.findActionPair(baseName);

    if (upperAction && this.upperBodyAction) {
      upperAction.enabled = true;
      upperAction.reset();
      upperAction.setLoop(THREE.LoopRepeat, Infinity);
      upperAction.clampWhenFinished = false;
      upperAction.setEffectiveWeight(1.0);
      if (this.lowerBodyAction) {
        upperAction.timeScale = this.lowerBodyAction.timeScale;
        upperAction.time = this.lowerBodyAction.time;
      }
      this.upperBodyAction.crossFadeTo(upperAction, fadeDuration, false);
      upperAction.play();
      this.upperBodyAction = upperAction;
    }

    this.currentUpperActionName = baseName;
    this.currentActionName = baseName;
    this.isUpperBodyOverride = false;
  }

  public playAction(
    name: string,
    fadeDuration = 0.15,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat,
    clampWhenFinished = false,
    timeScale = 1.0,
  ): THREE.AnimationAction | null {
    if (this.isUpperBodyOverride) {
      return this.playLowerBodyAction(name, fadeDuration, loop, clampWhenFinished, timeScale);
    }
    const res = this.playFullBodyAction(name, fadeDuration, loop, clampWhenFinished, timeScale);
    return res.lower || res.upper;
  }

  public syncNormalizedTime(): void {
    if (!this.isUpperBodyOverride && this.upperBodyAction && this.lowerBodyAction) {
      this.upperBodyAction.time = this.lowerBodyAction.time;
    }
  }
}

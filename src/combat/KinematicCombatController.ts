import * as THREE from 'three';
import {
  getKinematicAction,
  type KinematicActionConfig,
  type KinematicPhaseType,
} from './KinematicData';
import { ModelLoader } from '../utils/ModelLoader';
import { BOSS_CONFIG } from '../entities/boss/BossAI';

export interface KinematicEventCallbacks {
  onFootDust?: (pos: THREE.Vector3, count: number) => void;
  onPeakSparks?: (pos: THREE.Vector3, count: number, isHeavy: boolean) => void;
  onWeaponTrail?: (bone: THREE.Object3D, duration: number) => void;
  onSwingWindowStart?: (swingIndex: number) => void;
  onPeakSwoosh?: (freq: number, duration: number, isHeavy: boolean) => void;
  onPeakImpact?: (isHeavy: boolean) => void;
  onFootstep?: (heavy: boolean) => void;
  onLandingThud?: (heavy: boolean) => void;
  onGroundSlam?: (pos: THREE.Vector3) => void;
}

export class KinematicCombatController {
  public isAttacking = false;
  public isTrailActive = false;
  public activeSwingIndex = -1;
  public currentActionId: string | null = null;
  public currentConfig: KinematicActionConfig | null = null;
  public currentFrame = 1;
  public currentPhase: KinematicPhaseType | 'None' = 'None';

  // Sockets / Bones
  public rightHandBone: THREE.Object3D | null = null;
  public leftFootBone: THREE.Object3D | null = null;
  public rightFootBone: THREE.Object3D | null = null;
  public hipsBone: THREE.Object3D | null = null;
  public activeHitboxBone: THREE.Object3D | null = null;

  // Root Motion extraction
  public pendingRootMotionDelta = new THREE.Vector3();

  // Internals
  public mixer: THREE.AnimationMixer;
  private currentAction: THREE.AnimationAction | null = null;
  private firedTriggers = new Set<string>();
  private prevTime = 0;
  private prevPhase: KinematicPhaseType | 'None' = 'None';
  private callbacks: KinematicEventCallbacks = {};

  constructor(mixer: THREE.AnimationMixer, callbacks?: KinematicEventCallbacks) {
    this.mixer = mixer;
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  public setCallbacks(callbacks: KinematicEventCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Discovers and binds skeleton socket bones from character armature.
   */
  public bindArmature(root: THREE.Object3D): void {
    this.rightHandBone = ModelLoader.findSocketBone(root, [
      'mixamorig:RightHand',
      'mixamorigRightHand',
      'RightHand',
      'Palm.R',
      'PalmR',
      'hand.R',
      'handR',
    ]);

    this.leftFootBone = ModelLoader.findSocketBone(root, [
      'mixamorig:LeftFoot',
      'mixamorigLeftFoot',
      'LeftFoot',
      'foot.L',
      'footL',
    ]);

    this.rightFootBone = ModelLoader.findSocketBone(root, [
      'mixamorig:RightFoot',
      'mixamorigRightFoot',
      'RightFoot',
      'foot.R',
      'footR',
    ]);

    this.hipsBone = ModelLoader.findSocketBone(root, [
      'mixamorig:Hips',
      'mixamorigHips',
      'Hips',
      'hips',
      'Pelvis',
    ]);

    this.activeHitboxBone = this.rightHandBone;
  }

  /**
   * Returns current active hitbox world position.
   */
  public getHitboxWorldPosition(target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    if (this.activeHitboxBone) {
      this.activeHitboxBone.getWorldPosition(target);
      return target;
    }
    return target.set(0, 1.2, 0);
  }

  /**
   * Pre-processes an animation clip: strips root horizontal translation so it plays in-place.
   */
  public stripRootMotion(clip: THREE.AnimationClip): void {
    ModelLoader.stripRootMotion(clip, ['hips', 'mixamorig:Hips', 'mixamorigHips', 'body']);
  }

  /**
   * Plays a kinematic animation action, calculating the exact crossfade duration
   * out of the current action's Recovery phase into next action's Windup phase.
   */
  public playAction(
    actionId: string,
    action: THREE.AnimationAction,
    options?: {
      loop?: THREE.AnimationActionLoopStyles;
      clampWhenFinished?: boolean;
      timeScale?: number;
      fadeDuration?: number;
      skipMixerFade?: boolean;
    },
  ): void {
    const nextConfig = getKinematicAction(actionId) || null;

    // Crossfade calculation: if transitioning out of an action, use its Recovery crossfade duration
    let crossfadeDuration = options?.fadeDuration;
    if (crossfadeDuration === undefined) {
      if (this.currentConfig) {
        crossfadeDuration = this.currentConfig.crossfadeDurationOut;
      } else {
        crossfadeDuration = 0.25;
      }
    }

    if (!options?.skipMixerFade) {
      if (this.currentAction === action && action.isRunning()) {
        action.timeScale = options?.timeScale ?? 1.0;
        return;
      }

      action.reset();
      action.enabled = true;
      action.setLoop(
        options?.loop ?? THREE.LoopRepeat,
        options?.loop === THREE.LoopOnce ? 1 : Infinity,
      );
      action.clampWhenFinished = options?.clampWhenFinished ?? false;
      action.setEffectiveTimeScale(options?.timeScale ?? 1.0);

      if (this.currentAction && this.currentAction !== action) {
        action.setEffectiveWeight(1.0);
        this.currentAction.crossFadeTo(action, crossfadeDuration, false);
      } else {
        action.setEffectiveWeight(1.0);
        if (crossfadeDuration > 0) {
          action.fadeIn(crossfadeDuration);
        }
      }
      action.play();
    }

    this.currentAction = action;
    this.currentActionId = actionId;
    this.currentConfig = nextConfig;
    this.currentFrame = 1;
    this.currentPhase = nextConfig?.phases[0]?.type ?? 'None';
    this.prevPhase = 'None';
    this.prevTime = 0;
    this.firedTriggers.clear();
    this.isAttacking = false;
    this.isTrailActive = false;
    this.activeSwingIndex = -1;

    // Set target hitbox bone (Kick targets LeftFoot, melee attacks target RightHand)
    if (nextConfig?.hitbox?.boneName === 'mixamorig:LeftFoot') {
      this.activeHitboxBone = this.leftFootBone;
    } else {
      this.activeHitboxBone = this.rightHandBone;
    }
  }

  /**
   * Deterministically purges all kinematic state, root motion deltas, triggers, and active sockets.
   */
  public reset(): void {
    this.isAttacking = false;
    this.isTrailActive = false;
    this.activeSwingIndex = -1;
    this.currentAction = null;
    this.currentActionId = null;
    this.currentConfig = null;
    this.currentFrame = 1;
    this.currentPhase = 'None';
    this.prevPhase = 'None';
    this.prevTime = 0;
    this.firedTriggers.clear();
    this.pendingRootMotionDelta.set(0, 0, 0);
    this.activeHitboxBone = this.rightHandBone;
  }

  /**
   * [Purpose]: Advances kinematic frame counts, extracts root motion displacements, activates hitboxes, and fires timed VFX/SFX events.
   * @condition Called every frame at 60Hz while an attack or combat action is actively playing.
   * @param delta,characterFacingRotationY Simulation delta time in seconds, and character yaw angle (radians) for orienting root motion.
   * @returns Updates currentFrame, currentPhase, activeHitboxBone, and accumulates pendingRootMotionDelta.
   */
  public update(_delta: number, characterFacingRotationY = 0): void {
    if (!this.currentAction || !this.currentAction.isRunning()) {
      this.isAttacking = false;
      return;
    }

    const cfg = this.currentConfig;
    const time = this.currentAction.time;

    // Detect loop wrap-around
    const prevAnimTime = time < this.prevTime ? 0 : this.prevTime;
    if (time < this.prevTime) {
      this.firedTriggers.clear();
    }
    this.prevTime = time;

    // Frame calculation (1-indexed @ 60fps)
    const rawFrame = Math.floor(time * 60) + 1;
    this.currentFrame = cfg ? Math.min(cfg.totalFrames, rawFrame) : rawFrame;

    // Determine current phase
    if (cfg) {
      let activePhase: KinematicPhaseType = 'Recovery';
      for (const p of cfg.phases) {
        if (this.currentFrame >= p.startFrame && this.currentFrame <= p.endFrame) {
          activePhase = p.type;
          break;
        }
      }
      this.prevPhase = this.currentPhase;
      this.currentPhase = activePhase;

      // 1. Precise Hitbox Toggle (supports single or multi-swing activeWindows)
      if (cfg.hitbox) {
        const windows = cfg.hitbox.activeWindows ?? [
          { startFrame: cfg.hitbox.activeStartFrame, endFrame: cfg.hitbox.activeEndFrame },
        ];
        const matchedIndex = windows.findIndex(
          (w) => this.currentFrame >= w.startFrame && this.currentFrame <= w.endFrame,
        );
        this.isAttacking = matchedIndex !== -1;
        if (matchedIndex !== -1 && matchedIndex !== this.activeSwingIndex) {
          this.activeSwingIndex = matchedIndex;
          this.callbacks.onSwingWindowStart?.(matchedIndex);
        } else if (matchedIndex === -1) {
          this.activeSwingIndex = -1;
        }
      } else {
        this.isAttacking = false;
        this.activeSwingIndex = -1;
      }

      // 1b. Continuous Blade Trail Window (tracks physical sword swing frames)
      const trailWindows = cfg.vfx.weaponTrailWindows ?? (cfg.vfx.weaponTrailFrames ? [cfg.vfx.weaponTrailFrames] : []);
      this.isTrailActive = trailWindows.some(
        (tw) => this.currentFrame >= tw.startFrame && this.currentFrame <= tw.endFrame,
      );

      // 2. TimeScale-invariant analytical Root Motion Extraction for attack_jump
      // Evaluates cumulative displacement D(animTime) so Phase 1 & Phase 2 travel the exact same distance
      if (cfg.rootMotion.type === 'Root Motion' && cfg.id === 'attack_jump') {
        const forward = new THREE.Vector3(
          -Math.sin(characterFacingRotationY),
          0,
          -Math.cos(characterFacingRotationY),
        ).normalize();

        const deltaDist =
          this.evalJumpDisplacement(time, cfg) - this.evalJumpDisplacement(prevAnimTime, cfg);
        if (deltaDist > 0) {
          this.pendingRootMotionDelta.addScaledVector(forward, deltaDist);
        }
      }

      // 3. VFX Triggers
      this.checkVfxTriggers(cfg);

      // 4. Audio Triggers
      this.checkAudioTriggers(cfg);
    }
  }

  /**
   * Computes deterministic cumulative forward travel (in meters) at clip timestamp animTimeSec
   * for attack_jump, normalized to BOSS_CONFIG.impulses.jump so Phase 1 and Phase 2 match identically.
   */
  private evalJumpDisplacement(animTimeSec: number, cfg: KinematicActionConfig): number {
    const windupPhase = cfg.phases.find((p) => p.type === 'Windup');
    const airbornePhase = cfg.phases.find((p) => p.type === 'Airborne');
    const fps = cfg.fps || 60;

    const runStartT = (15 - 1) / fps;
    const runEndT = windupPhase ? (windupPhase.endFrame - 1) / fps : (55 - 1) / fps;
    const runDur = Math.max(1e-4, runEndT - runStartT);

    const airStartT = airbornePhase ? (airbornePhase.startFrame - 1) / fps : (56 - 1) / fps;
    const airEndT = airbornePhase ? (airbornePhase.endFrame - 1) / fps : (98 - 1) / fps;
    const airDur = Math.max(1e-4, airEndT - airStartT);

    const v0 = BOSS_CONFIG.jumpRunStartSpeed;
    const v1 = BOSS_CONFIG.jumpRunEndSpeed;
    const vAir = BOSS_CONFIG.jumpLeapSpeed;

    const maxRawRun = runDur * 0.5 * (v0 + v1);
    const maxRawAir = airDur * vAir;
    const rawTotal = maxRawRun + maxRawAir;
    const scale = rawTotal > 1e-4 ? BOSS_CONFIG.impulses.jump / rawTotal : 1.0;

    const uRun = THREE.MathUtils.clamp((animTimeSec - runStartT) / runDur, 0, 1);
    const dRun = runDur * (v0 * uRun + 0.5 * (v1 - v0) * uRun * uRun);

    const uAir = THREE.MathUtils.clamp((animTimeSec - airStartT) / airDur, 0, 1);
    const dAir = airDur * vAir * 0.5 * (1 - Math.cos(Math.PI * uAir));

    return (dRun + dAir) * scale;
  }

  /**
   * Consumes and clears any accumulated root motion displacement for this tick.
   */
  public consumeRootMotionDelta(target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    target.copy(this.pendingRootMotionDelta);
    this.pendingRootMotionDelta.set(0, 0, 0);
    return target;
  }

  private checkVfxTriggers(cfg: KinematicActionConfig): void {
    // A. Landing dust triggers (on Airborne -> Impact or Recovery transition)
    const landedThisFrame =
      (this.prevPhase === 'Airborne' && (this.currentPhase === 'Impact' || this.currentPhase === 'Recovery'));

    if (cfg.vfx.landingDustFrames) {
      for (const ldf of cfg.vfx.landingDustFrames) {
        const key = `vfx_dust_${ldf.frame}`;
        if (!this.firedTriggers.has(key) && (this.currentFrame >= ldf.frame || landedThisFrame)) {
          this.firedTriggers.add(key);

          for (const boneName of ldf.bones) {
            const bone = this.getBoneByName(boneName);
            if (bone) {
              const pos = new THREE.Vector3();
              bone.getWorldPosition(pos);
              pos.y = 0; // Dust at ground plane
              this.callbacks.onFootDust?.(pos, 12);
            }
          }
        }
      }
    } else if (landedThisFrame && !this.firedTriggers.has('vfx_dust_airborne_landing')) {
      this.firedTriggers.add('vfx_dust_airborne_landing');
      if (this.leftFootBone) {
        const p = new THREE.Vector3();
        this.leftFootBone.getWorldPosition(p);
        p.y = 0;
        this.callbacks.onFootDust?.(p, 10);
      }
      if (this.rightFootBone) {
        const p = new THREE.Vector3();
        this.rightFootBone.getWorldPosition(p);
        p.y = 0;
        this.callbacks.onFootDust?.(p, 10);
      }
    }

    // B. Peak Velocity Sparks
    if (cfg.vfx.peakSparksFrame) {
      const key = `vfx_sparks_${cfg.vfx.peakSparksFrame}`;
      if (!this.firedTriggers.has(key) && this.currentFrame >= cfg.vfx.peakSparksFrame) {
        this.firedTriggers.add(key);
        const bone = this.getBoneByName(cfg.vfx.peakSparksBone || 'mixamorig:RightHand') || this.rightHandBone;
        if (bone) {
          const pos = new THREE.Vector3();
          bone.getWorldPosition(pos);
          const isHeavy = cfg.hitbox?.peakVelocityMs ? cfg.hitbox.peakVelocityMs > 12.0 : false;
          this.callbacks.onPeakSparks?.(pos, cfg.vfx.peakSparksCount ?? 20, isHeavy);
        }
      }
    }

    // C. Weapon Trail
    if (cfg.vfx.weaponTrailFrames) {
      const { startFrame, endFrame, bone } = cfg.vfx.weaponTrailFrames;
      const key = `vfx_trail_${startFrame}`;
      if (!this.firedTriggers.has(key) && this.currentFrame >= startFrame && this.currentFrame <= endFrame) {
        this.firedTriggers.add(key);
        const trailBone = this.getBoneByName(bone) || this.rightHandBone;
        if (trailBone) {
          const duration = (endFrame - startFrame + 1) / 60;
          this.callbacks.onWeaponTrail?.(trailBone, duration);
        }
      }
    }
  }

  private checkAudioTriggers(cfg: KinematicActionConfig): void {
    // Peak swoosh
    if (cfg.audio.peakSwooshFrame) {
      const key = `audio_swoosh_${cfg.audio.peakSwooshFrame}`;
      if (!this.firedTriggers.has(key) && this.currentFrame >= cfg.audio.peakSwooshFrame) {
        this.firedTriggers.add(key);
        this.callbacks.onPeakSwoosh?.(
          cfg.audio.peakSwooshFreq ?? 380,
          cfg.audio.peakSwooshDuration ?? 0.16,
          cfg.hitbox ? cfg.hitbox.peakVelocityMs > 12 : false,
        );
      }
    }

    // Peak impact
    if (cfg.audio.peakImpactFrame) {
      const key = `audio_impact_${cfg.audio.peakImpactFrame}`;
      if (!this.firedTriggers.has(key) && this.currentFrame >= cfg.audio.peakImpactFrame) {
        this.firedTriggers.add(key);
        this.callbacks.onPeakImpact?.(cfg.audio.peakImpactHeavy ?? false);

        if (cfg.id === 'attack_jump') {
          const slamPos = new THREE.Vector3();
          if (this.rightHandBone) {
            this.rightHandBone.getWorldPosition(slamPos);
          }
          slamPos.y = 0;
          this.callbacks.onGroundSlam?.(slamPos);
        }
      }
    }

    // Footsteps
    if (cfg.audio.footstepFrames) {
      for (const fs of cfg.audio.footstepFrames) {
        const key = `audio_footstep_${fs.frame}_${fs.bone}`;
        if (!this.firedTriggers.has(key) && this.currentFrame >= fs.frame) {
          this.firedTriggers.add(key);
          this.callbacks.onFootstep?.(fs.heavy ?? false);
        }
      }
    }

    // Airborne landing sound (heavy foot landing; sword ground slam SFX triggers at impact frame in onGroundSlam)
    if (
      this.prevPhase === 'Airborne' &&
      (this.currentPhase === 'Impact' || this.currentPhase === 'Recovery') &&
      !this.firedTriggers.has('audio_landing_thud')
    ) {
      this.firedTriggers.add('audio_landing_thud');
      this.callbacks.onLandingThud?.(false);
    }
  }

  private getBoneByName(name: string): THREE.Object3D | null {
    const lower = name.toLowerCase();
    if (lower.includes('hand')) return this.rightHandBone;
    if (lower.includes('leftfoot')) return this.leftFootBone;
    if (lower.includes('rightfoot')) return this.rightFootBone;
    if (lower.includes('hips')) return this.hipsBone;
    return null;
  }
}

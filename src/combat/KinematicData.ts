export type KinematicPhaseType = 'Windup' | 'Airborne' | 'Impact' | 'Recovery';

export interface KinematicPhase {
  type: KinematicPhaseType;
  startFrame: number;
  endFrame: number;
  metrics?: Record<string, unknown>;
}

export interface KinematicHitboxConfig {
  boneName: 'mixamorig:RightHand' | 'mixamorig:LeftFoot';
  activeStartFrame: number;
  activeEndFrame: number;
  activeWindows?: Array<{ startFrame: number; endFrame: number }>;
  peakVelocityFrame: number;
  peakVelocityMs: number;
  peakVelocityBone: string;
}

export interface KinematicVFXConfig {
  landingDustFrames?: Array<{
    frame: number;
    bones: Array<'mixamorig:LeftFoot' | 'mixamorig:RightFoot' | 'mixamorig:Hips' | 'mixamorig:RightHand' | string>;
  }>;
  peakSparksFrame?: number;
  peakSparksBone?: string;
  peakSparksCount?: number;
  weaponTrailFrames?: {
    startFrame: number;
    endFrame: number;
    bone: string;
  };
  weaponTrailWindows?: Array<{
    startFrame: number;
    endFrame: number;
    bone: string;
  }>;
}

export interface KinematicAudioConfig {
  peakSwooshFrame?: number;
  peakSwooshFreq?: number;
  peakSwooshDuration?: number;
  peakImpactFrame?: number;
  peakImpactHeavy?: boolean;
  footstepFrames?: Array<{
    frame: number;
    bone: 'mixamorig:LeftFoot' | 'mixamorig:RightFoot';
    heavy?: boolean;
  }>;
}

export interface KinematicActionConfig {
  id: string;
  fileName: string;
  actionName: string;
  totalFrames: number;
  fps: number;
  duration: number;
  rootMotion: {
    type: 'In-Place' | 'Root Motion';
    deltaY: number;
    deltaX: number;
  };
  phases: KinematicPhase[];
  hitbox?: KinematicHitboxConfig;
  crossfadeDurationOut: number;
  vfx: KinematicVFXConfig;
  audio: KinematicAudioConfig;
}

/**
 * =========================================================================
 * SINGLE SOURCE OF TRUTH: DODGE ROLL TIMING, FRAMES & PHYSICS
 * =========================================================================
 * Change any frame numbers or durations in this object to tune the roll.
 * The entire game (animation player, i-frame collision tests, mesh visualizer,
 * physics travel distance, and HUD telemetry) automatically adapts.
 */
export const DODGE_CONFIG = {
  // Phase 1: Startup (Initial dive commit - vulnerable to hits)
  startupStartFrame: 1,
  startupEndFrame: 32,      
  startupDuration: 0.2,    

  // Phase 2: Active I-Frames (Core invulnerability window - attacks pass through)
  iframeStartFrame: 33,    
  iframeEndFrame: 90,      
  iframeDuration: 0.5,  

  // Phase 3: Recovery (Landing and standing back up - vulnerable, input locked)
  recoveryStartFrame: 91,  
  recoveryEndFrame: 120,   
  recoveryDuration: 0.3,    

  // Physical Traversal & Resource Tuning
  totalDistanceMeters: 2.35,
  staminaCost: 20,     
};

export const KINEMATIC_ACTIONS: Record<string, KinematicActionConfig> = {
  // 1. Great Sword Kick (measured LeftFoot peak 9.5 m/s @ f43, thrust f36..47)
  kick: {
    id: 'kick',
    fileName: 'Great Sword Kick.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 105,
    fps: 60,
    duration: 105 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 35 },
      { type: 'Impact', startFrame: 36, endFrame: 47 },
      { type: 'Recovery', startFrame: 48, endFrame: 105 },
    ],
    hitbox: {
      boneName: 'mixamorig:LeftFoot',
      activeStartFrame: 36,
      activeEndFrame: 47,
      peakVelocityFrame: 43,
      peakVelocityMs: 9.5,
      peakVelocityBone: 'LeftFoot',
    },
    crossfadeDurationOut: 0.20,
    vfx: {
      peakSparksFrame: 43,
      peakSparksBone: 'mixamorig:LeftFoot',
      peakSparksCount: 16,
    },
    audio: {
      peakSwooshFrame: 36,
      peakSwooshFreq: 220,
      peakSwooshDuration: 0.14,
      peakImpactFrame: 43,
      peakImpactHeavy: false,
    },
  },

  // 2. Standing Melee Attack 360 Low heavy attack (measured blade tip peak 87.0 m/s @ f60, sweep f56..64)
  attack_360: {
    id: 'attack_360',
    fileName: 'Standing Melee Attack 360 Low heavy attack.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 150,
    fps: 60,
    duration: 150 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 55 },
      { type: 'Impact', startFrame: 56, endFrame: 64 },
      { type: 'Recovery', startFrame: 65, endFrame: 150 },
    ],
    hitbox: {
      boneName: 'mixamorig:RightHand',
      activeStartFrame: 56,
      activeEndFrame: 64,
      peakVelocityFrame: 60,
      peakVelocityMs: 87.0,
      peakVelocityBone: 'RightHand',
    },
    crossfadeDurationOut: 0.30,
    vfx: {
      peakSparksFrame: 60,
      peakSparksBone: 'mixamorig:RightHand',
      peakSparksCount: 26,
      weaponTrailFrames: { startFrame: 52, endFrame: 65, bone: 'mixamorig:RightHand' },
    },
    audio: {
      peakSwooshFrame: 53,
      peakSwooshFreq: 320,
      peakSwooshDuration: 0.24,
    },
  },

  // 3. Standing Melee Attack Downward (measured blade tip peak 104.3 m/s @ f52, cleave f50..56)
  attack_heavy: {
    id: 'attack_heavy',
    fileName: 'Standing Melee Attack Downward.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 137,
    fps: 60,
    duration: 137 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 49 },
      { type: 'Impact', startFrame: 50, endFrame: 56 },
      { type: 'Recovery', startFrame: 57, endFrame: 137 },
    ],
    hitbox: {
      boneName: 'mixamorig:RightHand',
      activeStartFrame: 50,
      activeEndFrame: 56,
      peakVelocityFrame: 52,
      peakVelocityMs: 104.3,
      peakVelocityBone: 'RightHand',
    },
    crossfadeDurationOut: 0.25,
    vfx: {
      peakSparksFrame: 52,
      peakSparksBone: 'mixamorig:RightHand',
      peakSparksCount: 30,
      weaponTrailFrames: { startFrame: 48, endFrame: 57, bone: 'mixamorig:RightHand' },
      landingDustFrames: [{ frame: 54, bones: ['mixamorig:RightHand'] }], // blade ground impact
    },
    audio: {
      peakSwooshFrame: 49,
      peakSwooshFreq: 450,
      peakSwooshDuration: 0.20,
    },
  },

  // 4. Standing Melee Combo Attack Ver. 2 (measured 3 swings: f55..65, f97..105, f158..164; finisher peak 81.6 m/s @ f159)
  attack_combo: {
    id: 'attack_combo',
    fileName: 'Standing Melee Combo Attack Ver. 2.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 253,
    fps: 60,
    duration: 253 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 54 },
      { type: 'Impact', startFrame: 55, endFrame: 164 },
      { type: 'Recovery', startFrame: 165, endFrame: 253 },
    ],
    hitbox: {
      boneName: 'mixamorig:RightHand',
      activeStartFrame: 158,
      activeEndFrame: 164,
      activeWindows: [
        { startFrame: 55, endFrame: 65 },
        { startFrame: 97, endFrame: 105 },
        { startFrame: 158, endFrame: 164 },
      ],
      peakVelocityFrame: 159,
      peakVelocityMs: 81.6,
      peakVelocityBone: 'RightHand',
    },
    crossfadeDurationOut: 0.35,
    vfx: {
      peakSparksFrame: 159,
      peakSparksBone: 'mixamorig:RightHand',
      peakSparksCount: 38,
      weaponTrailFrames: { startFrame: 156, endFrame: 165, bone: 'mixamorig:RightHand' },
      weaponTrailWindows: [
        { startFrame: 53, endFrame: 66, bone: 'mixamorig:RightHand' },
        { startFrame: 96, endFrame: 106, bone: 'mixamorig:RightHand' },
        { startFrame: 156, endFrame: 165, bone: 'mixamorig:RightHand' },
      ],
    },
    audio: {
      peakSwooshFrame: 55,
      peakSwooshFreq: 480,
      peakSwooshDuration: 0.22,
    },
  },

  // 5. Standing Melee Run Jump Attack (airborne f56..98, feet land f99, blade slam f103..109 peaking 93.3 m/s @ f106)
  attack_jump: {
    id: 'attack_jump',
    fileName: 'Standing Melee Run Jump Attack.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 221,
    fps: 60,
    duration: 221 / 60,
    rootMotion: { type: 'Root Motion', deltaY: -5.9, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 55 },
      { type: 'Airborne', startFrame: 56, endFrame: 98 },
      { type: 'Impact', startFrame: 103, endFrame: 109 },
      { type: 'Recovery', startFrame: 110, endFrame: 221 },
    ],
    hitbox: {
      boneName: 'mixamorig:RightHand',
      activeStartFrame: 103,
      activeEndFrame: 109,
      peakVelocityFrame: 106,
      peakVelocityMs: 93.3,
      peakVelocityBone: 'RightHand',
    },
    crossfadeDurationOut: 0.40,
    vfx: {
      // Landing dust kickup when feet touch down at frame 99
      landingDustFrames: [{ frame: 99, bones: ['mixamorig:LeftFoot', 'mixamorig:RightFoot'] }],
      peakSparksFrame: 106,
      peakSparksBone: 'mixamorig:RightHand',
      peakSparksCount: 46, // highest energy burst
      weaponTrailFrames: { startFrame: 101, endFrame: 109, bone: 'mixamorig:RightHand' },
    },
    audio: {
      peakSwooshFrame: 58, // leap airborne whoosh
      peakSwooshFreq: 260,
      peakSwooshDuration: 0.32,
      peakImpactFrame: 108,
      peakImpactHeavy: true,
      footstepFrames: [{ frame: 99, bone: 'mixamorig:LeftFoot', heavy: true }],
    },
  },

  // 6. Great Sword Impact (Hit Reaction)
  hit: {
    id: 'hit',
    fileName: 'Great Sword Impact.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 76,
    fps: 60,
    duration: 76 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Impact', startFrame: 1, endFrame: 16 },
      { type: 'Recovery', startFrame: 17, endFrame: 76 },
    ],
    crossfadeDurationOut: 0.20,
    vfx: {
      peakSparksFrame: 12,
      peakSparksBone: 'mixamorig:RightHand',
      peakSparksCount: 10,
    },
    audio: {
      peakImpactFrame: 1,
      peakImpactHeavy: false,
    },
  },

  // 7. Stand To Roll (Dodge Roll)
  dodge: {
    id: 'dodge',
    fileName: 'Stand To Roll.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 143,
    fps: 60,
    duration:
      DODGE_CONFIG.startupDuration +
      DODGE_CONFIG.iframeDuration +
      DODGE_CONFIG.recoveryDuration,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      {
        type: 'Windup',
        startFrame: DODGE_CONFIG.startupStartFrame,
        endFrame: DODGE_CONFIG.startupEndFrame,
      },
      {
        type: 'Airborne',
        startFrame: DODGE_CONFIG.iframeStartFrame,
        endFrame: DODGE_CONFIG.iframeEndFrame,
      },
      {
        type: 'Recovery',
        startFrame: DODGE_CONFIG.recoveryStartFrame,
        endFrame: DODGE_CONFIG.recoveryEndFrame,
      },
    ],
    crossfadeDurationOut: 0.20,
    vfx: {
      landingDustFrames: [
        { frame: DODGE_CONFIG.iframeStartFrame, bones: ['mixamorig:Hips'] },
        {
          frame: DODGE_CONFIG.recoveryStartFrame,
          bones: ['mixamorig:LeftFoot', 'mixamorig:RightFoot'],
        },
        { frame: 106, bones: ['mixamorig:LeftFoot'] },
      ],
    },
    audio: {
      peakSwooshFrame: DODGE_CONFIG.iframeStartFrame,
      peakSwooshFreq: 180,
      peakSwooshDuration: 0.24,
      footstepFrames: [
        { frame: DODGE_CONFIG.recoveryStartFrame, bone: 'mixamorig:LeftFoot', heavy: false },
        { frame: 106, bone: 'mixamorig:LeftFoot', heavy: false },
      ],
    },
  },

  // 8. Great Sword Idle
  idle: {
    id: 'idle',
    fileName: 'Great Sword Idle.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 121,
    fps: 60,
    duration: 121 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 61 },
      { type: 'Recovery', startFrame: 62, endFrame: 121 },
    ],
    crossfadeDurationOut: 0.20,
    vfx: {},
    audio: {},
  },

  // 9. Great Sword Light Attack (measured blade tip slash f36..44, peak 53.9 m/s @ f41)
  attack_light: {
    id: 'attack_light',
    fileName: 'Great Sword Light Attack.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 77,
    fps: 60,
    duration: 77 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 35 },
      { type: 'Impact', startFrame: 36, endFrame: 44 },
      { type: 'Recovery', startFrame: 45, endFrame: 77 },
    ],
    hitbox: {
      boneName: 'mixamorig:RightHand',
      activeStartFrame: 36,
      activeEndFrame: 44,
      peakVelocityFrame: 41,
      peakVelocityMs: 53.9,
      peakVelocityBone: 'RightHand',
    },
    crossfadeDurationOut: 0.15,
    vfx: {
      peakSparksFrame: 41,
      peakSparksBone: 'mixamorig:RightHand',
      peakSparksCount: 18,
      weaponTrailFrames: { startFrame: 34, endFrame: 45, bone: 'mixamorig:RightHand' },
    },
    audio: {
      peakSwooshFrame: 35,
      peakSwooshFreq: 420,
      peakSwooshDuration: 0.14,
      peakImpactFrame: 41,
      peakImpactHeavy: false,
    },
  },

  // 10. Great Sword Run
  run: {
    id: 'run',
    fileName: 'Great Sword Run.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 37,
    fps: 60,
    duration: 37 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 10 },
      { type: 'Airborne', startFrame: 11, endFrame: 28 },
      { type: 'Recovery', startFrame: 29, endFrame: 37 },
    ],
    crossfadeDurationOut: 0.20,
    vfx: {
      landingDustFrames: [{ frame: 29, bones: ['mixamorig:RightFoot'] }],
    },
    audio: {
      footstepFrames: [
        { frame: 5, bone: 'mixamorig:LeftFoot', heavy: false },
        { frame: 29, bone: 'mixamorig:RightFoot', heavy: false },
      ],
    },
  },

  // 11. Great Sword Strafe Left
  strafe_left: {
    id: 'strafe_left',
    fileName: 'Great Sword Strafe Left.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 39,
    fps: 60,
    duration: 39 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 10 },
      { type: 'Airborne', startFrame: 11, endFrame: 30 },
      { type: 'Recovery', startFrame: 31, endFrame: 39 },
    ],
    crossfadeDurationOut: 0.15,
    vfx: {
      landingDustFrames: [{ frame: 31, bones: ['mixamorig:LeftFoot'] }],
    },
    audio: {
      footstepFrames: [
        { frame: 10, bone: 'mixamorig:RightFoot', heavy: false },
        { frame: 31, bone: 'mixamorig:LeftFoot', heavy: false },
      ],
    },
  },

  // 12. Great Sword Strafe Right
  strafe_right: {
    id: 'strafe_right',
    fileName: 'Great Sword Strafe right.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 66,
    fps: 60,
    duration: 66 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 17 },
      { type: 'Airborne', startFrame: 18, endFrame: 50 },
      { type: 'Recovery', startFrame: 51, endFrame: 66 },
    ],
    crossfadeDurationOut: 0.15,
    vfx: {
      landingDustFrames: [{ frame: 51, bones: ['mixamorig:RightFoot'] }],
    },
    audio: {
      footstepFrames: [
        { frame: 17, bone: 'mixamorig:LeftFoot', heavy: false },
        { frame: 51, bone: 'mixamorig:RightFoot', heavy: false },
      ],
    },
  },

  // 13. Great Sword Walk Backward
  walk_backward: {
    id: 'walk_backward',
    fileName: 'Great Sword Walk backward.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 78,
    fps: 60,
    duration: 78 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 20 },
      { type: 'Airborne', startFrame: 21, endFrame: 59 },
      { type: 'Recovery', startFrame: 60, endFrame: 78 },
    ],
    crossfadeDurationOut: 0.20,
    vfx: {
      landingDustFrames: [{ frame: 60, bones: ['mixamorig:RightFoot'] }],
    },
    audio: {
      footstepFrames: [
        { frame: 20, bone: 'mixamorig:LeftFoot', heavy: false },
        { frame: 60, bone: 'mixamorig:RightFoot', heavy: false },
      ],
    },
  },

  // 14. Great Sword Walk Forward
  walk: {
    id: 'walk',
    fileName: 'Great Sword Walk forward.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 82,
    fps: 60,
    duration: 82 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 21 },
      { type: 'Airborne', startFrame: 22, endFrame: 62 },
      { type: 'Recovery', startFrame: 63, endFrame: 82 },
    ],
    crossfadeDurationOut: 0.20,
    vfx: {
      landingDustFrames: [{ frame: 63, bones: ['mixamorig:RightFoot'] }],
    },
    audio: {
      footstepFrames: [
        { frame: 21, bone: 'mixamorig:LeftFoot', heavy: false },
        { frame: 63, bone: 'mixamorig:RightFoot', heavy: false },
      ],
    },
  },
};

// Compatibility aliases
KINEMATIC_ACTIONS.walking = KINEMATIC_ACTIONS.walk;

export function toFrame(timeInSeconds: number, fps = 60): number {
  return Math.max(1, Math.floor(timeInSeconds * fps) + 1);
}

export function toTime(frame: number, fps = 60): number {
  return (frame - 1) / fps;
}

/**
 * [Purpose]: Retrieves the kinematic frame data configuration for a given animation clip identifier using exact or fuzzy name matching.
 * @condition Called when starting an attack or action to configure frame windows, root motion, and event triggers.
 * @param clipName Animation clip or action name to query against kinematic action registry.
 * @returns KinematicActionConfig containing frame phases and trigger curves if found, or undefined.
 */
export function getKinematicAction(clipName: string): KinematicActionConfig | undefined {
  if (KINEMATIC_ACTIONS[clipName]) return KINEMATIC_ACTIONS[clipName];
  const lower = clipName.toLowerCase();
  for (const [id, cfg] of Object.entries(KINEMATIC_ACTIONS)) {
    if (
      id === lower ||
      cfg.fileName.toLowerCase().includes(lower) ||
      lower.includes(id)
    ) {
      return cfg;
    }
  }
  return undefined;
}

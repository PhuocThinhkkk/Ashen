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

export const KINEMATIC_ACTIONS: Record<string, KinematicActionConfig> = {
  // 1. Great Sword Kick
  kick: {
    id: 'kick',
    fileName: 'Great Sword Kick.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 105,
    fps: 60,
    duration: 105 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 31 },
      { type: 'Impact', startFrame: 32, endFrame: 48 },
      { type: 'Recovery', startFrame: 49, endFrame: 105 },
    ],
    hitbox: {
      boneName: 'mixamorig:LeftFoot',
      activeStartFrame: 32,
      activeEndFrame: 48,
      peakVelocityFrame: 42,
      peakVelocityMs: 10.6,
      peakVelocityBone: 'LeftFoot',
    },
    crossfadeDurationOut: 0.20,
    vfx: {
      peakSparksFrame: 42,
      peakSparksBone: 'mixamorig:LeftFoot',
      peakSparksCount: 16,
    },
    audio: {
      peakSwooshFrame: 38,
      peakSwooshFreq: 220,
      peakSwooshDuration: 0.12,
      peakImpactFrame: 42,
      peakImpactHeavy: false,
    },
  },

  // 2. Standing Melee Attack 360 Low heavy attack
  attack_360: {
    id: 'attack_360',
    fileName: 'Standing Melee Attack 360 Low heavy attack.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 150,
    fps: 60,
    duration: 150 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 43 },
      { type: 'Impact', startFrame: 44, endFrame: 66 },
      { type: 'Recovery', startFrame: 67, endFrame: 150 },
    ],
    hitbox: {
      boneName: 'mixamorig:RightHand',
      activeStartFrame: 44,
      activeEndFrame: 66,
      peakVelocityFrame: 56,
      peakVelocityMs: 8.2,
      peakVelocityBone: 'RightHand',
    },
    crossfadeDurationOut: 0.30,
    vfx: {
      peakSparksFrame: 56,
      peakSparksBone: 'mixamorig:RightHand',
      peakSparksCount: 26,
      weaponTrailFrames: { startFrame: 44, endFrame: 66, bone: 'mixamorig:RightHand' },
    },
    audio: {
      peakSwooshFrame: 42,
      peakSwooshFreq: 320,
      peakSwooshDuration: 0.22,
      peakImpactFrame: 56,
      peakImpactHeavy: true,
    },
  },

  // 3. Standing Melee Attack Downward
  attack_heavy: {
    id: 'attack_heavy',
    fileName: 'Standing Melee Attack Downward.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 137,
    fps: 60,
    duration: 137 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 38 },
      { type: 'Impact', startFrame: 39, endFrame: 57 },
      { type: 'Recovery', startFrame: 58, endFrame: 137 },
    ],
    hitbox: {
      boneName: 'mixamorig:RightHand',
      activeStartFrame: 39,
      activeEndFrame: 57,
      peakVelocityFrame: 51,
      peakVelocityMs: 9.3,
      peakVelocityBone: 'RightHand',
    },
    crossfadeDurationOut: 0.25,
    vfx: {
      peakSparksFrame: 51,
      peakSparksBone: 'mixamorig:RightHand',
      peakSparksCount: 30,
      weaponTrailFrames: { startFrame: 39, endFrame: 57, bone: 'mixamorig:RightHand' },
      landingDustFrames: [{ frame: 51, bones: ['mixamorig:RightHand'] }], // blade ground impact
    },
    audio: {
      peakSwooshFrame: 39,
      peakSwooshFreq: 450,
      peakSwooshDuration: 0.20,
      peakImpactFrame: 51,
      peakImpactHeavy: true,
    },
  },

  // 4. Standing Melee Combo Attack Ver. 2
  attack_combo: {
    id: 'attack_combo',
    fileName: 'Standing Melee Combo Attack Ver. 2.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 253,
    fps: 60,
    duration: 253 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 147 },
      { type: 'Impact', startFrame: 148, endFrame: 164 },
      { type: 'Recovery', startFrame: 165, endFrame: 253 },
    ],
    hitbox: {
      boneName: 'mixamorig:RightHand',
      activeStartFrame: 148,
      activeEndFrame: 164,
      peakVelocityFrame: 157,
      peakVelocityMs: 13.4,
      peakVelocityBone: 'RightHand',
    },
    crossfadeDurationOut: 0.35,
    vfx: {
      peakSparksFrame: 157,
      peakSparksBone: 'mixamorig:RightHand',
      peakSparksCount: 38,
      weaponTrailFrames: { startFrame: 148, endFrame: 164, bone: 'mixamorig:RightHand' },
    },
    audio: {
      peakSwooshFrame: 146,
      peakSwooshFreq: 520,
      peakSwooshDuration: 0.22,
      peakImpactFrame: 157,
      peakImpactHeavy: true,
    },
  },

  // 5. Standing Melee Run Jump Attack
  attack_jump: {
    id: 'attack_jump',
    fileName: 'Standing Melee Run Jump Attack.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 221,
    fps: 60,
    duration: 221 / 60,
    rootMotion: { type: 'Root Motion', deltaY: -5.9, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 57 },
      { type: 'Airborne', startFrame: 58, endFrame: 95 },
      { type: 'Impact', startFrame: 96, endFrame: 103 },
      { type: 'Recovery', startFrame: 104, endFrame: 221 },
    ],
    hitbox: {
      boneName: 'mixamorig:RightHand',
      activeStartFrame: 96,
      activeEndFrame: 103,
      peakVelocityFrame: 99,
      peakVelocityMs: 23.5,
      peakVelocityBone: 'RightHand',
    },
    crossfadeDurationOut: 0.40,
    vfx: {
      // Landing dust kickup when transitioning from Airborne (58-95) to Impact (96)
      landingDustFrames: [{ frame: 96, bones: ['mixamorig:LeftFoot', 'mixamorig:RightFoot'] }],
      peakSparksFrame: 99,
      peakSparksBone: 'mixamorig:RightHand',
      peakSparksCount: 46, // highest energy burst
      weaponTrailFrames: { startFrame: 96, endFrame: 103, bone: 'mixamorig:RightHand' },
    },
    audio: {
      peakSwooshFrame: 58, // leap airborne whoosh
      peakSwooshFreq: 260,
      peakSwooshDuration: 0.32,
      peakImpactFrame: 99,
      peakImpactHeavy: true,
      footstepFrames: [{ frame: 96, bone: 'mixamorig:LeftFoot', heavy: true }],
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
    duration: 143 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 38 },
      { type: 'Airborne', startFrame: 39, endFrame: 105 },
      { type: 'Recovery', startFrame: 106, endFrame: 143 },
    ],
    crossfadeDurationOut: 0.20,
    vfx: {
      landingDustFrames: [
        { frame: 39, bones: ['mixamorig:Hips'] }, // dive start dust
        { frame: 106, bones: ['mixamorig:LeftFoot', 'mixamorig:RightFoot'] }, // landing standup dust
      ],
    },
    audio: {
      peakSwooshFrame: 39,
      peakSwooshFreq: 180,
      peakSwooshDuration: 0.24,
      footstepFrames: [{ frame: 106, bone: 'mixamorig:LeftFoot', heavy: false }],
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

  // 9. Great Sword Light Attack
  attack_light: {
    id: 'attack_light',
    fileName: 'Great Sword Light Attack.fbx',
    actionName: 'Armature|mixamo.com|Layer0',
    totalFrames: 77,
    fps: 60,
    duration: 77 / 60,
    rootMotion: { type: 'In-Place', deltaY: 0, deltaX: 0 },
    phases: [
      { type: 'Windup', startFrame: 1, endFrame: 26 },
      { type: 'Impact', startFrame: 27, endFrame: 44 },
      { type: 'Recovery', startFrame: 45, endFrame: 77 },
    ],
    hitbox: {
      boneName: 'mixamorig:RightHand',
      activeStartFrame: 27,
      activeEndFrame: 44,
      peakVelocityFrame: 34,
      peakVelocityMs: 10.8,
      peakVelocityBone: 'RightHand',
    },
    crossfadeDurationOut: 0.15,
    vfx: {
      peakSparksFrame: 34,
      peakSparksBone: 'mixamorig:RightHand',
      peakSparksCount: 18,
      weaponTrailFrames: { startFrame: 27, endFrame: 44, bone: 'mixamorig:RightHand' },
    },
    audio: {
      peakSwooshFrame: 26,
      peakSwooshFreq: 420,
      peakSwooshDuration: 0.14,
      peakImpactFrame: 34,
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

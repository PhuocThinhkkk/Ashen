import { DODGE_CONFIG } from './KinematicData';

export interface AttackDefinition {
  name: string;
  startup: number;       // Seconds before damage window
  active: number;        // Damage window duration
  recovery: number;      // Punish window after swing
  damage: number;        // HP damage
  poiseDamage: number;   // Poise damage for staggering
  staminaCost: number;   // Stamina drained from attacker
  range: number;         // Max reach (meters)
  arcAngle: number;      // Swept angle in radians
  forwardImpulse: number;// Lunge distance during active frame
  isHeavy?: boolean;
  animationClip?: string;// Target clip name to play
}

export interface DodgeDefinition {
  duration: number;        // Total roll duration (e.g. 0.52s)
  invulnerableStart: number;// Seconds from roll start when i-frames activate (e.g. 0.05s)
  invulnerableEnd: number;  // Seconds from roll start when i-frames deactivate (e.g. 0.35s)
  speed: number;           // Velocity during roll
  staminaCost: number;     // Stamina cost
}

export const PLAYER_ATTACKS: Record<string, AttackDefinition> = {
  light1: {
    name: 'Slash 1',
    startup: 0.35,
    active: 0.10,
    recovery: 0.33,
    damage: 18,
    poiseDamage: 15,
    staminaCost: 14,
    range: 2.3,
    arcAngle: Math.PI * 0.75,
    forwardImpulse: 1.2,
    animationClip: 'attack_light',
  },
  light2: {
    name: 'Slash 2',
    startup: 0.32,
    active: 0.10,
    recovery: 0.33,
    damage: 22,
    poiseDamage: 18,
    staminaCost: 16,
    range: 2.4,
    arcAngle: Math.PI * 0.8,
    forwardImpulse: 1.5,
    animationClip: 'attack_light',
  },
  light3: {
    name: 'Combo Finisher',
    startup: 0.38,
    active: 0.12,
    recovery: 0.42,
    damage: 34,
    poiseDamage: 30,
    staminaCost: 22,
    range: 2.6,
    arcAngle: Math.PI * 0.9,
    forwardImpulse: 2.0,
    animationClip: 'attack_light',
  },
  heavy: {
    name: 'Sundering Thrust',
    startup: 0.82,
    active: 0.12,
    recovery: 0.44,
    damage: 50,
    poiseDamage: 55,
    staminaCost: 32,
    range: 3.1,
    arcAngle: Math.PI * 0.45,
    forwardImpulse: 3.2,
    isHeavy: true,
    animationClip: 'attack_heavy',
  },
};

export const PLAYER_DODGE: DodgeDefinition = {
  duration:
    DODGE_CONFIG.startupDuration +
    DODGE_CONFIG.iframeDuration +
    DODGE_CONFIG.recoveryDuration,
  invulnerableStart: DODGE_CONFIG.startupDuration,
  invulnerableEnd: DODGE_CONFIG.startupDuration + DODGE_CONFIG.iframeDuration,
  speed:
    (DODGE_CONFIG.totalDistanceMeters * 0.9) /
    ((2 / Math.PI) * DODGE_CONFIG.iframeDuration),
  staminaCost: DODGE_CONFIG.staminaCost,
};

export const BOSS_ATTACKS: Record<string, AttackDefinition> = {
  downward: {
    name: 'Downward Cleave',
    startup: 0.88,
    active: 0.13,
    recovery: 1.44,
    damage: 46,
    poiseDamage: 55,
    staminaCost: 0,
    range: 4.6,
    arcAngle: Math.PI * 0.55,
    forwardImpulse: 0.05,
    isHeavy: true,
    animationClip: 'attack_heavy',
  },
  combo: {
    name: 'Relentless Flurry',
    startup: 0.85,
    active: 1.75,
    recovery: 1.40,
    damage: 32,
    poiseDamage: 35,
    staminaCost: 0,
    range: 4.2,
    arcAngle: Math.PI * 0.85,
    forwardImpulse: 0.45,
    isHeavy: false,
    animationClip: 'attack_combo',
  },
  jump: {
    name: 'Leaping Wrath',
    startup: 1.38,
    active: 0.11,
    recovery: 1.51,
    damage: 52,
    poiseDamage: 65,
    staminaCost: 0,
    range: 6.0,
    arcAngle: Math.PI * 0.65,
    forwardImpulse: 7.0,
    isHeavy: true,
    animationClip: 'attack_jump',
  },
  spin360: {
    name: 'Ashen Maelstrom',
    startup: 0.95,
    active: 0.16,
    recovery: 1.49,
    damage: 38,
    poiseDamage: 45,
    staminaCost: 0,
    range: 5.0,
    arcAngle: Math.PI * 2.0, // Full 360 degree spin
    forwardImpulse: 0.0,
    isHeavy: true,
    animationClip: 'attack_360',
  },
  kick: {
    name: 'Spartan Kick',
    startup: 0.52,
    active: 0.18,
    recovery: 0.85,
    damage: 24,
    poiseDamage: 40,
    staminaCost: 0,
    range: 3.0,
    arcAngle: Math.PI * 0.45,
    forwardImpulse: 0.1,
    isHeavy: false,
    animationClip: 'kick',
  },
};

// Legacy compatibility aliases for existing tests and references
BOSS_ATTACKS.slam = BOSS_ATTACKS.downward;
BOSS_ATTACKS.sweep = BOSS_ATTACKS.spin360;
BOSS_ATTACKS.rush = BOSS_ATTACKS.jump;

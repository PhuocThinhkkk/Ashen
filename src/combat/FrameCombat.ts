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
    startup: 0.14,
    active: 0.16,
    recovery: 0.28,
    damage: 18,
    poiseDamage: 15,
    staminaCost: 14,
    range: 2.3,
    arcAngle: Math.PI * 0.75,
    forwardImpulse: 1.2,
  },
  light2: {
    name: 'Slash 2',
    startup: 0.12,
    active: 0.16,
    recovery: 0.30,
    damage: 22,
    poiseDamage: 18,
    staminaCost: 16,
    range: 2.4,
    arcAngle: Math.PI * 0.8,
    forwardImpulse: 1.5,
  },
  light3: {
    name: 'Combo Finisher',
    startup: 0.18,
    active: 0.20,
    recovery: 0.42,
    damage: 34,
    poiseDamage: 30,
    staminaCost: 22,
    range: 2.6,
    arcAngle: Math.PI * 0.9,
    forwardImpulse: 2.0,
  },
  heavy: {
    name: 'Sundering Thrust',
    startup: 0.42,
    active: 0.22,
    recovery: 0.55,
    damage: 50,
    poiseDamage: 55,
    staminaCost: 32,
    range: 3.1,
    arcAngle: Math.PI * 0.45,
    forwardImpulse: 3.2,
    isHeavy: true,
  },
};

export const PLAYER_DODGE: DodgeDefinition = {
  duration: 0.50,
  invulnerableStart: 0.04,
  invulnerableEnd: 0.44, // 400ms of solid invincibility window
  speed: 9.8,
  staminaCost: 20,
};

export const BOSS_ATTACKS: Record<string, AttackDefinition> = {
  sweep: {
    name: 'Ashen Cleave',
    startup: 0.85,  // Readable telegraph: boss raises huge blade
    active: 0.24,   // Swift horizontal arc
    recovery: 1.15, // Clear punish window!
    damage: 28,
    poiseDamage: 35,
    staminaCost: 0,
    range: 4.2,
    arcAngle: Math.PI * 0.95,
    forwardImpulse: 1.8,
  },
  slam: {
    name: 'Sundering Smite',
    startup: 1.15,  // Dramatic overhead telegraph
    active: 0.20,   // Ground crunch
    recovery: 1.40, // Extended punish window!
    damage: 44,
    poiseDamage: 60,
    staminaCost: 0,
    range: 4.8,
    arcAngle: Math.PI * 0.5,
    forwardImpulse: 3.0,
    isHeavy: true,
  },
  rush: {
    name: 'Ash Lunge',
    startup: 0.70,  // Stance drop
    active: 0.25,   // Rapid thrust
    recovery: 1.05,
    damage: 32,
    poiseDamage: 40,
    staminaCost: 0,
    range: 5.6,
    arcAngle: Math.PI * 0.4,
    forwardImpulse: 6.5,
  },
};

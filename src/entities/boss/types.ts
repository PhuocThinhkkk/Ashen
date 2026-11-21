import * as THREE from 'three';
import { type AttackDefinition } from '../../combat/FrameCombat';
import type { KinematicCombatController } from '../../combat/KinematicCombatController';
import type { AudioSystem } from '../../systems/AudioSystem';
import type { VFXSystem } from '../../systems/VFXSystem';

export type BossState =
  | 'idle'
  | 'approach'
  | 'windup'
  | 'active'
  | 'recovery'
  | 'stagger'
  | 'phaseTransition'
  | 'dead';

export type BossSubgoalType = 'STRAFE_INSPECT' | 'APPROACH' | 'ATTACK' | 'COMBO_CHECK';

export interface BossSubgoal {
  type: BossSubgoalType;
  duration?: number;
  timer?: number;
  attack?: AttackDefinition;
  strafeDir?: 1 | -1;
  preferredDistance?: number;
  maxDistance?: number;
}

export interface PlayerCombatSnapshot {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  isHealing: boolean;
  isAttacking: boolean;
  isStaggered: boolean;
}

export interface IBossAIHost {
  state: BossState;
  stateTimer: number;
  attackTimer: number;
  currentAttack: AttackDefinition | null;
  hasHitCurrentSwing: boolean;
  hasSpawnedSlashArc: boolean;
  hasTriggeredGroundSlam: boolean;
  telegraphGlow: number;
  isPhase2: boolean;
  group: THREE.Group;
  rawClips: THREE.AnimationClip[];
  kinematicController: KinematicCombatController | null;
  audioSystem: AudioSystem | null;
  vfxSystem: VFXSystem | null;

  distanceTo(target: THREE.Vector3): number;
  faceTarget(target: THREE.Vector3, maxTurnRate: number, dt: number): void;
  updateLocomotionWeights(dt: number, forwardVel: number, lateralVel: number): void;
  startAttackAction(clipName: string, timeScale?: number): void;
  endAttackAction(): void;
  triggerGroundSlamShockwave(position: THREE.Vector3): void;
}

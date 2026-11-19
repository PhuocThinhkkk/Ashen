import * as THREE from 'three';

export interface CombatInputs {
  move: THREE.Vector2;
  sprint: boolean;
  dodge: boolean;
  lightAttack: boolean;
  heavyAttack: boolean;
  toggleLockOn: boolean;
  restart: boolean;
  heal?: boolean;
  jump?: boolean;
}

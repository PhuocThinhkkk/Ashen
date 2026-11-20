import * as THREE from 'three';

export interface WeaponSocketTransform {
  posX: number;
  posY: number;
  posZ: number;
  rotX: number; // degrees
  rotY: number; // degrees
  rotZ: number; // degrees
  scale: number;
}


export const DEFAULT_PLAYER_WEAPON_SOCKET: WeaponSocketTransform = {
  posX: 60,
  posY: 44.5,
  posZ: 6.8,
  rotX: -90,
  rotY: 72,
  rotZ: -27,
  scale: 105,
};

export const DEFAULT_BOSS_WEAPON_SOCKET: WeaponSocketTransform = {
  posX: -16.1,
  posY: 13.9,
  posZ: 7.4,
  rotX: -27,
  rotY: -1,
  rotZ: -78,
  scale: 160,
};

export const DEFAULT_PLAYER_POTION_SOCKET: WeaponSocketTransform = {
  posX: 3.5,
  posY: 11.2,
  posZ: -1.0,
  rotX: -85,
  rotY: 10,
  rotZ: 15,
  scale: 18.0,
};

export function loadSocketConfig(key: string, fallback: WeaponSocketTransform): WeaponSocketTransform {
  try {
    const raw = localStorage.getItem(`weapon_socket_${key}`);
    if (raw) {
      return { ...fallback, ...JSON.parse(raw) };
    }
  } catch {
    // Ignore storage errors
  }
  return { ...fallback };
}

export function saveSocketConfig(key: string, cfg: WeaponSocketTransform): void {
  try {
    localStorage.setItem(`weapon_socket_${key}`, JSON.stringify(cfg));
  } catch {
    // Ignore storage errors
  }
}

export function applyWeaponSocketTransform(obj: THREE.Object3D, cfg: WeaponSocketTransform): void {
  obj.position.set(cfg.posX, cfg.posY, cfg.posZ);
  obj.rotation.set(
    THREE.MathUtils.degToRad(cfg.rotX),
    THREE.MathUtils.degToRad(cfg.rotY),
    THREE.MathUtils.degToRad(cfg.rotZ)
  );
  obj.scale.setScalar(cfg.scale);
  obj.updateMatrixWorld(true);
}


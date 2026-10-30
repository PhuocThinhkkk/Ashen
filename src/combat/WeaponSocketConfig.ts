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
  posX: -14.3,
  posY: 21.5,
  posZ: 10.1,
  rotX: 180,
  rotY: -15,
  rotZ: -112,
  scale: 39,
};

export const DEFAULT_BOSS_WEAPON_SOCKET: WeaponSocketTransform = {
  posX: 30.5,
  posY: 33.5,
  posZ: 4.5,
  rotX: -94,
  rotY: -19,
  rotZ: -90,
  scale: 100,
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


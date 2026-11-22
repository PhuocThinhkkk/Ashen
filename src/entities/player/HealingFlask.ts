import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getAssetUrl } from '../../utils/assetPath';
import {
  DEFAULT_PLAYER_POTION_SOCKET,
  loadSocketConfig,
  applyWeaponSocketTransform,
} from '../../combat/WeaponSocketConfig';

/**
 * Loads the 3D health potion model from assets/items/health_potions.glb,
 * configuring socket transforms and enabling shadows.
 * Falls back to the procedural glass flask if unavailable.
 */
export async function loadHealingFlaskMesh(loader: GLTFLoader): Promise<THREE.Group> {
  try {
    const gltf = await loader.loadAsync(getAssetUrl('assets/items/health_potions.glb'));
    const flaskGroup = new THREE.Group();
    flaskGroup.name = 'HealthPotion';

    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    flaskGroup.add(gltf.scene);

    // Apply socket transform from config
    const socketCfg = loadSocketConfig('player_potion', DEFAULT_PLAYER_POTION_SOCKET);
    applyWeaponSocketTransform(flaskGroup, socketCfg);
    flaskGroup.visible = false;

    return flaskGroup;
  } catch (err) {
    console.warn('[HealingFlask] Failed to load health_potions.glb, using procedural fallback:', err);
    return createHealingFlaskMesh();
  }
}

/**
 * Creates a procedural estus-style glass healing flask mesh
 * that can be attached to the player's left hand socket as a fallback.
 */
export function createHealingFlaskMesh(): THREE.Group {
  const flaskGroup = new THREE.Group();
  flaskGroup.name = 'HealingFlask';

  // Outer bottle glass
  const bottleGeo = new THREE.CylinderGeometry(0.04, 0.07, 0.22, 16);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xcc8822,
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.75,
  });
  const bottleMesh = new THREE.Mesh(bottleGeo, glassMat);
  bottleMesh.position.y = 0.08;
  flaskGroup.add(bottleMesh);

  // Glowing liquid inside
  const liquidGeo = new THREE.CylinderGeometry(0.035, 0.065, 0.16, 16);
  const liquidMat = new THREE.MeshStandardMaterial({
    color: 0xff6600,
    emissive: 0xffaa00,
    emissiveIntensity: 0.9,
    roughness: 0.3,
  });
  const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
  liquidMesh.position.y = 0.06;
  flaskGroup.add(liquidMesh);

  // Cork stopper
  const corkGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.05, 12);
  const corkMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.8,
  });
  const corkMesh = new THREE.Mesh(corkGeo, corkMat);
  corkMesh.position.y = 0.2;
  flaskGroup.add(corkMesh);

  // Hand socket relative orientation
  flaskGroup.position.set(0.05, 0.05, 0);
  flaskGroup.rotation.set(0, 0, Math.PI / 2);
  flaskGroup.scale.setScalar(0.85);
  flaskGroup.visible = false;

  return flaskGroup;
}

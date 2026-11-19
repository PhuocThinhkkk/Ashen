import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { WeaponBladeSegment } from '../../combat/WeaponCollisionSystem';

export class BossWeapon {
  public readonly greatswordGroup = new THREE.Group();
  public swordObject: THREE.Object3D | null = null;
  public bladeMesh: THREE.Mesh | null = null;
  public readonly bladeHitbox = new THREE.Object3D();
  public readonly bladeBaseLocator = new THREE.Object3D();
  public readonly bladeTipLocator = new THREE.Object3D();
  public bladeMaterial: THREE.MeshStandardMaterial;
  public readonly defaultBladeColor = new THREE.Color(0xffffff);

  private readonly loader = new GLTFLoader();

  constructor() {
    this.bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
    });
    this.defaultBladeColor.copy(this.bladeMaterial.color);

    // Collision hitbox and blade locators
    this.bladeHitbox.name = 'BossBladeHitbox';
    this.bladeHitbox.position.set(0, 1.05, 0);
    this.greatswordGroup.add(this.bladeHitbox);

    this.bladeBaseLocator.name = 'BossBladeBase';
    this.bladeBaseLocator.position.set(0, 0.35, 0);
    this.greatswordGroup.add(this.bladeBaseLocator);

    this.bladeTipLocator.name = 'BossBladeTip';
    this.bladeTipLocator.position.set(0, 1.7, 0);
    this.greatswordGroup.add(this.bladeTipLocator);
  }

  public async ensureLoaded(): Promise<void> {
    if (this.swordObject) return;

    const gltf = await this.loader.loadAsync('/assets/weapons/lower_orc_great_sword.glb');
    this.swordObject = gltf.scene;
    // Align grip to weapon origin (Y=0.7 shifts local grip at ~-0.65 to around hand level)
    this.swordObject.position.set(0, 0.7, 0);

    this.swordObject.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        this.bladeMesh = obj;
        if (obj.material) {
          const mat = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as THREE.MeshStandardMaterial;
          if (mat) {
            this.bladeMaterial = mat;
            this.defaultBladeColor.copy(mat.color);
          }
        }
      }
    });

    this.greatswordGroup.add(this.swordObject);
  }

  public getBladeHitboxWorldPosition(target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    this.bladeHitbox.updateMatrixWorld(true);
    return this.bladeHitbox.getWorldPosition(target);
  }

  public getWeaponBladeSegment(
    groupPos: THREE.Vector3,
    groupRotationY: number,
    outBase = new THREE.Vector3(),
    outTip = new THREE.Vector3(),
  ): WeaponBladeSegment {
    if (this.bladeBaseLocator.parent && this.bladeTipLocator.parent) {
      this.bladeBaseLocator.updateMatrixWorld(true);
      this.bladeTipLocator.updateMatrixWorld(true);
      this.bladeBaseLocator.getWorldPosition(outBase);
      this.bladeTipLocator.getWorldPosition(outTip);
      return { base: outBase, tip: outTip, radius: 0.22 };
    }
    const fwd = new THREE.Vector3(
      -Math.sin(groupRotationY),
      0,
      -Math.cos(groupRotationY),
    );
    outBase.copy(groupPos).add(new THREE.Vector3(0, 1.2, 0));
    outTip.copy(outBase).addScaledVector(fwd, 2.5);
    return { base: outBase, tip: outTip, radius: 0.22 };
  }

  public resetMaterialColor(): void {
    this.bladeMaterial.color.copy(this.defaultBladeColor);
  }

  public dispose(): void {
    if (this.greatswordGroup.parent) {
      this.greatswordGroup.parent.remove(this.greatswordGroup);
    }
    if (this.swordObject) {
      this.swordObject.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
      this.swordObject = null;
    }
    this.greatswordGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
    this.bladeMaterial.dispose();
  }
}

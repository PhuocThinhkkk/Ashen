import * as THREE from 'three';

export class ModelRigLoader {
  public static hideHelperMeshes(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const lower = obj.name.toLowerCase();
      if (
        lower.includes('icosphere') ||
        lower.includes('cylinder') ||
        lower.includes('hand_shape') ||
        lower.includes('plane')
      ) {
        obj.visible = false;
      }
      if (obj instanceof THREE.Mesh) {
        if (
          lower.includes('icosphere') ||
          lower.includes('cylinder') ||
          lower.includes('hand_shape') ||
          lower.includes('plane')
        ) {
          obj.visible = false;
        } else {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      }
    });
  }

  public static findBoneByName(root: THREE.Object3D, possibleNames: string[]): THREE.Bone | null {
    let found: THREE.Bone | null = null;
    root.traverse((child) => {
      if (found) return;
      if (child instanceof THREE.Bone) {
        for (const name of possibleNames) {
          if (child.name.toLowerCase() === name.toLowerCase()) {
            found = child;
            return;
          }
        }
      }
    });
    return found;
  }
}

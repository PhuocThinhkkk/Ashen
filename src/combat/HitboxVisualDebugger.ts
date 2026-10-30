import * as THREE from 'three';

export interface HitboxVolumeConfig {
  size: THREE.Vector3;
  offset: THREE.Vector3;
  colorInactive?: number;
  colorActive?: number;
}

export class HitboxVisualDebugger {
  public readonly group = new THREE.Group();
  public isVisible = false;

  private lineMesh: THREE.LineSegments;
  private fillMesh: THREE.Mesh;
  private lineMaterial: THREE.LineBasicMaterial;
  private fillMaterial: THREE.MeshBasicMaterial;

  private readonly colorInactive: THREE.Color;
  private readonly colorActive: THREE.Color;
  private currentAttachedBone: THREE.Object3D | null = null;

  constructor(config: HitboxVolumeConfig) {
    this.colorInactive = new THREE.Color(config.colorInactive ?? 0x00ff88);
    this.colorActive = new THREE.Color(config.colorActive ?? 0xff2222);

    const boxGeo = new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    // 1. Crisp wireframe edges (12 outer bounding lines without diagonal clutter)
    this.lineMaterial = new THREE.LineBasicMaterial({
      color: this.colorInactive,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
    });
    this.lineMesh = new THREE.LineSegments(edgesGeo, this.lineMaterial);
    this.lineMesh.position.copy(config.offset);
    this.lineMesh.renderOrder = 999;

    // 2. Translucent volume body
    this.fillMaterial = new THREE.MeshBasicMaterial({
      color: this.colorInactive,
      transparent: true,
      opacity: 0.12,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.fillMesh = new THREE.Mesh(boxGeo, this.fillMaterial);
    this.fillMesh.position.copy(config.offset);
    this.fillMesh.renderOrder = 998;

    this.group.name = 'HitboxVisualDebugger';
    this.group.add(this.lineMesh);
    this.group.add(this.fillMesh);
    this.group.visible = false;
  }

  /**
   * Attaches this hitbox visualizer directly to a bone node.
   * Because THREE.Bone is an Object3D in the skeleton hierarchy,
   * child objects automatically follow the bone's world transform every tick.
   */
  public attachToBone(bone: THREE.Object3D): void {
    if (this.currentAttachedBone === bone && this.group.parent === bone) {
      return;
    }
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.currentAttachedBone = bone;
    bone.add(this.group);
  }

  /**
   * Updates visual color state based on whether the hitbox is actively dealing damage.
   * Inactive / Windup / Recovery: Semi-transparent green
   * Active Impact Phase: Bright red
   */
  public update(isAttacking: boolean): void {
    if (!this.isVisible) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;
    const targetColor = isAttacking ? this.colorActive : this.colorInactive;
    const lineOpacity = isAttacking ? 1.0 : 0.45;
    const fillOpacity = isAttacking ? 0.45 : 0.12;

    this.lineMaterial.color.copy(targetColor);
    this.lineMaterial.opacity = lineOpacity;
    this.fillMaterial.color.copy(targetColor);
    this.fillMaterial.opacity = fillOpacity;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.group.visible = visible;
  }

  public toggle(): boolean {
    this.setVisible(!this.isVisible);
    return this.isVisible;
  }

  public dispose(): void {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.lineMesh.geometry.dispose();
    this.lineMaterial.dispose();
    this.fillMesh.geometry.dispose();
    this.fillMaterial.dispose();
  }
}

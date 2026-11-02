import * as THREE from 'three';
import type { WeaponBladeSegment } from './WeaponCollisionSystem';

export class WeaponHitboxVisualizer {
  public readonly group = new THREE.Group();
  public isVisible = false;

  private readonly lineGeometry = new THREE.BufferGeometry();
  private readonly lineMaterial: THREE.LineBasicMaterial;
  private readonly lineMesh: THREE.Line;

  private readonly boxMesh: THREE.LineSegments;
  private readonly boxMaterial: THREE.LineBasicMaterial;

  private readonly contactSphere: THREE.Mesh;
  private contactTimer = 0;

  // Yellow debug colors
  private static readonly COLOR_INACTIVE = 0xbbaa00; // subtle yellow
  private static readonly COLOR_ACTIVE = 0xffff00;   // bright vivid yellow
  private static readonly COLOR_CONTACT = 0xffea00;  // golden yellow

  constructor(bladeLength = 1.8, bladeRadius = 0.18) {
    this.group.name = 'WeaponHitboxVisualizer';

    // 1. Centerline from base to tip (Yellow)
    this.lineMaterial = new THREE.LineBasicMaterial({
      color: WeaponHitboxVisualizer.COLOR_INACTIVE,
      linewidth: 3,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    this.lineMesh = new THREE.Line(this.lineGeometry, this.lineMaterial);
    this.lineMesh.renderOrder = 999;
    this.group.add(this.lineMesh);

    // 2. Yellow Wireframe Box wrapping the blade
    const boxGeo = new THREE.BoxGeometry(bladeRadius * 2, bladeLength, bladeRadius * 2);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    this.boxMaterial = new THREE.LineBasicMaterial({
      color: WeaponHitboxVisualizer.COLOR_INACTIVE,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
    });
    this.boxMesh = new THREE.LineSegments(edgesGeo, this.boxMaterial);
    this.boxMesh.position.y = bladeLength / 2;
    this.boxMesh.renderOrder = 998;
    this.group.add(this.boxMesh);

    // 3. Contact Point Indicator Sphere
    const sphereGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: WeaponHitboxVisualizer.COLOR_CONTACT,
      wireframe: true,
      depthTest: false,
    });
    this.contactSphere = new THREE.Mesh(sphereGeo, sphereMat);
    this.contactSphere.visible = false;
    this.contactSphere.renderOrder = 1000;
    this.group.add(this.contactSphere);

    this.group.visible = false;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.group.visible = visible;
  }

  public update(blade: WeaponBladeSegment, isAttacking: boolean, delta = 0.016): void {
    if (!this.isVisible) return;

    // Update center line in world coordinates
    const points = [blade.base, blade.tip];
    this.lineGeometry.setFromPoints(points);

    // Color: bright yellow if attacking, subtle yellow if inactive
    const color = isAttacking
      ? WeaponHitboxVisualizer.COLOR_ACTIVE
      : WeaponHitboxVisualizer.COLOR_INACTIVE;

    this.lineMaterial.color.setHex(color);
    this.boxMaterial.color.setHex(color);

    // Update contact point decay
    if (this.contactTimer > 0) {
      this.contactTimer -= delta;
      if (this.contactTimer <= 0) {
        this.contactSphere.visible = false;
      }
    }
  }

  public showContactPoint(point: THREE.Vector3): void {
    this.contactSphere.position.copy(point);
    this.contactSphere.visible = this.isVisible;
    this.contactTimer = 0.25; // Visible for 250ms
  }
}

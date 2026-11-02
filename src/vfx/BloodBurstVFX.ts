import * as THREE from 'three';
import {
  BatchedRenderer,
  ParticleSystem,
  ConeEmitter,
  IntervalValue,
  ConstantValue,
  ConstantColor,
  ColorOverLife,
  Gradient,
  ApplyForce,
  RenderMode,
  Vector3,
  Vector4,
} from 'three.quarks';

export class BloodBurstVFX {
  private pool: ParticleSystem[] = [];
  private poolSize = 6;
  private currentIndex = 0;
  private texture: THREE.Texture;

  constructor(batchRenderer: BatchedRenderer) {
    this.texture = this.createBloodTexture();
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    for (let i = 0; i < this.poolSize; i++) {
      const cone = new ConeEmitter({
        radius: 0.08,
        angle: 0.38, // ~22 degrees spread
      });

      // Visceral blood gradient: dark crimson with alpha fading quickly to 0
      const colorGradient = new Gradient(
        [
          [new Vector3(0.55, 0.03, 0.03), 0],
          [new Vector3(0.12, 0.01, 0.01), 1],
        ],
        [
          [0.95, 0],
          [0.0, 1],
        ],
      );
      const colorRamp = new ColorOverLife(colorGradient);

      const gravity = new ApplyForce(
        new Vector3(0, -1, 0),
        new ConstantValue(7.5),
      );

      const ps = new ParticleSystem({
        duration: 0.5,
        looping: false,
        startLife: new IntervalValue(0.2, 0.38),
        startSpeed: new IntervalValue(8.0, 16.0),
        startSize: new IntervalValue(0.12, 0.28),
        startColor: new ConstantColor(new Vector4(0.55, 0.03, 0.03, 0.95)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new IntervalValue(35, 50),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: cone,
        material,
        renderMode: RenderMode.StretchedBillBoard,
        speedFactor: 0.14,
        worldSpace: true,
        behaviors: [colorRamp, gravity],
      });

      batchRenderer.addSystem(ps);
      this.pool.push(ps);
    }
  }

  /**
   * Emits a visceral directional blood splatter burst away from the hit vector.
   */
  public emit(contactPoint: THREE.Vector3, hitDirection: THREE.Vector3, isHeavy = false): void {
    const ps = this.pool[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.poolSize;

    // Position emitter at collision contact point
    ps.emitter.position.copy(contactPoint);

    // Orient emitter cone pointing away from hit vector (along impact normal)
    const forwardZ = new THREE.Vector3(0, 0, 1);
    const targetDir = hitDirection.clone().normalize();
    // Add a slight upward bias like visceral arterial spray
    targetDir.y = Math.max(0.18, targetDir.y + 0.22);
    targetDir.normalize();

    ps.emitter.quaternion.setFromUnitVectors(forwardZ, targetDir);

    if (isHeavy) {
      ps.emitter.scale.set(1.4, 1.4, 1.4);
    } else {
      ps.emitter.scale.set(1.0, 1.0, 1.0);
    }

    ps.restart();
  }

  private createBloodTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      const data = new Uint8Array([160, 10, 10, 255]);
      return new THREE.DataTexture(data, 1, 1);
    }

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Droplet / splatter streak shape
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(160, 10, 10, 1.0)');
    grad.addColorStop(0.35, 'rgba(100, 5, 5, 0.85)');
    grad.addColorStop(0.7, 'rgba(60, 2, 2, 0.45)');
    grad.addColorStop(1, 'rgba(30, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  public dispose(): void {
    this.texture.dispose();
  }
}

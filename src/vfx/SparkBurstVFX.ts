import * as THREE from 'three';
import {
  BatchedRenderer,
  ParticleSystem,
  ConeEmitter,
  SphereEmitter,
  IntervalValue,
  ConstantValue,
  ConstantColor,
  ColorOverLife,
  Gradient,
  SizeOverLife,
  SpeedOverLife,
  ApplyForce,
  PiecewiseBezier,
  Bezier,
  RenderMode,
  Vector3,
  Vector4,
} from 'three.quarks';
import { VFXTextureFactory } from './VFXTextureFactory';

interface CompositeSparkBurst {
  sparkPs: ParticleSystem;
  emberPs: ParticleSystem;
}

/**
 * Pure three.quarks GPU particle system for metallic impact sparks and lingering embers.
 * Layer 1: Directional incandescent needle sparks (StretchedBillBoard + drag + gravity)
 * Layer 2: Lingering dark fantasy embers (BillBoard + thermal drift + cool-down fade)
 */
export class SparkBurstVFX {
  private pool: CompositeSparkBurst[] = [];
  private readonly poolSize = 8;
  private currentIndex = 0;
  private batchRenderer: BatchedRenderer;
  private emitterContainer: THREE.Object3D;

  private sparkMaterial: THREE.MeshBasicMaterial;
  private emberMaterial: THREE.MeshBasicMaterial;

  constructor(batchRenderer: BatchedRenderer, sceneOrContainer?: THREE.Object3D) {
    this.batchRenderer = batchRenderer;
    this.emitterContainer = sceneOrContainer || batchRenderer;
    const texFactory = VFXTextureFactory.getInstance();

    this.sparkMaterial = new THREE.MeshBasicMaterial({
      map: texFactory.getSparkStreakTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.emberMaterial = new THREE.MeshBasicMaterial({
      map: texFactory.getSparkStreakTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    for (let i = 0; i < this.poolSize; i++) {
      // 1. High-speed needle sparks
      const sparkCone = new ConeEmitter({
        radius: 0.02,
        angle: 0.42, // ~24 deg spread cone
      });

      const sparkGradient = new Gradient(
        [
          [new Vector3(1.0, 1.0, 0.95), 0],
          [new Vector3(1.0, 0.65, 0.15), 0.45],
          [new Vector3(0.55, 0.12, 0.02), 1.0],
        ],
        [
          [1.0, 0],
          [0.90, 0.7],
          [0.0, 1],
        ],
      );
      const sparkColor = new ColorOverLife(sparkGradient);
      const sparkGravity = new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.8));
      const sparkDrag = new SpeedOverLife(
        new PiecewiseBezier([[new Bezier(1.0, 0.65, 0.25, 0.08), 0]]),
      );

      const sparkPs = new ParticleSystem({
        duration: 0.35,
        looping: false,
        startLife: new IntervalValue(0.14, 0.28),
        startSpeed: new IntervalValue(10.0, 20.0),
        startSize: new IntervalValue(0.10, 0.22),
        startColor: new ConstantColor(new Vector4(1.0, 1.0, 0.95, 1.0)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new IntervalValue(30, 48),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: sparkCone,
        material: this.sparkMaterial,
        renderMode: RenderMode.StretchedBillBoard,
        speedFactor: 0.20,
        worldSpace: true,
        behaviors: [sparkColor, sparkGravity, sparkDrag],
      });

      // 2. Lingering smoldering embers
      const emberSphere = new SphereEmitter({
        radius: 0.15,
      });

      const emberGradient = new Gradient(
        [
          [new Vector3(1.0, 0.55, 0.10), 0],
          [new Vector3(0.45, 0.08, 0.01), 1],
        ],
        [
          [0.95, 0],
          [0.0, 1],
        ],
      );
      const emberColor = new ColorOverLife(emberGradient);
      const emberSize = new SizeOverLife(
        new PiecewiseBezier([[new Bezier(1.0, 0.8, 0.4, 0.1), 0]]),
      );
      const emberDrift = new ApplyForce(new Vector3(0, 1, 0), new ConstantValue(0.8));

      const emberPs = new ParticleSystem({
        duration: 1.2,
        looping: false,
        startLife: new IntervalValue(0.55, 1.1),
        startSpeed: new IntervalValue(0.8, 2.2),
        startSize: new IntervalValue(0.06, 0.12),
        startColor: new ConstantColor(new Vector4(1.0, 0.55, 0.10, 0.95)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new IntervalValue(8, 14),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: emberSphere,
        material: this.emberMaterial,
        renderMode: RenderMode.BillBoard,
        worldSpace: true,
        behaviors: [emberColor, emberSize, emberDrift],
      });

      this.batchRenderer.addSystem(sparkPs);
      this.batchRenderer.addSystem(emberPs);

      // CRITICAL: Attach emitter to scene graph so three.quarks does not auto-dispose!
      this.emitterContainer.add(sparkPs.emitter);
      this.emitterContainer.add(emberPs.emitter);

      this.pool.push({ sparkPs, emberPs });
    }
  }

  /**
   * Emits metallic needle sparks and embers along the strike reflection tangent.
   */
  public emit(
    origin: THREE.Vector3 | { x: number; y: number; z: number },
    direction: THREE.Vector3 | { x: number; y: number; z: number },
    isHeavy = false,
  ): void {
    const burst = this.pool[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.poolSize;

    const orig = origin instanceof THREE.Vector3 ? origin : new THREE.Vector3(origin.x, origin.y, origin.z);
    const dir = direction instanceof THREE.Vector3 ? direction : new THREE.Vector3(direction.x, direction.y, direction.z);

    const forwardZ = new THREE.Vector3(0, 0, 1);
    const targetDir = dir.clone().normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(forwardZ, targetDir);
    const scale = isHeavy ? 1.4 : 1.0;

    // 1. Sparks
    burst.sparkPs.emitter.position.copy(orig);
    burst.sparkPs.emitter.quaternion.copy(quat);
    burst.sparkPs.emitter.scale.set(scale, scale, scale);
    burst.sparkPs.emitter.updateMatrixWorld(true);
    burst.sparkPs.restart();

    // 2. Embers
    burst.emberPs.emitter.position.copy(orig);
    burst.emberPs.emitter.scale.set(scale, scale, scale);
    burst.emberPs.emitter.updateMatrixWorld(true);
    burst.emberPs.restart();
  }

  public getActiveCount(): number {
    let count = 0;
    for (const b of this.pool) {
      if (b.sparkPs.emissionState.isBursting || b.emberPs.emissionState.isBursting) {
        count++;
      }
    }
    return count;
  }

  public reset(): void {
    for (const b of this.pool) {
      b.sparkPs.restart();
      b.emberPs.restart();
    }
    this.currentIndex = 0;
  }

  public dispose(): void {
    for (const b of this.pool) {
      this.batchRenderer.deleteSystem(b.sparkPs);
      this.batchRenderer.deleteSystem(b.emberPs);

      if (b.sparkPs.emitter.parent) b.sparkPs.emitter.parent.remove(b.sparkPs.emitter);
      if (b.emberPs.emitter.parent) b.emberPs.emitter.parent.remove(b.emberPs.emitter);
    }
    this.pool = [];
    this.sparkMaterial.dispose();
    this.emberMaterial.dispose();
  }
}

import * as THREE from 'three';
import {
  BatchedRenderer,
  ParticleSystem,
  DonutEmitter,
  ConeEmitter,
  PointEmitter,
  IntervalValue,
  ConstantValue,
  ConstantColor,
  ColorOverLife,
  Gradient,
  SizeOverLife,
  SpeedOverLife,
  RotationOverLife,
  ApplyForce,
  ApplyCollision,
  PiecewiseBezier,
  Bezier,
  RenderMode,
  Vector3,
  Vector4,
} from 'three.quarks';
import { SettingsManager } from '../systems/SettingsManager';
import { VFXTextureFactory } from './VFXTextureFactory';
import { GroundDecalPool } from './groundSlam/GroundDecalPool';

export class GroundSlamVFX {
  private scene: THREE.Scene;
  private batchRenderer: BatchedRenderer;

  // 1. Planar Ground Crack Decals Pool
  private decalPool: GroundDecalPool;

  // 2. Rolling Dust Pool (three.quarks DonutEmitter)
  private dustPool: ParticleSystem[] = [];
  private dustIndex = 0;
  private readonly dustPoolSize = 4;
  private dustMaterial: THREE.MeshBasicMaterial;

  // 3. Ballistic Pebble & Rock Debris Pool (three.quarks RenderMode.Mesh)
  private debrisPool: ParticleSystem[] = [];
  private debrisIndex = 0;
  private readonly debrisPoolSize = 4;
  private debrisGeometry: THREE.BufferGeometry;
  private debrisMaterial: THREE.MeshBasicMaterial;

  // 4. Grounded Shockwave Pool (three.quarks RenderMode.HorizontalBillBoard)
  private shockwavePool: ParticleSystem[] = [];
  private shockwaveIndex = 0;
  private readonly shockwavePoolSize = 4;
  private shockwaveMaterial: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, batchRenderer: BatchedRenderer) {
    this.scene = scene;
    this.batchRenderer = batchRenderer;
    const texFactory = VFXTextureFactory.getInstance();

    // 1. Initialize Planar Decal Pool via modular GroundDecalPool
    this.decalPool = new GroundDecalPool(this.scene, 6);

    // 2. Initialize Rolling Dust Ring with three.quarks
    this.dustMaterial = new THREE.MeshBasicMaterial({
      map: texFactory.getSmokeTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    for (let i = 0; i < this.dustPoolSize; i++) {
      const donut = new DonutEmitter({
        radius: 0.8,
        donutRadius: 0.4,
        arc: Math.PI * 2,
      });

      const dustGradient = new Gradient(
        [
          [new Vector3(0.72, 0.66, 0.56), 0],
          [new Vector3(0.48, 0.43, 0.36), 0.5],
          [new Vector3(0.35, 0.32, 0.28), 1],
        ],
        [
          [0.82, 0],
          [0.75, 0.40],
          [0.35, 0.75],
          [0.0, 1],
        ],
      );
      const colorRamp = new ColorOverLife(dustGradient);

      const sizeCurve = new SizeOverLife(
        new PiecewiseBezier([[new Bezier(1.0, 1.45, 1.95, 2.35), 0]]),
      );
      const drag = new SpeedOverLife(
        new PiecewiseBezier([[new Bezier(1.0, 0.35, 0.10, 0.02), 0]]),
      );
      const thermalLift = new ApplyForce(new Vector3(0, 0.08, 0), new ConstantValue(0.10));
      const rotation = new RotationOverLife(new IntervalValue(-0.25, 0.25));

      const ps = new ParticleSystem({
        duration: 3.3,
        looping: false,
        startLife: new IntervalValue(2.4, 3.4),
        startSpeed: new IntervalValue(2.4, 4.4),
        startSize: new IntervalValue(0.95, 1.35),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new ConstantColor(new Vector4(0.72, 0.66, 0.56, 0.82)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new IntervalValue(48, 62),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: donut,
        material: this.dustMaterial,
        renderMode: RenderMode.BillBoard,
        worldSpace: true,
        behaviors: [colorRamp, sizeCurve, drag, thermalLift, rotation],
      });

      this.batchRenderer.addSystem(ps);
      // CRITICAL: Attach emitter to scene graph so three.quarks does not auto-dispose!
      this.scene.add(ps.emitter);
      this.dustPool.push(ps);
    }

    // 3. Initialize Ballistic Rock/Pebble Debris with three.quarks RenderMode.Mesh
    this.debrisGeometry = new THREE.DodecahedronGeometry(0.045, 0);
    this.debrisMaterial = new THREE.MeshBasicMaterial({
      color: 0x423a32,
    });

    const floorResolver = {
      resolve: (pos: Vector3, normal: Vector3): boolean => {
        if (pos.y <= 0.02) {
          pos.y = 0.02;
          normal.set(0, 1, 0);
          return true;
        }
        return false;
      },
    };

    for (let i = 0; i < this.debrisPoolSize; i++) {
      const debrisCone = new ConeEmitter({
        radius: 0.25,
        angle: 0.75, // Upward volcanic cone
      });

      const debrisGravity = new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(28.0));
      const debrisBounce = new ApplyCollision(floorResolver, 0.25);
      const debrisSpin = new RotationOverLife(new IntervalValue(-7.0, 7.0));

      const ps = new ParticleSystem({
        duration: 0.85,
        looping: false,
        startLife: new IntervalValue(0.40, 0.85),
        startSpeed: new IntervalValue(8.0, 16.0),
        startSize: new IntervalValue(0.12, 0.28),
        startColor: new ConstantColor(new Vector4(0.35, 0.30, 0.25, 1.0)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new IntervalValue(35, 60),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: debrisCone,
        material: this.debrisMaterial,
        instancingGeometry: this.debrisGeometry,
        renderMode: RenderMode.Mesh,
        worldSpace: true,
        behaviors: [debrisGravity, debrisBounce, debrisSpin],
      });

      this.batchRenderer.addSystem(ps);
      this.scene.add(ps.emitter);
      this.debrisPool.push(ps);
    }

    // 4. Initialize Grounded Shockwave with three.quarks RenderMode.HorizontalBillBoard
    this.shockwaveMaterial = new THREE.MeshBasicMaterial({
      map: texFactory.getShockwaveRingTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < this.shockwavePoolSize; i++) {
      const shockwaveGradient = new Gradient(
        [
          [new Vector3(1.0, 0.98, 0.92), 0],
          [new Vector3(0.75, 0.65, 0.50), 1],
        ],
        [
          [0.95, 0],
          [0.70, 0.4],
          [0.0, 1],
        ],
      );
      const shockwaveColor = new ColorOverLife(shockwaveGradient);
      const shockwaveSize = new SizeOverLife(
        new PiecewiseBezier([[new Bezier(0.4, 4.0, 7.5, 10.5), 0]]),
      );

      const ps = new ParticleSystem({
        duration: 0.4,
        looping: false,
        startLife: new ConstantValue(0.32),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1.0),
        startColor: new ConstantColor(new Vector4(1.0, 0.98, 0.92, 0.95)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new ConstantValue(1),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: new PointEmitter(),
        material: this.shockwaveMaterial,
        renderMode: RenderMode.HorizontalBillBoard,
        worldSpace: true,
        behaviors: [shockwaveColor, shockwaveSize],
      });

      this.batchRenderer.addSystem(ps);
      this.scene.add(ps.emitter);
      this.shockwavePool.push(ps);
    }
  }

  public setGroundTarget(_mesh: THREE.Mesh): void {
    // Retained for interface compatibility
  }

  public getActiveDecalCount(): number {
    return this.decalPool.getActiveCount();
  }

  public getActiveShockwaveCount(): number {
    return this.shockwavePool.filter((ps) => ps.emissionState.isBursting).length;
  }

  /**
   * Immediately recycles all active ground crack decals and resets particle emitters.
   */
  public reset(): void {
    for (const ps of this.dustPool) {
      ps.restart();
    }
    for (const ps of this.debrisPool) {
      ps.restart();
    }
    for (const ps of this.shockwavePool) {
      ps.restart();
    }
    this.dustIndex = 0;
    this.debrisIndex = 0;
    this.shockwaveIndex = 0;
  }

  /**
   * Pre-warms decal materials with WebGLRenderer to compile upfront.
   */
  public prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (typeof window === 'undefined' || !renderer) return;
    try {
      renderer.compile(this.scene, camera);
    } catch {
      // Best-effort warm up
    }
  }

  /**
   * [Purpose]: Orchestrates the 4-part ground slam VFX suite comprising decal, shockwave ring, dust, and rock debris.
   * @condition Triggered on boss heavy downward smash impact or seismic shockwave animation events.
   * @param impactPoint World-space coordinates of the ground strike point; _customGroundMesh Optional projection mesh.
   * @returns Void; positions and fires pooled decal, shockwave emitter, dust particle system, and flying debris meshes.
   */
  public triggerGroundSlam(
    impactPoint: THREE.Vector3 | { x: number; y: number; z: number },
    _customGroundMesh?: THREE.Mesh,
  ): void {
    const vfxSettings = SettingsManager.getInstance().data.vfx;
    const ip = impactPoint instanceof THREE.Vector3 ? impactPoint : new THREE.Vector3(impactPoint.x, impactPoint.y, impactPoint.z);

    // 1. Ground Decal from Pre-allocated Pool (Zero runtime allocations)
    if (vfxSettings.groundDecals) {
      this.decalPool.spawn(ip);
    }

    // 2. Grounded Expanding Shockwave Ring (three.quarks HorizontalBillBoard)
    if (vfxSettings.groundSlamShockwave) {
      const wavePs = this.shockwavePool[this.shockwaveIndex];
      this.shockwaveIndex = (this.shockwaveIndex + 1) % this.shockwavePoolSize;

      wavePs.emitter.position.set(ip.x, 0.03, ip.z);
      wavePs.emitter.updateMatrixWorld(true);
      wavePs.restart();
    }

    // 3. Rolling Ground Dust (three.quarks flat floor DonutEmitter)
    if (vfxSettings.groundDust) {
      const dustPs = this.dustPool[this.dustIndex];
      this.dustIndex = (this.dustIndex + 1) % this.dustPoolSize;

      dustPs.emitter.position.set(ip.x, 0.04, ip.z);
      dustPs.emitter.rotation.set(-Math.PI / 2, 0, 0);
      dustPs.emitter.updateMatrixWorld(true);
      dustPs.restart();
    }

    // 4. Ballistic Pebble & Rock Debris (three.quarks RenderMode.Mesh)
    if (vfxSettings.groundDust) {
      const debrisPs = this.debrisPool[this.debrisIndex];
      this.debrisIndex = (this.debrisIndex + 1) % this.debrisPoolSize;

      debrisPs.emitter.position.set(ip.x, 0.05, ip.z);
      debrisPs.emitter.rotation.set(-Math.PI / 2, 0, 0);
      debrisPs.emitter.updateMatrixWorld(true);
      debrisPs.restart();
    }
  }

  public update(delta: number): void {
    this.decalPool.update(delta);
  }

  public dispose(): void {
    this.decalPool.dispose();

    for (const ps of this.dustPool) {
      this.batchRenderer.deleteSystem(ps);
      if (ps.emitter.parent) ps.emitter.parent.remove(ps.emitter);
    }
    this.dustPool = [];

    for (const ps of this.debrisPool) {
      this.batchRenderer.deleteSystem(ps);
      if (ps.emitter.parent) ps.emitter.parent.remove(ps.emitter);
    }
    this.debrisPool = [];
    this.debrisGeometry.dispose();
    this.debrisMaterial.dispose();

    for (const ps of this.shockwavePool) {
      this.batchRenderer.deleteSystem(ps);
      if (ps.emitter.parent) ps.emitter.parent.remove(ps.emitter);
    }
    this.shockwavePool = [];

    this.dustMaterial.dispose();
    this.shockwaveMaterial.dispose();
  }
}

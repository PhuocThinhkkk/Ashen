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
  SizeOverLife,
  PiecewiseBezier,
  Bezier,
  RenderMode,
  Vector3,
  Vector4,
} from 'three.quarks';
import {
  SlashArcInstance,
  DynamicWeaponTrail,
  createSlashArcGeometry,
} from '../vfx/SlashArcRibbon';
import { BloodBurstVFX } from '../vfx/BloodBurstVFX';
import { GroundSlamVFX } from '../vfx/GroundSlamVFX';
import { SparkBurstVFX } from '../vfx/SparkBurstVFX';
import { VFXTextureFactory } from '../vfx/VFXTextureFactory';
import { SettingsManager } from './SettingsManager';
import type { ActiveVFXCounts } from './PerformanceProfiler';

export class VFXSystem {
  public readonly scene: THREE.Scene;
  public readonly batchRenderer: BatchedRenderer;

  // Sub-systems
  public readonly bloodVFX: BloodBurstVFX;
  public readonly groundSlamVFX: GroundSlamVFX;
  public readonly sparkVFX: SparkBurstVFX;

  // Slash Arc Ribbon Pool (static legacy arcs for remote/test hooks)
  private slashArcPool: SlashArcInstance[] = [];
  private slashArcIndex = 0;
  private readonly slashArcPoolSize = 6;
  private slashGeometry: THREE.BufferGeometry;

  // Dynamic Bone-Tracked Blade Trail Pool
  private bladeTrailPool: DynamicWeaponTrail[] = [];
  private bladeTrailIndex = 0;
  private readonly bladeTrailPoolSize = 6;
  private readonly activeOwnerTrails = new Map<string, DynamicWeaponTrail>();

  // Foot Dust Kickup Pool (three.quarks)
  private footDustPool: ParticleSystem[] = [];
  private footDustIndex = 0;
  private readonly footDustPoolSize = 6;
  private footDustMaterial: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const texFactory = VFXTextureFactory.getInstance();

    // 1. Initialize three.quarks BatchedRenderer
    this.batchRenderer = new BatchedRenderer();
    this.batchRenderer.frustumCulled = false;
    this.scene.add(this.batchRenderer);

    // 2. Initialize Modular Sub-systems
    this.bloodVFX = new BloodBurstVFX(this.batchRenderer, this.scene);
    this.groundSlamVFX = new GroundSlamVFX(this.scene, this.batchRenderer);
    this.sparkVFX = new SparkBurstVFX(this.batchRenderer, this.scene);

    // 3. Initialize Elden Ring Sword Slash Arc Ribbon Pool + Dynamic Blade Trails
    this.slashGeometry = createSlashArcGeometry(0.7, 2.6, Math.PI * 0.8, 44, 4);
    for (let i = 0; i < this.slashArcPoolSize; i++) {
      const arc = new SlashArcInstance(this.slashGeometry);
      this.scene.add(arc.mesh);
      this.slashArcPool.push(arc);
    }
    for (let i = 0; i < this.bladeTrailPoolSize; i++) {
      const trail = new DynamicWeaponTrail();
      this.scene.add(trail.mesh);
      this.bladeTrailPool.push(trail);
    }

    // 4. Initialize Foot Dust Kickup Pool with three.quarks
    this.footDustMaterial = new THREE.MeshBasicMaterial({
      map: texFactory.getSmokeTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    for (let i = 0; i < this.footDustPoolSize; i++) {
      const cone = new ConeEmitter({
        radius: 0.12,
        angle: 0.65,
      });

      const dustGradient = new Gradient(
        [
          [new Vector3(0.78, 0.70, 0.58), 0],
          [new Vector3(0.48, 0.43, 0.35), 1],
        ],
        [
          [0.75, 0],
          [0.0, 1],
        ],
      );
      const colorRamp = new ColorOverLife(dustGradient);

      const sizeCurve = new SizeOverLife(
        new PiecewiseBezier([[new Bezier(1.0, 1.6, 2.2, 2.8), 0]]),
      );

      const ps = new ParticleSystem({
        duration: 0.4,
        looping: false,
        startLife: new IntervalValue(0.24, 0.38),
        startSpeed: new IntervalValue(1.6, 3.4),
        startSize: new IntervalValue(0.18, 0.34),
        startColor: new ConstantColor(new Vector4(0.78, 0.70, 0.58, 0.75)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new IntervalValue(10, 16),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: cone,
        material: this.footDustMaterial,
        renderMode: RenderMode.BillBoard,
        worldSpace: true,
        behaviors: [colorRamp, sizeCurve],
      });

      this.batchRenderer.addSystem(ps);
      this.scene.add(ps.emitter);
      this.footDustPool.push(ps);
    }
  }

  public setGroundTarget(mesh: THREE.Mesh): void {
    this.groundSlamVFX.setGroundTarget(mesh);
  }

  /**
   * Deterministically purges and recycles all active visual effects, ribbons, sparks, and decals.
   */
  public reset(): void {
    for (const arc of this.slashArcPool) {
      arc.active = false;
      arc.mesh.visible = false;
      arc.timer = 0;
    }
    this.slashArcIndex = 0;

    for (const trail of this.bladeTrailPool) {
      trail.reset();
    }
    this.bladeTrailIndex = 0;
    this.activeOwnerTrails.clear();

    this.bloodVFX.reset();
    this.sparkVFX.reset();
    this.groundSlamVFX.reset();
    for (const ps of this.footDustPool) {
      ps.restart();
    }
    this.footDustIndex = 0;
  }

  /**
   * Returns live active count of all VFX subsystems for diagnostics profiler.
   */
  public getActiveCounts(): ActiveVFXCounts {
    let activeSlashArcs = 0;
    for (const arc of this.slashArcPool) {
      if (arc.active) activeSlashArcs++;
    }
    for (const trail of this.bladeTrailPool) {
      if (trail.active) activeSlashArcs++;
    }

    let activeParticles = 0;
    if (this.batchRenderer && this.batchRenderer.systemToBatchIndex) {
      for (const system of this.batchRenderer.systemToBatchIndex.keys()) {
        activeParticles += (system as any).particleNum ?? 0;
      }
    }

    return {
      slashArcs: activeSlashArcs,
      sparks: this.sparkVFX.getActiveCount(),
      decals: this.groundSlamVFX.getActiveDecalCount(),
      shockwaves: this.groundSlamVFX.getActiveShockwaveCount(),
      particles: activeParticles,
    };
  }

  /**
   * [Purpose]: Compiles all VFX shader programs and warms particle buffers to prevent runtime jank on first hit.
   * @condition Called once during scene initialization or loading screen before gameplay commences.
   * @param renderer Active WebGLRenderer instance; camera Main active scene camera.
   * @returns Void; triggers renderer.compile and off-screen dummy particle emissions.
   */
  public prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (typeof window === 'undefined' || !renderer) return;
    try {
      // 1. Slash Arcs & Dynamic Blade Trails
      for (const arc of this.slashArcPool) {
        arc.mesh.visible = true;
      }
      if (this.bladeTrailPool.length > 0) {
        this.bladeTrailPool[0].mesh.visible = true;
      }

      // 2. Ground Slam Decals & Shockwaves
      this.groundSlamVFX.prewarm(renderer, camera);

      // 3. Force Three.js shader program compilation
      renderer.compile(this.scene, camera);

      // 4. Pre-warm three.quarks particle systems with an off-screen tick
      // Forces the WebGL driver to link StretchedBillboard, Billboard, Mesh, and HorizontalBillboard programs upfront!
      const dummyOffscreen = new THREE.Vector3(0, -9999, 0);
      const dummyDir = new THREE.Vector3(0, 1, 0);
      this.bloodVFX.emit(dummyOffscreen, dummyDir, false);
      this.spawnFootDustKickup(dummyOffscreen, 2);
      this.sparkVFX.emit(dummyOffscreen, dummyDir, false);
      this.triggerGroundSlam(dummyOffscreen);

      this.batchRenderer.update(0.016);
      renderer.render(this.scene, camera);
    } catch {
      // Best-effort pre-warming
    } finally {
      for (const arc of this.slashArcPool) {
        arc.mesh.visible = false;
      }
      for (const trail of this.bladeTrailPool) {
        trail.mesh.visible = false;
      }
      this.reset();
    }
  }

  /**
   * Spawns ground dust kick-up particles at feet bones transitioning from Airborne to Impact/Recovery
   * using three.quarks GPU instanced particles.
   */
  public spawnFootDustKickup(position: THREE.Vector3, _count = 10): void {
    if (!SettingsManager.getInstance().data.vfx.groundDust) return;

    const ps = this.footDustPool[this.footDustIndex];
    this.footDustIndex = (this.footDustIndex + 1) % this.footDustPoolSize;

    ps.emitter.position.set(position.x, Math.max(0.04, position.y), position.z);
    ps.emitter.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.2, 0, 0);
    ps.emitter.updateMatrixWorld(true);
    ps.restart();
  }

  /**
   * Spawns peak velocity sparks at weapon/hand bone (disabled for minimal realistic combat).
   */
  public spawnPeakVelocitySparks(_origin: THREE.Vector3, _count = 25, _isHeavy = false): void {
    // Disabled: User requested all spark clash VFX removed
  }

  /**
   * Spawns an Elden Ring-style Sword Slash Arc Ribbon attached to or spawned along the slash plane.
   */
  public spawnSlashArc(
    origin: THREE.Vector3,
    rotation: THREE.Euler,
    scale = 1.0,
    colorHex: number | string | THREE.Color = 0xffe066,
    duration = 0.20,
    expansion = 0.22,
    intensity = 2.4,
  ): void {
    if (!SettingsManager.getInstance().data.vfx.slashArcs) return;

    const arc = this.slashArcPool[this.slashArcIndex];
    this.slashArcIndex = (this.slashArcIndex + 1) % this.slashArcPoolSize;
    arc.activate(origin, rotation, scale, colorHex, duration, expansion, intensity);
  }

  /**
   * Spawns an Elden Ring-style combat slash arc along the character's swing plane.
   */
  public spawnAttackSlashArc(
    characterPos: THREE.Vector3,
    rotationY: number,
    attackName = 'light',
    isHeavy = false,
    isBoss = false,
  ): void {
    if (!SettingsManager.getInstance().data.vfx.slashArcs) return;

    const fwd = new THREE.Vector3(-Math.sin(rotationY), 0, -Math.cos(rotationY));
    const origin = characterPos
      .clone()
      .add(new THREE.Vector3(0, isBoss ? 1.4 : 1.0, 0))
      .addScaledVector(fwd, isBoss ? 1.1 : 0.6);

    const colorHex = isBoss ? 0xff4411 : (isHeavy ? 0xff1a1a : 0xffe066);
    let scale = isBoss ? 1.9 : 1.2;
    let duration = isHeavy ? 0.24 : 0.18;
    const expansion = isHeavy ? 0.32 : 0.22;

    const rot = new THREE.Euler(0, rotationY, 0);

    const nameLower = attackName.toLowerCase();
    if (nameLower.includes('heavy') || nameLower.includes('downward') || nameLower.includes('jump')) {
      rot.set(0.3, rotationY, Math.PI * 0.45);
      scale *= 1.25;
    } else if (nameLower.includes('360') || nameLower.includes('spin') || nameLower.includes('maelstrom')) {
      scale *= 1.45;
      duration = 0.28;
    } else if (nameLower.includes('light2') || nameLower.includes('combo')) {
      rot.set(-0.25, rotationY, -Math.PI * 0.18);
    } else {
      rot.set(0.08, rotationY, -0.05);
    }

    this.spawnSlashArc(origin, rot, scale, colorHex, duration, expansion, 2.6);
  }

  public beginBladeTrail(
    ownerKey: string,
    colorHex: number | string | THREE.Color = 0xffe066,
    intensity = 2.2,
  ): void {
    if (!SettingsManager.getInstance().data.vfx.slashArcs) return;

    const prev = this.activeOwnerTrails.get(ownerKey);
    if (prev && prev.recording) {
      prev.end();
    }

    const trail = this.bladeTrailPool[this.bladeTrailIndex];
    this.bladeTrailIndex = (this.bladeTrailIndex + 1) % this.bladeTrailPoolSize;
    trail.begin(ownerKey, colorHex, intensity);
    this.activeOwnerTrails.set(ownerKey, trail);
  }

  public pushBladeTrailSample(
    ownerKey: string,
    baseWorld: THREE.Vector3,
    tipWorld: THREE.Vector3,
  ): void {
    if (!SettingsManager.getInstance().data.vfx.slashArcs) return;
    const trail = this.activeOwnerTrails.get(ownerKey);
    if (trail && trail.recording) {
      trail.addSample(baseWorld, tipWorld);
    }
  }

  public endBladeTrail(ownerKey: string): void {
    const trail = this.activeOwnerTrails.get(ownerKey);
    if (trail) {
      trail.end();
      this.activeOwnerTrails.delete(ownerKey);
    }
  }

  /**
   * Spawns weapon trail arc ribbon parented to bone/hand position.
   */
  public spawnWeaponTrail(
    bone: THREE.Object3D,
    duration = 0.18,
    colorHex: number | string | THREE.Color = 0xffe066,
    scale = 1.0,
  ): void {
    if (!SettingsManager.getInstance().data.vfx.slashArcs) return;

    const worldPos = new THREE.Vector3();
    bone.getWorldPosition(worldPos);

    const worldQuat = new THREE.Quaternion();
    bone.getWorldQuaternion(worldQuat);
    const rot = new THREE.Euler().setFromQuaternion(worldQuat);

    this.spawnSlashArc(worldPos, rot, scale, colorHex, duration, 0.24, 2.5);
  }

  /**
   * Spawns a visceral directional blood impact burst using three.quarks.
   * Spawned at the exact collision contact point, spreading outward with natural gravity.
   */
  public spawnBloodBurst(
    contactPoint: THREE.Vector3,
    hitDirection: THREE.Vector3,
    isHeavy = false,
  ): void {
    if (!SettingsManager.getInstance().data.vfx.bloodBursts) return;
    this.bloodVFX.emit(contactPoint, hitDirection, isHeavy);
  }

  /**
   * Spawns heavy colossal ground slam VFX (Decal crack + shockwave + rolling dust + rock debris).
   */
  public triggerGroundSlam(
    impactPoint: THREE.Vector3,
    customGroundMesh?: THREE.Mesh,
  ): void {
    this.groundSlamVFX.triggerGroundSlam(impactPoint, customGroundMesh);
  }

  /**
   * Spawns high-energy hit spark burst at the impact contact point using three.quarks.
   */
  public spawnHitSparks(origin: THREE.Vector3, direction: THREE.Vector3, isHeavy = false): void {
    if (!SettingsManager.getInstance().data.vfx.hitSparks) return;
    this.sparkVFX.emit(origin, direction, isHeavy);
  }

  public update(delta: number): void {
    // 1. Update three.quarks BatchedRenderer (GPU particles)
    this.batchRenderer.update(delta);

    // 2. Update Blood Burst VFX (Directional Liquid Whip)
    this.bloodVFX.update(delta);

    // 3. Update Ground Slam VFX (shockwaves + decals)
    this.groundSlamVFX.update(delta);

    // 4. Update Slash Arc Ribbons & Dynamic Blade Trails
    for (const arc of this.slashArcPool) {
      if (arc.active) {
        arc.update(delta);
      }
    }
    for (const trail of this.bladeTrailPool) {
      if (trail.active) {
        trail.update(delta);
      }
    }
  }

  public dispose(): void {
    this.sparkVFX.dispose();

    for (const arc of this.slashArcPool) {
      this.scene.remove(arc.mesh);
      arc.dispose();
    }
    this.slashArcPool = [];
    this.slashGeometry.dispose();

    for (const trail of this.bladeTrailPool) {
      this.scene.remove(trail.mesh);
      trail.dispose();
    }
    this.bladeTrailPool = [];
    this.activeOwnerTrails.clear();

    for (const ps of this.footDustPool) {
      this.batchRenderer.deleteSystem(ps);
      if (ps.emitter.parent) ps.emitter.parent.remove(ps.emitter);
    }
    this.footDustPool = [];
    this.footDustMaterial.dispose();

    this.bloodVFX.dispose();
    this.groundSlamVFX.dispose();

    VFXTextureFactory.getInstance().dispose();
    this.scene.remove(this.batchRenderer);
  }
}

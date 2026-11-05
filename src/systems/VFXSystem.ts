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
  createSlashArcGeometry,
} from '../vfx/SlashArcRibbon';
import { BloodBurstVFX } from '../vfx/BloodBurstVFX';
import { GroundSlamVFX } from '../vfx/GroundSlamVFX';
import { SettingsManager } from './SettingsManager';
import type { ActiveVFXCounts } from './PerformanceProfiler';

interface SparkParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

class SparkBurst {
  public active = false;
  public points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private particles: SparkParticle[] = [];
  private readonly maxParticles = 32;

  constructor(scene: THREE.Scene, sparkTexture: THREE.Texture) {
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.32,
      map: sparkTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.visible = false;
    this.points.frustumCulled = false;
    scene.add(this.points);

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.3,
        size: 0.22,
      });
    }
  }

  public emit(origin: THREE.Vector3, direction: THREE.Vector3, isHeavy: boolean): void {
    this.active = true;
    this.points.visible = true;
    const count = isHeavy ? this.maxParticles : Math.floor(this.maxParticles * 0.65);

    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      p.pos.copy(origin);
      p.maxLife = (isHeavy ? 0.32 : 0.22) + Math.random() * 0.12;
      p.life = p.maxLife;
      p.size = (isHeavy ? 0.36 : 0.22) * (0.8 + Math.random() * 0.6);

      const speed = (isHeavy ? 9.5 : 6.0) + Math.random() * 5.5;
      const spreadX = (Math.random() - 0.5) * 1.6;
      const spreadY = (Math.random() - 0.2) * 1.4;
      const spreadZ = (Math.random() - 0.5) * 1.6;

      p.vel
        .copy(direction)
        .add(new THREE.Vector3(spreadX, spreadY, spreadZ))
        .normalize()
        .multiplyScalar(speed);
    }

    for (let i = count; i < this.maxParticles; i++) {
      this.particles[i].life = 0;
      this.sizes[i] = 0;
    }
  }

  public update(delta: number): boolean {
    if (!this.active) return false;

    let anyAlive = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        anyAlive = true;
        p.life -= delta;
        p.vel.y -= 9.8 * delta * 0.6;
        p.pos.addScaledVector(p.vel, delta);

        const progress = 1.0 - Math.max(0, p.life / p.maxLife);

        this.positions[i * 3] = p.pos.x;
        this.positions[i * 3 + 1] = p.pos.y;
        this.positions[i * 3 + 2] = p.pos.z;

        if (progress < 0.22) {
          this.colors[i * 3] = 1.0;
          this.colors[i * 3 + 1] = 0.98;
          this.colors[i * 3 + 2] = 0.85;
        } else if (progress < 0.65) {
          const t = (progress - 0.22) / 0.43;
          this.colors[i * 3] = 1.0;
          this.colors[i * 3 + 1] = 0.88 - t * 0.5;
          this.colors[i * 3 + 2] = 0.12;
        } else {
          const t = (progress - 0.65) / 0.35;
          this.colors[i * 3] = 0.8 - t * 0.65;
          this.colors[i * 3 + 1] = 0.2 - t * 0.2;
          this.colors[i * 3 + 2] = 0.04;
        }

        this.sizes[i] = p.size * (1.0 - progress * 0.85);
      } else {
        this.sizes[i] = 0;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;

    if (!anyAlive) {
      this.active = false;
      this.points.visible = false;
    }

    return this.active;
  }

  public dispose(): void {
    this.geometry.dispose();
    if (this.points.material instanceof THREE.Material) {
      this.points.material.dispose();
    }
  }
}

export class VFXSystem {
  public readonly scene: THREE.Scene;
  public readonly batchRenderer: BatchedRenderer;

  // Sub-systems
  public readonly bloodVFX: BloodBurstVFX;
  public readonly groundSlamVFX: GroundSlamVFX;

  // Slash Arc Ribbon Pool
  private slashArcPool: SlashArcInstance[] = [];
  private slashArcIndex = 0;
  private readonly slashArcPoolSize = 6;
  private slashGeometry: THREE.BufferGeometry;

  // Foot Dust Kickup Pool (three.quarks)
  private footDustPool: ParticleSystem[] = [];
  private footDustIndex = 0;
  private readonly footDustPoolSize = 6;
  private dustTexture: THREE.Texture;

  // Spark burst pool
  private sparkTexture: THREE.Texture;
  private sparkPool: SparkBurst[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 1. Initialize three.quarks BatchedRenderer
    this.batchRenderer = new BatchedRenderer();
    this.scene.add(this.batchRenderer);

    // 2. Shared procedural textures
    this.sparkTexture = this.createSparkTexture();
    this.dustTexture = this.createDustTexture();

    // 3. Initialize Modular VFX
    this.bloodVFX = new BloodBurstVFX(this.batchRenderer);
    this.groundSlamVFX = new GroundSlamVFX(this.scene, this.batchRenderer);

    // 4. Initialize Elden Ring Sword Slash Arc Ribbon Pool
    this.slashGeometry = createSlashArcGeometry(0.7, 2.6, Math.PI * 0.8, 44, 4);
    for (let i = 0; i < this.slashArcPoolSize; i++) {
      const arc = new SlashArcInstance(this.slashGeometry);
      this.scene.add(arc.mesh);
      this.slashArcPool.push(arc);
    }

    // 5. Initialize Foot Dust Kickup Pool with three.quarks
    const footDustMat = new THREE.MeshBasicMaterial({
      map: this.dustTexture,
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
        material: footDustMat,
        renderMode: RenderMode.BillBoard,
        worldSpace: true,
        behaviors: [colorRamp, sizeCurve],
      });

      this.batchRenderer.addSystem(ps);
      this.footDustPool.push(ps);
    }

    // 6. Spark Burst Pool (GPU points)
    for (let i = 0; i < 8; i++) {
      this.sparkPool.push(new SparkBurst(this.scene, this.sparkTexture));
    }
  }

  public setGroundTarget(mesh: THREE.Mesh): void {
    this.groundSlamVFX.setGroundTarget(mesh);
  }

  /**
   * Returns live active count of all VFX subsystems for diagnostics profiler.
   */
  public getActiveCounts(): ActiveVFXCounts {
    let activeSlashArcs = 0;
    for (const arc of this.slashArcPool) {
      if (arc.active) activeSlashArcs++;
    }

    let activeSparks = 0;
    for (const burst of this.sparkPool) {
      if (burst.active) activeSparks++;
    }

    return {
      slashArcs: activeSlashArcs,
      sparks: activeSparks,
      decals: this.groundSlamVFX.getActiveDecalCount(),
      shockwaves: this.groundSlamVFX.getActiveShockwaveCount(),
      particles: 0, // three.quarks maintains internal particle counts
    };
  }

  /**
   * Pre-warms VFX shaders with WebGLRenderer to eliminate first-attack/hit shader compilation stalls.
   * Warms slash arcs, sparks, ground slam decals/shockwaves, and three.quarks particle systems.
   */
  public prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (typeof window === 'undefined' || !renderer) return;
    try {
      // 1. Slash Arcs
      for (const arc of this.slashArcPool) {
        arc.mesh.visible = true;
      }

      // 2. Spark Bursts
      for (const burst of this.sparkPool) {
        burst.points.visible = true;
      }

      // 3. Ground Slam Decals & Shockwaves
      this.groundSlamVFX.prewarm(renderer, camera);

      // 4. Force Three.js shader program compilation
      renderer.compile(this.scene, camera);

      // 5. Pre-warm three.quarks particle systems (blood & dust) with an off-screen tick
      // This forces the WebGL driver to link the StretchedBillboard and Billboard programs upfront!
      const dummyOffscreen = new THREE.Vector3(0, -9999, 0);
      const dummyDir = new THREE.Vector3(0, 1, 0);
      this.bloodVFX.emit(dummyOffscreen, dummyDir, false);
      this.spawnFootDustKickup(dummyOffscreen, 2);
      this.batchRenderer.update(0.016);
      renderer.render(this.scene, camera);
    } catch {
      // Best-effort pre-warming
    } finally {
      for (const arc of this.slashArcPool) {
        arc.mesh.visible = false;
      }
      for (const burst of this.sparkPool) {
        burst.points.visible = false;
      }
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
    ps.restart();
  }

  /**
   * Spawns peak velocity sparks at weapon/hand bone.
   */
  public spawnPeakVelocitySparks(origin: THREE.Vector3, _count = 25, isHeavy = false): void {
    if (!SettingsManager.getInstance().data.vfx.hitSparks) return;
    this.spawnHitSparks(origin, new THREE.Vector3(0, 0.8, 0).normalize(), isHeavy);
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
   * Spawns heavy colossal ground slam VFX (DecalGeometry crack + shockwave ring + rolling dust).
   */
  public triggerGroundSlam(
    impactPoint: THREE.Vector3,
    customGroundMesh?: THREE.Mesh,
  ): void {
    this.groundSlamVFX.triggerGroundSlam(impactPoint, customGroundMesh);
  }

  /**
   * Spawns high-energy hit spark burst at the impact contact point.
   */
  public spawnHitSparks(origin: THREE.Vector3, direction: THREE.Vector3, isHeavy = false): void {
    if (!SettingsManager.getInstance().data.vfx.hitSparks) return;

    let burst = this.sparkPool.find((b) => !b.active);
    if (!burst) {
      burst = this.sparkPool[0]; // Recycle oldest
    }
    burst.emit(origin, direction, isHeavy);
  }

  public update(delta: number): void {
    // 1. Update three.quarks BatchedRenderer (GPU particles)
    this.batchRenderer.update(delta);

    // 2. Update Ground Slam VFX (shockwaves + decals)
    this.groundSlamVFX.update(delta);

    // 3. Update Slash Arc Ribbons
    for (const arc of this.slashArcPool) {
      if (arc.active) {
        arc.update(delta);
      }
    }

    // 4. Update Spark Bursts
    for (const burst of this.sparkPool) {
      if (burst.active) {
        burst.update(delta);
      }
    }
  }

  /**
   * Generates a procedural radial circular glow spark texture in memory.
   */
  private createSparkTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      const data = new Uint8Array([255, 240, 180, 255]);
      return new THREE.DataTexture(data, 1, 1);
    }

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.2, 'rgba(255, 240, 180, 0.95)');
    grad.addColorStop(0.5, 'rgba(255, 140, 40, 0.45)');
    grad.addColorStop(1, 'rgba(255, 40, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  /**
   * Generates a procedural soft circular smoke/dust texture in memory.
   */
  private createDustTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      const data = new Uint8Array([216, 202, 168, 255]);
      return new THREE.DataTexture(data, 1, 1);
    }

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(216, 202, 168, 0.85)');
    grad.addColorStop(0.35, 'rgba(180, 165, 135, 0.5)');
    grad.addColorStop(0.7, 'rgba(120, 110, 90, 0.18)');
    grad.addColorStop(1, 'rgba(60, 55, 45, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  public dispose(): void {
    for (const burst of this.sparkPool) {
      burst.dispose();
    }
    this.sparkPool = [];

    for (const arc of this.slashArcPool) {
      this.scene.remove(arc.mesh);
      arc.dispose();
    }
    this.slashArcPool = [];
    this.slashGeometry.dispose();

    this.sparkTexture.dispose();
    this.dustTexture.dispose();

    this.bloodVFX.dispose();
    this.groundSlamVFX.dispose();

    this.scene.remove(this.batchRenderer);
  }
}

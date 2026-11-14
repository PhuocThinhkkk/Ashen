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

interface PooledDecal {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  timer: number;
  duration: number;
}

export class GroundSlamVFX {
  private scene: THREE.Scene;
  private batchRenderer: BatchedRenderer;

  // 1. Planar Ground Crack Decals Pool
  private crackTexture: THREE.Texture;
  private decalPool: PooledDecal[] = [];
  private decalIndex = 0;
  private readonly maxDecals = 6;
  private decalGeometry: THREE.BufferGeometry;

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

    this.crackTexture = this.createCrackTexture();

    // 1. Initialize Planar Decal Pool (Zero runtime allocations)
    this.decalGeometry = new THREE.PlaneGeometry(5.8, 5.8);
    this.decalGeometry.rotateX(-Math.PI / 2);

    for (let i = 0; i < this.maxDecals; i++) {
      const decalMat = new THREE.MeshBasicMaterial({
        map: this.crackTexture,
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      });

      const decalMesh = new THREE.Mesh(this.decalGeometry, decalMat);
      decalMesh.visible = false;
      decalMesh.frustumCulled = false;
      this.scene.add(decalMesh);

      this.decalPool.push({
        mesh: decalMesh,
        material: decalMat,
        active: false,
        timer: 0,
        duration: 4.5,
      });
    }

    // 2. Initialize Rolling Dust Ring with three.quarks
    this.dustMaterial = new THREE.MeshBasicMaterial({
      map: texFactory.getSmokeTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    for (let i = 0; i < this.dustPoolSize; i++) {
      const donut = new DonutEmitter({
        radius: 0.9,
        donutRadius: 0.45,
        arc: Math.PI * 2,
      });

      const dustGradient = new Gradient(
        [
          [new Vector3(0.75, 0.68, 0.58), 0],
          [new Vector3(0.40, 0.36, 0.30), 1],
        ],
        [
          [0.90, 0],
          [0.85, 0.4],
          [0.0, 1],
        ],
      );
      const colorRamp = new ColorOverLife(dustGradient);

      const sizeCurve = new SizeOverLife(
        new PiecewiseBezier([[new Bezier(1.0, 2.4, 3.8, 4.8), 0]]),
      );
      const drag = new SpeedOverLife(
        new PiecewiseBezier([[new Bezier(1.0, 0.5, 0.15, 0.05), 0]]),
      );
      const thermalLift = new ApplyForce(new Vector3(0, 0.2, 0), new ConstantValue(0.35));

      const ps = new ParticleSystem({
        duration: 0.9,
        looping: false,
        startLife: new IntervalValue(0.65, 1.05),
        startSpeed: new IntervalValue(6.0, 10.5),
        startSize: new IntervalValue(1.1, 2.2),
        startColor: new ConstantColor(new Vector4(0.72, 0.65, 0.55, 0.90)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new IntervalValue(85, 125),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: donut,
        material: this.dustMaterial,
        renderMode: RenderMode.BillBoard,
        worldSpace: true,
        behaviors: [colorRamp, sizeCurve, drag, thermalLift],
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
    return this.decalPool.filter((d) => d.active).length;
  }

  public getActiveShockwaveCount(): number {
    return this.shockwavePool.filter((ps) => ps.emissionState.isBursting).length;
  }

  /**
   * Immediately recycles all active ground crack decals and resets particle emitters.
   */
  public reset(): void {
    for (const decal of this.decalPool) {
      decal.active = false;
      decal.mesh.visible = false;
      decal.timer = 0;
      decal.material.opacity = 0;
    }
    for (const ps of this.dustPool) {
      ps.restart();
    }
    for (const ps of this.debrisPool) {
      ps.restart();
    }
    for (const ps of this.shockwavePool) {
      ps.restart();
    }
    this.decalIndex = 0;
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
      if (this.decalPool[0]) this.decalPool[0].mesh.visible = true;
      renderer.compile(this.scene, camera);
    } catch {
      // Best-effort warm up
    } finally {
      if (this.decalPool[0]) this.decalPool[0].mesh.visible = false;
    }
  }

  /**
   * Triggers the 4-part colossal ground slam:
   * 1. Ground Crack Decal (Pre-allocated planar decal from pool)
   * 2. Grounded Expanding Shockwave (three.quarks HorizontalBillBoard)
   * 3. Rolling Ground Dust (three.quarks DonutEmitter)
   * 4. Ballistic Pebble & Rock Debris (three.quarks RenderMode.Mesh)
   */
  public triggerGroundSlam(
    impactPoint: THREE.Vector3 | { x: number; y: number; z: number },
    _customGroundMesh?: THREE.Mesh,
  ): void {
    const vfxSettings = SettingsManager.getInstance().data.vfx;
    const ip = impactPoint instanceof THREE.Vector3 ? impactPoint : new THREE.Vector3(impactPoint.x, impactPoint.y, impactPoint.z);

    // 1. Ground Decal from Pre-allocated Pool (Zero runtime allocations)
    if (vfxSettings.groundDecals) {
      const decal = this.decalPool[this.decalIndex];
      this.decalIndex = (this.decalIndex + 1) % this.maxDecals;

      decal.active = true;
      decal.timer = 0;
      decal.duration = 4.5;
      decal.mesh.position.set(ip.x, 0.02, ip.z);
      decal.mesh.rotation.y = Math.random() * Math.PI * 2;
      decal.material.opacity = 0.95;
      decal.mesh.visible = true;
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
    // Update Active Decals (fade out and recycle)
    for (const decal of this.decalPool) {
      if (decal.active) {
        decal.timer += delta;
        if (decal.timer >= decal.duration) {
          decal.active = false;
          decal.mesh.visible = false;
        } else if (decal.timer > decal.duration * 0.65) {
          const fade = 1.0 - (decal.timer - decal.duration * 0.65) / (decal.duration * 0.35);
          decal.material.opacity = Math.max(0, fade * 0.95);
        }
      }
    }
  }

  /**
   * Procedural Elden Ring-style ground crater & fissure crack decal texture.
   */
  private createCrackTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      const data = new Uint8Array([20, 15, 10, 255]);
      return new THREE.DataTexture(data, 1, 1);
    }

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);

    // Scorched radial ground burn
    const burnGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.44);
    burnGrad.addColorStop(0, 'rgba(18, 12, 10, 0.92)');
    burnGrad.addColorStop(0.35, 'rgba(32, 22, 16, 0.7)');
    burnGrad.addColorStop(0.7, 'rgba(40, 28, 18, 0.3)');
    burnGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = burnGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.44, 0, Math.PI * 2);
    ctx.fill();

    // Central jagged crater
    ctx.fillStyle = 'rgba(10, 8, 8, 0.98)';
    ctx.beginPath();
    const craterPoints = 14;
    for (let i = 0; i < craterPoints; i++) {
      const angle = (i / craterPoints) * Math.PI * 2;
      const r = (size * 0.1) * (0.7 + Math.random() * 0.6);
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Radial jagged crack fissures
    const numFissures = 10;
    for (let f = 0; f < numFissures; f++) {
      let angle = (f / numFissures) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      let curX = cx;
      let curY = cy;
      const length = (size * 0.42) * (0.6 + Math.random() * 0.5);
      const steps = 8;
      const stepLen = length / steps;

      ctx.beginPath();
      ctx.moveTo(curX, curY);

      for (let s = 0; s < steps; s++) {
        angle += (Math.random() - 0.5) * 0.48;
        curX += Math.cos(angle) * stepLen;
        curY += Math.sin(angle) * stepLen;
        ctx.lineTo(curX, curY);
      }

      ctx.lineWidth = 2.4 * (1.0 - (f % 3) * 0.2);
      ctx.strokeStyle = 'rgba(8, 6, 6, 0.95)';
      ctx.stroke();

      // Ember glow along fissure root
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = 'rgba(255, 120, 30, 0.45)';
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  public dispose(): void {
    for (const d of this.decalPool) {
      this.scene.remove(d.mesh);
      d.material.dispose();
    }
    this.decalPool = [];
    this.decalGeometry.dispose();

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

    this.crackTexture.dispose();
    this.dustMaterial.dispose();
    this.shockwaveMaterial.dispose();
  }
}

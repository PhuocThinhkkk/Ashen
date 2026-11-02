import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import {
  BatchedRenderer,
  ParticleSystem,
  DonutEmitter,
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

interface ActiveDecal {
  mesh: THREE.Mesh;
  timer: number;
  duration: number;
  material: THREE.MeshBasicMaterial;
}

interface ActiveShockwave {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  timer: number;
  duration: number;
  maxRadius: number;
}

export class GroundSlamVFX {
  private scene: THREE.Scene;
  private crackTexture: THREE.Texture;
  private dustTexture: THREE.Texture;
  private shockwaveTexture: THREE.Texture;
  private groundTarget: THREE.Mesh | null = null;

  // 1. Decal pool
  private activeDecals: ActiveDecal[] = [];
  private readonly maxDecals = 6;

  // 2. Shockwave ring pool
  private shockwaves: ActiveShockwave[] = [];
  private readonly shockwavePoolSize = 4;

  // 3. Rolling Ground Dust (three.quarks)
  private dustPool: ParticleSystem[] = [];
  private dustIndex = 0;
  private readonly dustPoolSize = 4;

  constructor(scene: THREE.Scene, batchRenderer: BatchedRenderer) {
    this.scene = scene;
    this.crackTexture = this.createCrackTexture();
    this.dustTexture = this.createDustTexture();
    this.shockwaveTexture = this.createShockwaveTexture();

    // Initialize Shockwave Rings
    const ringGeo = new THREE.RingGeometry(0.82, 1.0, 54);
    for (let i = 0; i < this.shockwavePoolSize; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.shockwaveTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        color: 0xffe2aa,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);

      this.shockwaves.push({
        mesh,
        material: mat,
        active: false,
        timer: 0,
        duration: 0.2,
        maxRadius: 5.6,
      });
    }

    // Initialize Rolling Ground Dust with three.quarks
    const dustMat = new THREE.MeshBasicMaterial({
      map: this.dustTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    for (let i = 0; i < this.dustPoolSize; i++) {
      // Donut/circle emitter placed on floor plane
      const donut = new DonutEmitter({
        radius: 0.6,
        donutRadius: 0.4,
        arc: Math.PI * 2,
      });

      // Dust smoke color ramp: warm sandy stone dust fading to zero alpha
      const dustGradient = new Gradient(
        [
          [new Vector3(0.76, 0.68, 0.54), 0],
          [new Vector3(0.48, 0.43, 0.35), 1],
        ],
        [
          [0.78, 0],
          [0.0, 1],
        ],
      );
      const colorRamp = new ColorOverLife(dustGradient);

      // Dust particles billow and swell outwards (scale increase 1.0 -> 3.2 over 0.6s)
      const sizeCurve = new SizeOverLife(
        new PiecewiseBezier([[new Bezier(1.0, 1.8, 2.6, 3.4), 0]]),
      );

      const ps = new ParticleSystem({
        duration: 0.65,
        looping: false,
        startLife: new IntervalValue(0.45, 0.62),
        startSpeed: new IntervalValue(6.5, 9.5),
        startSize: new IntervalValue(0.42, 0.68),
        startColor: new ConstantColor(new Vector4(0.76, 0.68, 0.54, 0.78)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new IntervalValue(38, 48),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: donut,
        material: dustMat,
        renderMode: RenderMode.BillBoard,
        worldSpace: true,
        behaviors: [colorRamp, sizeCurve],
      });

      batchRenderer.addSystem(ps);
      this.dustPool.push(ps);
    }
  }

  public setGroundTarget(mesh: THREE.Mesh): void {
    this.groundTarget = mesh;
  }

  /**
   * Triggers the 3-part heavy colossal ground slam:
   * 1. Ground Crack Decal (DecalGeometry)
   * 2. Expanding Shockwave Ring (radius 0 -> 5+ meters over 0.2s)
   * 3. Rolling Ground Dust (three.quarks DonutEmitter over 0.6s)
   */
  public triggerGroundSlam(
    impactPoint: THREE.Vector3,
    customGroundMesh?: THREE.Mesh,
  ): void {
    const targetMesh = customGroundMesh || this.groundTarget;

    // 1. Ground Decal Projection
    if (targetMesh) {
      try {
        const decalPos = new THREE.Vector3(impactPoint.x, 0.04, impactPoint.z);
        const decalRot = new THREE.Euler(-Math.PI / 2, Math.random() * Math.PI * 2, 0);
        const decalSize = new THREE.Vector3(4.8, 4.8, 2.2);

        const decalGeo = new DecalGeometry(targetMesh, decalPos, decalRot, decalSize);
        const decalMat = new THREE.MeshBasicMaterial({
          map: this.crackTexture,
          transparent: true,
          opacity: 0.95,
          depthTest: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
        });

        const decalMesh = new THREE.Mesh(decalGeo, decalMat);
        this.scene.add(decalMesh);

        // Cap decal pool size
        if (this.activeDecals.length >= this.maxDecals) {
          const oldest = this.activeDecals.shift();
          if (oldest) {
            this.scene.remove(oldest.mesh);
            oldest.mesh.geometry.dispose();
            oldest.material.dispose();
          }
        }

        this.activeDecals.push({
          mesh: decalMesh,
          material: decalMat,
          timer: 0,
          duration: 4.5,
        });
      } catch (err) {
        console.warn('[GroundSlamVFX] Decal projection error:', err);
      }
    }

    // 2. Expanding Shockwave Ring (radius 0 to 5.6m over 0.20s)
    let wave = this.shockwaves.find((w) => !w.active);
    if (!wave) {
      wave = this.shockwaves[0]; // Recycle oldest
    }
    wave.active = true;
    wave.timer = 0;
    wave.duration = 0.20;
    wave.maxRadius = 5.6;
    wave.mesh.position.set(impactPoint.x, 0.06, impactPoint.z);
    wave.mesh.scale.set(0.1, 0.1, 0.1);
    wave.mesh.visible = true;
    wave.material.opacity = 1.0;

    // 3. Rolling Ground Dust (three.quarks flat floor emitter)
    const dustPs = this.dustPool[this.dustIndex];
    this.dustIndex = (this.dustIndex + 1) % this.dustPoolSize;

    // Position at floor contact
    dustPs.emitter.position.set(impactPoint.x, 0.08, impactPoint.z);
    // Orient flat against XZ floor plane so donut expands along ground
    dustPs.emitter.rotation.set(-Math.PI / 2, 0, 0);
    dustPs.restart();
  }

  public update(delta: number): void {
    // 1. Update Expanding Shockwaves
    for (const wave of this.shockwaves) {
      if (wave.active) {
        wave.timer += delta;
        const progress = Math.min(1.0, wave.timer / wave.duration);

        // Scale outward horizontally from ~0.1m to 5.6m
        const r = 0.1 + progress * (wave.maxRadius - 0.1);
        wave.mesh.scale.set(r, r, r);

        // Alpha fade 1.0 -> 0.0 over 0.2s
        wave.material.opacity = Math.max(0, 1.0 - progress);

        if (wave.timer >= wave.duration) {
          wave.active = false;
          wave.mesh.visible = false;
        }
      }
    }

    // 2. Update Active Decals (fade out and recycle)
    for (let i = this.activeDecals.length - 1; i >= 0; i--) {
      const item = this.activeDecals[i];
      item.timer += delta;
      if (item.timer >= item.duration) {
        this.scene.remove(item.mesh);
        item.mesh.geometry.dispose();
        item.material.dispose();
        this.activeDecals.splice(i, 1);
      } else if (item.timer > item.duration * 0.65) {
        const fade = 1.0 - (item.timer - item.duration * 0.65) / (item.duration * 0.35);
        item.material.opacity = Math.max(0, fade * 0.95);
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

  /**
   * Procedural soft shockwave gradient texture.
   */
  private createShockwaveTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      const data = new Uint8Array([255, 220, 160, 255]);
      return new THREE.DataTexture(data, 1, 1);
    }

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(0.65, 'rgba(255, 220, 160, 0.35)');
    grad.addColorStop(0.88, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(1, 'rgba(255, 180, 80, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  /**
   * Procedural soft smoke dust texture for three.quarks.
   */
  private createDustTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      const data = new Uint8Array([215, 200, 170, 255]);
      return new THREE.DataTexture(data, 1, 1);
    }

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(215, 200, 170, 0.85)');
    grad.addColorStop(0.35, 'rgba(180, 165, 135, 0.55)');
    grad.addColorStop(0.7, 'rgba(130, 120, 95, 0.2)');
    grad.addColorStop(1, 'rgba(80, 70, 55, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  public dispose(): void {
    for (const d of this.activeDecals) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      d.material.dispose();
    }
    this.activeDecals = [];

    for (const w of this.shockwaves) {
      this.scene.remove(w.mesh);
      w.mesh.geometry.dispose();
      w.material.dispose();
    }
    this.shockwaves = [];

    this.crackTexture.dispose();
    this.shockwaveTexture.dispose();
    this.dustTexture.dispose();
  }
}

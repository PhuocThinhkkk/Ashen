import * as THREE from 'three';
import System, {
  SpriteRenderer,
  Emitter,
  Rate,
  Span,
  Position,
  PointZone,
  Mass,
  Radius,
  Life,
  RadialVelocity,
  Vector3D,
  Alpha,
  Scale,
  Body,
} from 'three-nebula';

interface SparkParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

class SparkBurst {
  public active = false;
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private particles: SparkParticle[] = [];
  private readonly maxParticles = 28;

  constructor(scene: THREE.Scene, sparkTexture: THREE.Texture) {
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.28,
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
        size: 0.2,
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
      p.size = (isHeavy ? 0.35 : 0.22) * (0.8 + Math.random() * 0.6);

      // Radial cone velocity in the hit direction with high speed
      const speed = (isHeavy ? 8.5 : 5.5) + Math.random() * 5.0;
      const spreadX = (Math.random() - 0.5) * 1.6;
      const spreadY = (Math.random() - 0.2) * 1.4;
      const spreadZ = (Math.random() - 0.5) * 1.6;

      p.vel
        .copy(direction)
        .add(new THREE.Vector3(spreadX, spreadY, spreadZ))
        .normalize()
        .multiplyScalar(speed);
    }

    // Zero out unused
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
        p.vel.y -= 9.8 * delta * 0.5; // Mild gravity
        p.pos.addScaledVector(p.vel, delta);

        const progress = 1.0 - Math.max(0, p.life / p.maxLife);

        this.positions[i * 3] = p.pos.x;
        this.positions[i * 3 + 1] = p.pos.y;
        this.positions[i * 3 + 2] = p.pos.z;

        // Color ramp: Bright white core -> gold -> amber/crimson -> fade
        if (progress < 0.25) {
          this.colors[i * 3] = 1.0;
          this.colors[i * 3 + 1] = 0.95;
          this.colors[i * 3 + 2] = 0.8;
        } else if (progress < 0.65) {
          const t = (progress - 0.25) / 0.4;
          this.colors[i * 3] = 1.0;
          this.colors[i * 3 + 1] = 0.85 - t * 0.45;
          this.colors[i * 3 + 2] = 0.1;
        } else {
          const t = (progress - 0.65) / 0.35;
          this.colors[i * 3] = 0.8 - t * 0.6;
          this.colors[i * 3 + 1] = 0.2 - t * 0.2;
          this.colors[i * 3 + 2] = 0.05;
        }

        this.sizes[i] = p.size * (1.0 - progress * 0.8);
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

interface FlashingRecord {
  material: THREE.MeshStandardMaterial;
  origEmissive: THREE.Color;
  origIntensity: number;
  timer: number;
  duration: number;
  flashColor: THREE.Color;
  flashIntensity: number;
}

export class VFXSystem {
  private scene: THREE.Scene;
  private sparkTexture: THREE.Texture;
  private dustTexture: THREE.Texture;
  private sparkPool: SparkBurst[] = [];
  private flashingMaterials = new Map<THREE.MeshStandardMaterial, FlashingRecord>();
  private nebulaSystem: System | null = null;
  private nebulaRenderer: SpriteRenderer | null = null;
  private activeEmitters: Array<{ emitter: Emitter; timer: number }> = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sparkTexture = this.createSparkTexture();
    this.dustTexture = this.createDustTexture();

    // Pool of 8 spark bursts
    for (let i = 0; i < 8; i++) {
      this.sparkPool.push(new SparkBurst(this.scene, this.sparkTexture));
    }

    // Initialize Three Nebula particle system
    try {
      this.nebulaSystem = new System();
      this.nebulaRenderer = new SpriteRenderer(this.scene, THREE);
      this.nebulaSystem.addRenderer(this.nebulaRenderer);
    } catch (e) {
      console.warn('[VFXSystem] Optional Three-Nebula system init note:', e);
    }
  }

  /**
   * Spawns ground dust kick-up particles at feet bones transitioning from Airborne to Impact/Recovery.
   */
  public spawnFootDustKickup(position: THREE.Vector3, count = 10): void {
    if (!this.nebulaSystem) return;
    try {
      const dustSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.dustTexture,
          color: 0xcbb799,
          transparent: true,
          depthWrite: false,
        }),
      );
      const emitter = new Emitter();
      emitter
        .setRate(new Rate(new Span(count, count + 4), 0.01))
        .addInitializers([
          new Body(dustSprite),
          new Position(new PointZone(position.x, Math.max(0.04, position.y), position.z)),
          new Mass(1),
          new Radius(0.18),
          new Life(0.35),
          new RadialVelocity(new Span(1.2, 2.8), new Vector3D(0, 1, 0), 55),
        ])
        .addBehaviours([
          new Alpha(0.65, 0),
          new Scale(0.18, 0.85),
        ])
        .emit(1, 0.35);

      this.nebulaSystem.addEmitter(emitter);
      this.activeEmitters.push({ emitter, timer: 0.45 });
    } catch (err) {
      console.warn('[VFXSystem] spawnFootDustKickup error:', err);
    }
  }

  /**
   * Spawns peak velocity sparks at weapon/hand bone.
   */
  public spawnPeakVelocitySparks(origin: THREE.Vector3, count = 25, isHeavy = false): void {
    if (this.nebulaSystem) {
      try {
        const sparkSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.sparkTexture,
            color: isHeavy ? 0xff4400 : 0xffaa22,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
          }),
        );
        const emitter = new Emitter();
        emitter
          .setRate(new Rate(new Span(count, count + 6), 0.01))
          .addInitializers([
            new Body(sparkSprite),
            new Position(new PointZone(origin.x, origin.y, origin.z)),
            new Mass(1),
            new Radius(0.1),
            new Life(isHeavy ? 0.32 : 0.22),
            new RadialVelocity(new Span(isHeavy ? 4.5 : 3.0, isHeavy ? 8.5 : 6.0), new Vector3D(0, 1, 0), 160),
          ])
          .addBehaviours([
            new Alpha(1.0, 0),
            new Scale(isHeavy ? 0.32 : 0.2, 0.04),
          ])
          .emit(1, isHeavy ? 0.32 : 0.22);

        this.nebulaSystem.addEmitter(emitter);
        this.activeEmitters.push({ emitter, timer: isHeavy ? 0.42 : 0.32 });
      } catch (err) {
        console.warn('[VFXSystem] spawnPeakVelocitySparks error:', err);
      }
    }

    // Also emit pooled spark burst for maximum responsive visual pop
    this.spawnHitSparks(origin, new THREE.Vector3(0, 0.6, 0).normalize(), isHeavy);
  }

  /**
   * Spawns weapon trail emitter parented to bone/hand position.
   */
  public spawnWeaponTrail(bone: THREE.Object3D, duration = 0.15): void {
    if (!this.nebulaSystem) return;
    try {
      const worldPos = new THREE.Vector3();
      bone.getWorldPosition(worldPos);

      const trailSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.sparkTexture,
          color: 0xffeebb,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      );
      const emitter = new Emitter();
      emitter
        .setRate(new Rate(new Span(8, 12), 0.01))
        .addInitializers([
          new Body(trailSprite),
          new Position(new PointZone(worldPos.x, worldPos.y, worldPos.z)),
          new Mass(1),
          new Radius(0.12),
          new Life(duration),
          new RadialVelocity(new Span(0.5, 1.5), new Vector3D(0, 1, 0), 90),
        ])
        .addBehaviours([
          new Alpha(0.85, 0),
          new Scale(0.25, 0.02),
        ])
        .emit(1, duration);

      this.nebulaSystem.addEmitter(emitter);
      this.activeEmitters.push({ emitter, timer: duration + 0.1 });
    } catch (err) {
      console.warn('[VFXSystem] spawnWeaponTrail error:', err);
    }
  }

  /**
   * Spawns a high-energy hit spark burst at the impact contact point.
   */
  public spawnHitSparks(origin: THREE.Vector3, direction: THREE.Vector3, isHeavy = false): void {
    let burst = this.sparkPool.find((b) => !b.active);
    if (!burst) {
      burst = this.sparkPool[0]; // Recycle oldest
    }
    burst.emit(origin, direction, isHeavy);
  }

  /**
   * Emits brief visual flash feedback on a character's mesh materials upon receiving damage.
   */
  public triggerHitFlash(
    root: THREE.Object3D,
    isHeavy = false,
    flashColorHex = 0xffffff,
    duration = 0.12,
  ): void {
    const flashColor = new THREE.Color(flashColorHex);
    const flashIntensity = isHeavy ? 2.5 : 1.4;

    root.traverse((obj) => {
      // Exclude weapon models and hitboxes from character mesh flash
      if (obj.name.toLowerCase().includes('sword') || obj.name.toLowerCase().includes('hitbox')) {
        return;
      }

      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            let record = this.flashingMaterials.get(mat);
            if (!record) {
              record = {
                material: mat,
                origEmissive: mat.emissive.clone(),
                origIntensity: mat.emissiveIntensity,
                timer: duration,
                duration,
                flashColor,
                flashIntensity,
              };
              this.flashingMaterials.set(mat, record);
            } else {
              record.timer = duration;
              record.duration = duration;
              record.flashColor = flashColor;
              record.flashIntensity = flashIntensity;
            }

            mat.emissive.copy(flashColor);
            mat.emissiveIntensity = flashIntensity;
          }
        }
      }
    });
  }

  public update(delta: number): void {
    // 1. Update Spark Bursts
    for (const burst of this.sparkPool) {
      if (burst.active) {
        burst.update(delta);
      }
    }

    // 2. Update Mesh Hit Flashes
    for (const [mat, record] of this.flashingMaterials.entries()) {
      record.timer -= delta;
      if (record.timer <= 0) {
        // Restore original emissive properties
        mat.emissive.copy(record.origEmissive);
        mat.emissiveIntensity = record.origIntensity;
        this.flashingMaterials.delete(mat);
      } else {
        // Smooth fade-out to original emissive
        const t = record.timer / record.duration;
        mat.emissive.lerpColors(record.origEmissive, record.flashColor, t);
        mat.emissiveIntensity = record.origIntensity + (record.flashIntensity - record.origIntensity) * t;
      }
    }

    // 3. Update Active Nebula Emitters
    for (let i = this.activeEmitters.length - 1; i >= 0; i--) {
      const item = this.activeEmitters[i];
      item.timer -= delta;
      if (item.timer <= 0) {
        if (this.nebulaSystem) {
          try {
            this.nebulaSystem.removeEmitter(item.emitter);
            item.emitter.destroy();
          } catch {
            // Safe catch
          }
        }
        this.activeEmitters.splice(i, 1);
      }
    }

    // 4. Update Nebula System
    if (this.nebulaSystem) {
      try {
        this.nebulaSystem.update(delta);
      } catch {
        // Safe catch for tab blur / delta spikes
      }
    }
  }

  /**
   * Generates a procedural radial circular glow spark texture in memory.
   */
  private createSparkTexture(): THREE.Texture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.2, 'rgba(255, 240, 180, 0.9)');
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
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(216, 202, 168, 0.8)');
    grad.addColorStop(0.35, 'rgba(180, 165, 135, 0.45)');
    grad.addColorStop(0.7, 'rgba(120, 110, 90, 0.15)');
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
    this.sparkTexture.dispose();
    this.dustTexture.dispose();
    for (const [mat, record] of this.flashingMaterials.entries()) {
      mat.emissive.copy(record.origEmissive);
      mat.emissiveIntensity = record.origIntensity;
    }
    this.flashingMaterials.clear();
    for (const item of this.activeEmitters) {
      if (this.nebulaSystem) {
        try {
          this.nebulaSystem.removeEmitter(item.emitter);
          item.emitter.destroy();
        } catch {
          // Safe catch
        }
      }
    }
    this.activeEmitters = [];
    this.nebulaSystem?.destroy();
  }
}

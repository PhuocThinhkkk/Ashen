import * as THREE from 'three';

/**
 * Singleton factory for loading or procedurally generating VFX textures.
 * Uses cached textures and provides seamless canvas/DataTexture fallbacks for headless/SSR test runs.
 */
export class VFXTextureFactory {
  private static instance: VFXTextureFactory;
  private cache: Map<string, THREE.Texture> = new Map();

  private constructor() {}

  public static getInstance(): VFXTextureFactory {
    if (!VFXTextureFactory.instance) {
      VFXTextureFactory.instance = new VFXTextureFactory();
    }
    return VFXTextureFactory.instance;
  }

  public getSmokeTexture(): THREE.Texture {
    return this.getOrCreate('smoke_soft', '/textures/vfx/smoke_soft.png', () =>
      this.createSmokeCanvasTexture(),
    );
  }

  public getDropletStreakTexture(): THREE.Texture {
    return this.getOrCreate('droplet_streak', '/textures/vfx/droplet_streak.png', () =>
      this.createDropletCanvasTexture(),
    );
  }

  public getBloodSplatTexture(): THREE.Texture {
    return this.getOrCreate('blood_splat_1', '/textures/vfx/blood_splat_1.png', () =>
      this.createBloodSplatCanvasTexture(),
    );
  }

  public getBloodParticleTexture(): THREE.Texture {
    return this.getOrCreate('blood_particle', '/textures/vfx/blood_particle.png', () =>
      this.createBloodParticleCanvasTexture(),
    );
  }

  public getSparkStreakTexture(): THREE.Texture {
    return this.getOrCreate('spark_streak', '/textures/vfx/spark_streak.png', () =>
      this.createSparkCanvasTexture(),
    );
  }

  public getShockwaveRingTexture(): THREE.Texture {
    return this.getOrCreate('shockwave_ring', '/textures/vfx/shockwave_ring.png', () =>
      this.createShockwaveCanvasTexture(),
    );
  }

  private getOrCreate(
    key: string,
    url: string,
    proceduralFallback: () => THREE.Texture,
  ): THREE.Texture {
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // In browser with image loading support, load the CC0 PNG asset directly via TextureLoader
    if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
      const loader = new THREE.TextureLoader();
      const tex = loader.load(url);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      this.cache.set(key, tex);
      return tex;
    }

    // Node / SSR / headless test fallback
    const fallback = proceduralFallback();
    fallback.minFilter = THREE.LinearFilter;
    fallback.magFilter = THREE.LinearFilter;
    fallback.generateMipmaps = false;
    this.cache.set(key, fallback);
    return fallback;
  }

  private createSmokeCanvasTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      return new THREE.DataTexture(new Uint8Array([220, 220, 220, 255]), 1, 1);
    }
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.48);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.35, 'rgba(220, 220, 220, 0.65)');
    grad.addColorStop(0.7, 'rgba(160, 160, 160, 0.22)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  private createBloodParticleCanvasTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      return new THREE.DataTexture(new Uint8Array([220, 15, 15, 255]), 1, 1);
    }
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2;
    const cy = size / 2;

    const grad = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.45);
    grad.addColorStop(0, 'rgba(230, 20, 20, 1.0)');
    grad.addColorStop(0.7, 'rgba(180, 10, 10, 0.95)');
    grad.addColorStop(0.9, 'rgba(120, 5, 5, 0.5)');
    grad.addColorStop(1, 'rgba(80, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  private createDropletCanvasTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      return new THREE.DataTexture(new Uint8Array([200, 10, 10, 255]), 1, 1);
    }
    const width = 64;
    const height = 128;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const cx = width / 2;
    const grad = ctx.createRadialGradient(cx, height * 0.7, 0, cx, height * 0.7, width * 0.45);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.5, 'rgba(230, 230, 230, 0.75)');
    grad.addColorStop(1, 'rgba(200, 200, 200, 0.0)');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(cx, 8);
    ctx.quadraticCurveTo(width * 0.9, height * 0.65, cx, height * 0.92);
    ctx.quadraticCurveTo(width * 0.1, height * 0.65, cx, 8);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  private createBloodSplatCanvasTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      return new THREE.DataTexture(new Uint8Array([140, 5, 5, 255]), 1, 1);
    }
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2;
    const cy = size / 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
    ctx.fill();

    const numDrops = 14;
    for (let i = 0; i < numDrops; i++) {
      const angle = (i / numDrops) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const r = size * (0.2 + Math.random() * 0.24);
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      const dropRadius = 2 + Math.random() * 6;
      ctx.beginPath();
      ctx.arc(px, py, dropRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  private createSparkCanvasTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      return new THREE.DataTexture(new Uint8Array([255, 240, 180, 255]), 1, 1);
    }
    const width = 32;
    const height = 128;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const cx = width / 2;
    const cy = height / 2;

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, 4);
    ctx.lineTo(width * 0.75, cy);
    ctx.lineTo(cx, height - 4);
    ctx.lineTo(width * 0.25, cy);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  private createShockwaveCanvasTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      return new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    }
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2;
    const cy = size / 2;

    const grad = ctx.createRadialGradient(cx, cy, size * 0.2, cx, cy, size * 0.48);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.3)');
    grad.addColorStop(0.85, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  public dispose(): void {
    for (const tex of this.cache.values()) {
      tex.dispose();
    }
    this.cache.clear();
  }
}

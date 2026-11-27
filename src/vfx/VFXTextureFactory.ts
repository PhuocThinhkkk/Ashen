import * as THREE from 'three';
import { ProceduralTextureGenerator } from './procedural/proceduralTextures';
import { getAssetUrl } from '../utils/assetPath';

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
    return this.getOrCreate('smoke_soft', getAssetUrl('textures/vfx/smoke_soft.png'), () =>
      this.createSmokeCanvasTexture(),
    );
  }

  public getDropletStreakTexture(): THREE.Texture {
    return this.getOrCreate('droplet_streak', getAssetUrl('textures/vfx/droplet_streak.png'), () =>
      this.createDropletCanvasTexture(),
    );
  }

  public getBloodSplatTexture(): THREE.Texture {
    return this.getOrCreate('blood_splat_1', getAssetUrl('textures/vfx/blood_splat_1.png'), () =>
      this.createBloodSplatCanvasTexture(),
    );
  }

  public getBloodParticleTexture(): THREE.Texture {
    return this.getOrCreate('blood_particle', getAssetUrl('textures/vfx/blood_particle.png'), () =>
      this.createBloodParticleCanvasTexture(),
    );
  }

  public getSparkStreakTexture(): THREE.Texture {
    return this.getOrCreate('spark_streak', getAssetUrl('textures/vfx/spark_streak.png'), () =>
      this.createSparkCanvasTexture(),
    );
  }

  public getShockwaveRingTexture(): THREE.Texture {
    return this.getOrCreate('shockwave_ring', getAssetUrl('textures/vfx/shockwave_ring.png'), () =>
      this.createShockwaveCanvasTexture(),
    );
  }

  public getEstusGlowTexture(): THREE.Texture {
    return this.getOrCreate('estus_glow', getAssetUrl('textures/vfx/estus_glow.png'), () =>
      this.createSparkCanvasTexture(),
    );
  }

  public getEstusFlareTexture(): THREE.Texture {
    return this.getOrCreate('estus_flare', getAssetUrl('textures/vfx/estus_flare.png'), () =>
      this.createSparkCanvasTexture(),
    );
  }

  public getEstusRuneTexture(): THREE.Texture {
    return this.getOrCreate('estus_rune', getAssetUrl('textures/vfx/estus_rune.png'), () =>
      this.createShockwaveCanvasTexture(),
    );
  }

  public getEstusEmberTexture(): THREE.Texture {
    return this.getOrCreate('estus_ember', getAssetUrl('textures/vfx/estus_ember.png'), () =>
      this.createSparkCanvasTexture(),
    );
  }

  public getEstusWispTexture(): THREE.Texture {
    return this.getOrCreate('estus_wisp', getAssetUrl('textures/vfx/estus_wisp.png'), () =>
      this.createSmokeCanvasTexture(),
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
    return ProceduralTextureGenerator.createSmokeTexture();
  }

  private createBloodParticleCanvasTexture(): THREE.Texture {
    return ProceduralTextureGenerator.createBloodParticleTexture();
  }

  private createDropletCanvasTexture(): THREE.Texture {
    return ProceduralTextureGenerator.createDropletTexture();
  }

  private createBloodSplatCanvasTexture(): THREE.Texture {
    return ProceduralTextureGenerator.createBloodSplatTexture();
  }

  private createSparkCanvasTexture(): THREE.Texture {
    return ProceduralTextureGenerator.createSparkTexture();
  }

  private createShockwaveCanvasTexture(): THREE.Texture {
    return ProceduralTextureGenerator.createShockwaveTexture();
  }

  public dispose(): void {
    for (const tex of this.cache.values()) {
      tex.dispose();
    }
    this.cache.clear();
  }
}

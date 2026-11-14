import * as THREE from 'three';
import { SettingsManager } from '../systems/SettingsManager';

export interface ArenaConfig {
  radius: number;
}

/**
 * Open flat plain arena designed for clean VFX visibility and unobstructed combat.
 * Replaces high raised dais and pillars with an expansive grounded terrain.
 */
export class Arena {
  public readonly group = new THREE.Group();
  public readonly radius: number;
  public floorMesh!: THREE.Mesh;
  private readonly particleSystem: THREE.Points;
  private floorTexture?: THREE.CanvasTexture;
  private floorNormal?: THREE.CanvasTexture;

  constructor(config: ArenaConfig = { radius: 21.0 }) {
    this.radius = config.radius;
    this.buildFlatPlain();
    this.particleSystem = this.buildAmbientDust();
    this.group.add(this.particleSystem);
  }

  private buildFlatPlain(): void {
    // 1. Procedural Earthy Ground Texture
    this.floorTexture = this.createPlainTexture();
    this.floorNormal = this.createPlainNormal();

    this.floorTexture.wrapS = THREE.RepeatWrapping;
    this.floorTexture.wrapT = THREE.RepeatWrapping;
    this.floorTexture.repeat.set(24, 24);

    this.floorNormal.wrapS = THREE.RepeatWrapping;
    this.floorNormal.wrapT = THREE.RepeatWrapping;
    this.floorNormal.repeat.set(24, 24);

    // Wide flat plain ground at y = 0
    const floorGeo = new THREE.PlaneGeometry(120, 120, 2, 2);
    floorGeo.rotateX(-Math.PI / 2);

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x463f35,
      roughness: 0.92,
      metalness: 0.04,
      map: this.floorTexture,
      normalMap: this.floorNormal,
      normalScale: new THREE.Vector2(0.5, 0.5),
    });

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.floorMesh = floor;
    this.group.add(floor);

    // Subtle arena boundary ring (flat on floor, visually marking the combat zone)
    const boundaryGeo = new THREE.RingGeometry(this.radius - 0.15, this.radius + 0.15, 64);
    boundaryGeo.rotateX(-Math.PI / 2);
    const boundaryMat = new THREE.MeshBasicMaterial({
      color: 0x6e604d,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const boundary = new THREE.Mesh(boundaryGeo, boundaryMat);
    boundary.position.y = 0.01;
    this.group.add(boundary);
  }

  private buildAmbientDust(): THREE.Points {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const r = Math.random() * (this.radius - 1);
      const theta = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = 0.2 + Math.random() * 4.0;
      positions[i * 3 + 2] = Math.sin(theta) * r;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xd4a373,
      size: 0.06,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return new THREE.Points(geo, mat);
  }

  public update(delta: number, _elapsed: number): void {
    const arenaDustEnabled = SettingsManager.getInstance().data.vfx.arenaDust;
    this.particleSystem.visible = arenaDustEnabled;

    if (arenaDustEnabled) {
      const posAttr = this.particleSystem.geometry.attributes.position as THREE.BufferAttribute;
      const array = posAttr.array as Float32Array;
      for (let i = 0; i < array.length; i += 3) {
        array[i + 1] += delta * 0.35;
        if (array[i + 1] > 4.5) {
          array[i + 1] = 0.2;
        }
      }
      posAttr.needsUpdate = true;
    }
  }

  public clampToArena(position: THREE.Vector3, entityRadius = 0.6): boolean {
    const maxR = this.radius - entityRadius - 0.5;
    const distSq = position.x * position.x + position.z * position.z;
    if (distSq > maxR * maxR) {
      const dist = Math.sqrt(distSq);
      position.x = (position.x / dist) * maxR;
      position.z = (position.z / dist) * maxR;
      return true;
    }
    return false;
  }

  private createPlainTexture(): THREE.CanvasTexture {
    if (typeof document === 'undefined') {
      const data = new Uint8Array([70, 63, 53, 255]);
      return new THREE.DataTexture(data, 1, 1) as unknown as THREE.CanvasTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Base earthy dirt & stone tone
    ctx.fillStyle = '#3a332a';
    ctx.fillRect(0, 0, 512, 512);

    // Natural soil & rock speckling
    for (let i = 0; i < 3000; i++) {
      const px = Math.random() * 512;
      const py = Math.random() * 512;
      const shade = Math.floor(Math.random() * 30 - 15);
      const r = Math.min(255, Math.max(0, 65 + shade));
      const g = Math.min(255, Math.max(0, 58 + shade));
      const b = Math.min(255, Math.max(0, 48 + shade));
      const radius = 1 + Math.random() * 2.5;

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Coarse gravel grains
    for (let i = 0; i < 1500; i++) {
      const px = Math.random() * 512;
      const py = Math.random() * 512;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(90, 80, 68, 0.4)' : 'rgba(25, 20, 15, 0.5)';
      ctx.fillRect(px, py, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  private createPlainNormal(): THREE.CanvasTexture {
    if (typeof document === 'undefined') {
      const data = new Uint8Array([128, 128, 255, 255]);
      return new THREE.DataTexture(data, 1, 1) as unknown as THREE.CanvasTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 1200; i++) {
      const px = Math.random() * 256;
      const py = Math.random() * 256;
      const nx = Math.floor(128 + (Math.random() - 0.5) * 40);
      const ny = Math.floor(128 + (Math.random() - 0.5) * 40);
      ctx.fillStyle = `rgb(${nx},${ny},255)`;
      ctx.fillRect(px, py, 2, 2);
    }

    return new THREE.CanvasTexture(canvas);
  }

  public dispose(): void {
    if (this.floorTexture) this.floorTexture.dispose();
    if (this.floorNormal) this.floorNormal.dispose();

    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}

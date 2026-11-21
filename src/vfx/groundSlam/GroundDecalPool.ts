import * as THREE from 'three';

export interface PooledDecal {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  timer: number;
  duration: number;
}

export class GroundDecalPool {
  private decalPool: PooledDecal[] = [];
  private decalIndex = 0;
  private readonly maxDecals: number;
  private decalGeometry: THREE.BufferGeometry;
  private crackTexture: THREE.Texture;

  constructor(private scene: THREE.Scene, maxDecals = 6) {
    this.maxDecals = maxDecals;
    this.crackTexture = this.createCrackTexture();

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
  }

  public spawn(position: THREE.Vector3, randomRotation = true): void {
    const decal = this.decalPool[this.decalIndex];
    this.decalIndex = (this.decalIndex + 1) % this.maxDecals;

    decal.active = true;
    decal.timer = 0;
    decal.mesh.position.set(position.x, 0.015, position.z);
    decal.mesh.rotation.y = randomRotation ? Math.random() * Math.PI * 2 : 0;
    decal.material.opacity = 0.95;
    decal.mesh.visible = true;
  }

  public update(delta: number): void {
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

  public getActiveCount(): number {
    return this.decalPool.filter((d) => d.active).length;
  }

  public dispose(): void {
    for (const decal of this.decalPool) {
      this.scene.remove(decal.mesh);
      decal.material.dispose();
    }
    this.decalGeometry.dispose();
    this.crackTexture.dispose();
    this.decalPool = [];
  }

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
      const r = size * 0.1 * (0.7 + Math.random() * 0.6);
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Radiating fissures
    ctx.strokeStyle = 'rgba(12, 8, 8, 0.9)';
    ctx.lineWidth = 3.5;
    const fissureCount = 8;
    for (let f = 0; f < fissureCount; f++) {
      const baseAngle = (f / fissureCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      let curX = cx;
      let curY = cy;
      ctx.beginPath();
      ctx.moveTo(curX, curY);

      const segments = 4;
      for (let s = 1; s <= segments; s++) {
        const segDist = (size * 0.38 * s) / segments;
        const angleJitter = baseAngle + (Math.random() - 0.5) * 0.5;
        curX = cx + Math.cos(angleJitter) * segDist;
        curY = cy + Math.sin(angleJitter) * segDist;
        ctx.lineTo(curX, curY);
      }
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }
}

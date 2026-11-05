import * as THREE from 'three';
import { SettingsManager } from '../systems/SettingsManager';

export interface ArenaConfig {
  radius: number;
}

export class Arena {
  public readonly group = new THREE.Group();
  public readonly radius: number;
  public floorMesh!: THREE.Mesh;
  private readonly brazierLights: THREE.PointLight[] = [];
  private readonly brazierEmbers: THREE.Mesh[] = [];
  private readonly particleSystem: THREE.Points;

  constructor(config: ArenaConfig = { radius: 21.0 }) {
    this.radius = config.radius;
    this.buildSanctuary();
    this.particleSystem = this.buildDustParticles();
    this.group.add(this.particleSystem);
  }

  private buildSanctuary(): void {
    // 1. Procedural Stone Texture for the Arena Floor
    const stoneTex = this.createStoneTexture();
    const stoneNormal = this.createStoneNormal();

    stoneTex.wrapS = THREE.RepeatWrapping;
    stoneTex.wrapT = THREE.RepeatWrapping;
    stoneTex.repeat.set(16, 16);

    stoneNormal.wrapS = THREE.RepeatWrapping;
    stoneNormal.wrapT = THREE.RepeatWrapping;
    stoneNormal.repeat.set(16, 16);

    // Main floor
    const floorGeo = new THREE.CylinderGeometry(this.radius + 1.5, this.radius + 2.0, 1.0, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2e3644,
      roughness: 0.82,
      metalness: 0.12,
      map: stoneTex,
      normalMap: stoneNormal,
      normalScale: new THREE.Vector2(0.6, 0.6),
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    this.floorMesh = floor;
    this.group.add(floor);

    // Inner ritual ring (central dais)
    const daisGeo = new THREE.CylinderGeometry(6.5, 6.8, 0.12, 32);
    const daisMat = new THREE.MeshStandardMaterial({
      color: 0x3d4858,
      roughness: 0.75,
      metalness: 0.18,
      map: stoneTex,
    });
    const dais = new THREE.Mesh(daisGeo, daisMat);
    dais.position.y = 0.06;
    dais.receiveShadow = true;
    this.group.add(dais);

    // Center emblem disk
    const centerEmblemGeo = new THREE.RingGeometry(1.2, 3.8, 32);
    const centerMat = new THREE.MeshStandardMaterial({
      color: 0x4f5d72,
      roughness: 0.65,
      metalness: 0.35,
      side: THREE.DoubleSide,
    });
    const centerEmblem = new THREE.Mesh(centerEmblemGeo, centerMat);
    centerEmblem.rotation.x = -Math.PI / 2;
    centerEmblem.position.y = 0.13;
    centerEmblem.receiveShadow = true;
    this.group.add(centerEmblem);

    // 2. Outer Gothic Pillars and Wall Arc
    const numPillars = 16;
    const pillarRadius = this.radius;
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x3a4555,
      roughness: 0.88,
      metalness: 0.08,
      map: stoneTex,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x262e3a,
      roughness: 0.92,
      metalness: 0.05,
    });

    for (let i = 0; i < numPillars; i++) {
      const angle = (i / numPillars) * Math.PI * 2;
      const x = Math.cos(angle) * pillarRadius;
      const z = Math.sin(angle) * pillarRadius;

      // Compound Pillar
      const pillarGroup = new THREE.Group();
      pillarGroup.position.set(x, 0, z);
      pillarGroup.rotation.y = -angle;

      // Base pedestal
      const baseGeo = new THREE.BoxGeometry(1.8, 1.2, 1.8);
      const baseMesh = new THREE.Mesh(baseGeo, accentMat);
      baseMesh.position.y = 0.6;
      baseMesh.castShadow = false;
      baseMesh.receiveShadow = true;
      pillarGroup.add(baseMesh);

      // Main Column Shaft
      const shaftGeo = new THREE.CylinderGeometry(0.65, 0.72, 7.5, 12);
      const shaftMesh = new THREE.Mesh(shaftGeo, pillarMat);
      shaftMesh.position.y = 4.8;
      shaftMesh.castShadow = false;
      shaftMesh.receiveShadow = true;
      pillarGroup.add(shaftMesh);

      // Capital / Arch Spire top
      const capGeo = new THREE.BoxGeometry(1.6, 0.9, 1.6);
      const capMesh = new THREE.Mesh(capGeo, accentMat);
      capMesh.position.y = 8.8;
      capMesh.castShadow = false;
      pillarGroup.add(capMesh);

      const spireGeo = new THREE.ConeGeometry(0.8, 2.2, 8);
      const spireMesh = new THREE.Mesh(spireGeo, accentMat);
      spireMesh.position.y = 10.1;
      spireMesh.castShadow = false;
      pillarGroup.add(spireMesh);

      this.group.add(pillarGroup);

      // Wall segment connecting to next pillar
      const nextAngle = ((i + 1) / numPillars) * Math.PI * 2;
      const midAngle = (angle + nextAngle) / 2;
      const midX = Math.cos(midAngle) * pillarRadius;
      const midZ = Math.sin(midAngle) * pillarRadius;
      const wallDist = 2 * pillarRadius * Math.sin(Math.PI / numPillars);

      const wallGeo = new THREE.BoxGeometry(wallDist - 0.4, 2.2, 0.7);
      const wallMesh = new THREE.Mesh(wallGeo, pillarMat);
      wallMesh.position.set(midX, 1.1, midZ);
      wallMesh.rotation.y = -midAngle + Math.PI / 2;
      wallMesh.castShadow = false;
      wallMesh.receiveShadow = true;
      this.group.add(wallMesh);
    }

    // 3. Four Fire Braziers at Cardinal/Diagonal Points
    const brazierAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    const brazierDist = this.radius * 0.75;
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.5,
      metalness: 0.85,
    });
    const emberMat = new THREE.MeshBasicMaterial({
      color: 0xff6611,
    });

    for (let i = 0; i < brazierAngles.length; i++) {
      const angle = brazierAngles[i];
      const bx = Math.cos(angle) * brazierDist;
      const bz = Math.sin(angle) * brazierDist;

      const brazierGroup = new THREE.Group();
      brazierGroup.position.set(bx, 0, bz);

      // Stone plinth
      const plinthGeo = new THREE.CylinderGeometry(0.9, 1.1, 0.6, 8);
      const plinthMesh = new THREE.Mesh(plinthGeo, pillarMat);
      plinthMesh.position.y = 0.3;
      plinthMesh.castShadow = false;
      plinthMesh.receiveShadow = true;
      brazierGroup.add(plinthMesh);

      // Iron bowl
      const bowlGeo = new THREE.CylinderGeometry(0.85, 0.4, 0.5, 12, 1, true);
      const bowlMesh = new THREE.Mesh(bowlGeo, ironMat);
      bowlMesh.position.y = 0.85;
      bowlMesh.castShadow = false;
      brazierGroup.add(bowlMesh);

      // Glowing coals
      const emberGeo = new THREE.SphereGeometry(0.5, 8, 8);
      const emberMesh = new THREE.Mesh(emberGeo, emberMat);
      emberMesh.position.y = 0.9;
      brazierGroup.add(emberMesh);
      this.brazierEmbers.push(emberMesh);

      // Warm Fire Point Light
      const fireLight = new THREE.PointLight(0xff7722, 3.2, 24, 1.2);
      fireLight.position.set(0, 1.5, 0);
      fireLight.castShadow = false; // keep draw calls light on mobile/low-end
      brazierGroup.add(fireLight);
      this.brazierLights.push(fireLight);

      this.group.add(brazierGroup);
    }
  }

  private buildDustParticles(): THREE.Points {
    const count = 160;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const r = Math.random() * (this.radius - 1);
      const theta = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = 0.2 + Math.random() * 6.0;
      positions[i * 3 + 2] = Math.sin(theta) * r;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffaa44,
      size: 0.08,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return new THREE.Points(geo, mat);
  }

  public update(delta: number, elapsed: number): void {
    // Subtle fire flicker
    for (let i = 0; i < this.brazierLights.length; i++) {
      const light = this.brazierLights[i];
      const noise = Math.sin(elapsed * 7.5 + i * 2.3) * 0.25 + Math.cos(elapsed * 13.0 + i) * 0.15;
      light.intensity = 1.6 + noise;
    }

    // Slowly drift dust/ember particles upward if enabled
    const arenaDustEnabled = SettingsManager.getInstance().data.vfx.arenaDust;
    this.particleSystem.visible = arenaDustEnabled;

    if (arenaDustEnabled) {
      const posAttr = this.particleSystem.geometry.attributes.position as THREE.BufferAttribute;
      const array = posAttr.array as Float32Array;
      for (let i = 0; i < array.length; i += 3) {
        array[i + 1] += delta * 0.45;
        if (array[i + 1] > 6.5) {
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

  private createStoneTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Base dark slate
    ctx.fillStyle = '#20252c';
    ctx.fillRect(0, 0, 512, 512);

    // Stone tile grid
    const tileSize = 64;
    ctx.strokeStyle = '#14171c';
    ctx.lineWidth = 3;

    for (let y = 0; y < 512; y += tileSize) {
      for (let x = 0; x < 512; x += tileSize) {
        const offset = ((y / tileSize) % 2) * (tileSize / 2);
        const tileX = (x + offset) % 512;
        const shade = Math.floor(Math.random() * 25 - 12);
        const r = Math.min(255, Math.max(0, 34 + shade));
        const g = Math.min(255, Math.max(0, 40 + shade));
        const b = Math.min(255, Math.max(0, 48 + shade));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(tileX, y, tileSize - 2, tileSize - 2);
        ctx.strokeRect(tileX, y, tileSize - 2, tileSize - 2);
      }
    }

    // Weathering speckles
    for (let i = 0; i < 2400; i++) {
      const px = Math.random() * 512;
      const py = Math.random() * 512;
      const alpha = Math.random() * 0.18;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
      ctx.fillRect(px, py, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  private createStoneNormal(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#8080ff'; // Flat normal
    ctx.fillRect(0, 0, 256, 256);

    const tileSize = 32;
    ctx.strokeStyle = '#6060c0';
    ctx.lineWidth = 2;
    for (let y = 0; y < 256; y += tileSize) {
      for (let x = 0; x < 256; x += tileSize) {
        ctx.strokeRect(x, y, tileSize, tileSize);
      }
    }

    return new THREE.CanvasTexture(canvas);
  }

  public dispose(): void {
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

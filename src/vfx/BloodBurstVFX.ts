import * as THREE from 'three';
import type { BatchedRenderer } from 'three.quarks';
import { VFXTextureFactory } from './VFXTextureFactory';
import WHIP_VERTEX_SHADER from './shaders/bloodWhip.vert.glsl?raw';
import WHIP_FRAGMENT_SHADER from './shaders/bloodWhip.frag.glsl?raw';
import FLIPBOOK_VERTEX_SHADER from './shaders/bloodFlipbook.vert.glsl?raw';
import FLIPBOOK_FRAGMENT_SHADER from './shaders/bloodFlipbook.frag.glsl?raw';

function createWhipGeometry(length = 1.55, width = 0.22, segmentsX = 24): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let plane = 0; plane < 2; plane++) {
    const isXZ = plane === 1;
    const baseOffset = positions.length / 3;

    for (let i = 0; i <= segmentsX; i++) {
      const u = i / segmentsX;
      const x = u * length;
      const w = width * 0.5;

      if (!isXZ) {
        positions.push(x, w, 0, x, -w, 0);
      } else {
        positions.push(x, 0, w, x, 0, -w);
      }
      uvs.push(u, 1.0, u, 0.0);
    }

    for (let i = 0; i < segmentsX; i++) {
      const b = baseOffset + i * 2;
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

interface BloodVfxInstance {
  whipMesh: THREE.Mesh;
  whipMaterial: THREE.ShaderMaterial;
  quadMesh: THREE.Mesh;
  quadMaterial: THREE.ShaderMaterial;
  active: boolean;
  timer: number;
  duration: number;
}

/**
 * Directional Liquid Whip & Camera-Aligned Billboard Quad Flesh-Hit VFX.
 * Eliminates GPU buffer streaming (gl.bufferSubData) by utilizing pre-allocated
 * static meshes and GPU uniform-driven UV animation.
 */
export class BloodBurstVFX {
  private pool: BloodVfxInstance[] = [];
  private readonly poolSize = 8;
  private currentIndex = 0;
  private scene: THREE.Scene;

  // Pre-allocated static geometries
  private whipGeometry: THREE.BufferGeometry;
  private quadGeometry: THREE.PlaneGeometry;

  // Static scratch math objects (Zero runtime GC allocations)
  private readonly scratchForwardX = new THREE.Vector3(1, 0, 0);
  private readonly scratchDir = new THREE.Vector3();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly scratchPos = new THREE.Vector3();

  constructor(_batchRenderer?: BatchedRenderer, sceneOrContainer?: THREE.Object3D) {
    this.scene = (sceneOrContainer as THREE.Scene) || new THREE.Scene();
    const texFactory = VFXTextureFactory.getInstance();
    const bloodTexture = texFactory.getBloodSplatTexture();

    this.whipGeometry = createWhipGeometry(1.55, 0.22, 24);
    this.quadGeometry = new THREE.PlaneGeometry(1, 1);

    for (let i = 0; i < this.poolSize; i++) {
      // 1. Directional Liquid Whip Mesh (Deforms along slash vector)
      const whipMat = new THREE.ShaderMaterial({
        vertexShader: WHIP_VERTEX_SHADER,
        fragmentShader: WHIP_FRAGMENT_SHADER,
        uniforms: { uProgress: { value: 0.0 } },
        transparent: true,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const whipMesh = new THREE.Mesh(this.whipGeometry, whipMat);
      whipMesh.visible = false;
      whipMesh.frustumCulled = false;
      this.scene.add(whipMesh);

      // 2. Camera-Aligned Billboard Quad (Zero buffer updates, animated via uProgress)
      const quadMat = new THREE.ShaderMaterial({
        vertexShader: FLIPBOOK_VERTEX_SHADER,
        fragmentShader: FLIPBOOK_FRAGMENT_SHADER,
        uniforms: {
          uTexture: { value: bloodTexture },
          uProgress: { value: 0.0 },
          uGrid: { value: new THREE.Vector2(1.0, 1.0) }, // Single 1920x1920 pre-colored blood splat image
          uSize: { value: 1.1 },
        },
        transparent: true,
        blending: THREE.NormalBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const quadMesh = new THREE.Mesh(this.quadGeometry, quadMat);
      quadMesh.visible = false;
      quadMesh.frustumCulled = false;
      this.scene.add(quadMesh);

      this.pool.push({
        whipMesh,
        whipMaterial: whipMat,
        quadMesh,
        quadMaterial: quadMat,
        active: false,
        timer: 0,
        duration: 0.32,
      });
    }
  }

  /**
   * Triggers the zero-buffer-upload directional whip and billboard burst.
   */
  public emit(
    contactPoint: THREE.Vector3 | { x: number; y: number; z: number },
    hitDirection: THREE.Vector3 | { x: number; y: number; z: number },
    isHeavy = false,
  ): void {
    const burst = this.pool[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.poolSize;

    this.scratchPos.set(contactPoint.x, contactPoint.y, contactPoint.z);
    this.scratchDir.set(hitDirection.x, hitDirection.y, hitDirection.z).normalize();
    this.scratchQuat.setFromUnitVectors(this.scratchForwardX, this.scratchDir);

    const scale = isHeavy ? 1.4 : 1.0;
    const duration = isHeavy ? 0.38 : 0.30;

    // 1. Activate Liquid Whip
    burst.whipMesh.position.copy(this.scratchPos);
    burst.whipMesh.quaternion.copy(this.scratchQuat);
    burst.whipMesh.scale.set(scale, scale, scale);
    burst.whipMaterial.uniforms.uProgress.value = 0.0;
    burst.whipMesh.visible = true;

    // 2. Activate Billboard Quad
    burst.quadMesh.position.copy(this.scratchPos);
    burst.quadMaterial.uniforms.uProgress.value = 0.0;
    burst.quadMaterial.uniforms.uSize.value = isHeavy ? 1.5 : 1.1;
    burst.quadMesh.visible = true;

    burst.active = true;
    burst.timer = 0;
    burst.duration = duration;
  }

  public update(delta: number): void {
    for (let i = 0; i < this.poolSize; i++) {
      const b = this.pool[i];
      if (b.active) {
        b.timer += delta;
        const progress = Math.min(1.0, b.timer / b.duration);

        // Update uniforms only — zero vertex buffer transfers to GPU!
        b.whipMaterial.uniforms.uProgress.value = progress;
        b.quadMaterial.uniforms.uProgress.value = progress;

        if (progress >= 1.0) {
          b.active = false;
          b.whipMesh.visible = false;
          b.quadMesh.visible = false;
        }
      }
    }
  }

  public reset(): void {
    for (const b of this.pool) {
      b.active = false;
      b.whipMesh.visible = false;
      b.quadMesh.visible = false;
      b.timer = 0;
      b.whipMaterial.uniforms.uProgress.value = 0.0;
      b.quadMaterial.uniforms.uProgress.value = 0.0;
    }
    this.currentIndex = 0;
  }

  public dispose(): void {
    for (const b of this.pool) {
      this.scene.remove(b.whipMesh);
      this.scene.remove(b.quadMesh);
      b.whipMaterial.dispose();
      b.quadMaterial.dispose();
    }
    this.whipGeometry.dispose();
    this.quadGeometry.dispose();
    this.pool = [];
  }
}

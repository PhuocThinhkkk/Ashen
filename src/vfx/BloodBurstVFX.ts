import * as THREE from 'three';
import {
  BatchedRenderer,
  ParticleSystem,
  SphereEmitter,
  IntervalValue,
  ConstantValue,
  ConstantColor,
  ColorOverLife,
  Gradient,
  ApplyForce,
  RenderMode,
  Vector3,
  Vector4,
} from 'three.quarks';
import { VFXTextureFactory } from './VFXTextureFactory';

const WHIP_VERTEX_SHADER = /* glsl */ `
  uniform float uProgress;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Rapid whip snap: extends full length in first 22% of lifetime
    float extendFactor = clamp(uProgress / 0.22, 0.0, 1.0);
    extendFactor = 1.0 - pow(1.0 - extendFactor, 3.0); // snappy ease-out

    if (pos.x > 0.0) {
      pos.x *= extendFactor;
    }

    // Natural fluid gravity droop along whip length
    float sag = pow(vUv.x, 2.0) * uProgress * 0.22;
    pos.y -= sag;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const WHIP_FRAGMENT_SHADER = /* glsl */ `
  uniform float uProgress;
  varying vec2 vUv;

  void main() {
    // vUv.x: 0.0 = contact point (wound root), 1.0 = streak tail
    // vUv.y: 0.0 to 1.0 across whip width (0.5 = center fluid spine)

    float distFromCenter = abs(vUv.y - 0.5) * 2.0;

    // Tapering width: thick at wound, tapering to 42% at tail
    float taper = mix(0.95, 0.40, vUv.x);

    // Dynamic fluid tendril shear: splits into jagged liquid tendrils toward tail
    float tendril1 = sin(vUv.y * 32.0 + vUv.x * 16.0);
    float tendril2 = cos(vUv.y * 48.0 - vUv.x * 24.0);
    float tendrilPattern = tendril1 * 0.55 + tendril2 * 0.45;

    // Cohesion: solid sheet near wound root, breaking into ligaments toward tail
    float cohesion = smoothstep(0.38, 0.04, vUv.x);
    float streamMask = mix(tendrilPattern, 0.75, cohesion);

    // Razor-sharp sheared liquid edge (no blurry circular gradient)
    float edgeOffset = distFromCenter - (streamMask * 0.32 * vUv.x);
    float liquidEdge = smoothstep(taper, taper - 0.04, edgeOffset);

    // Droplet breakup near the whip tail
    if (vUv.x > 0.72) {
      float breakPattern = sin(vUv.x * 58.0) * cos(vUv.y * 36.0);
      if (breakPattern < -0.28) {
        liquidEdge = 0.0;
      }
    }

    // Root dissolve: tail burns forward as the whip ejects away from blade
    float rootDissolve = smoothstep(uProgress * 0.72, uProgress * 0.72 + 0.14, vUv.x);

    // Rapid, clean fade-out in final 35% of duration
    float fade = 1.0 - smoothstep(0.62, 1.0, uProgress);

    float alpha = liquidEdge * rootDissolve * fade;
    if (alpha < 0.02) discard;

    // Deep dark arterial crimson (dark maroon-red, flat non-glowing opacity)
    vec3 coreColor = vec3(0.44, 0.02, 0.02); // arterial core
    vec3 rimColor = vec3(0.18, 0.005, 0.005); // dark coagulated edge
    vec3 finalColor = mix(coreColor, rimColor, distFromCenter);

    gl_FragColor = vec4(finalColor, alpha * 0.98);
  }
`;

function createWhipCrossGeometry(length = 1.6, width = 0.22, segmentsX = 28): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Plane A: in XY plane
  for (let i = 0; i <= segmentsX; i++) {
    const u = i / segmentsX;
    const x = u * length;
    positions.push(x, width * 0.5, 0);
    uvs.push(u, 1.0);
    positions.push(x, -width * 0.5, 0);
    uvs.push(u, 0.0);
  }
  for (let i = 0; i < segmentsX; i++) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  // Plane B: in XZ plane (cross plane for 3D visibility from any camera angle)
  const offset = (segmentsX + 1) * 2;
  for (let i = 0; i <= segmentsX; i++) {
    const u = i / segmentsX;
    const x = u * length;
    positions.push(x, 0, width * 0.5);
    uvs.push(u, 1.0);
    positions.push(x, 0, -width * 0.5);
    uvs.push(u, 0.0);
  }
  for (let i = 0; i < segmentsX; i++) {
    const base = offset + i * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

interface BloodWhipInstance {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  active: boolean;
  timer: number;
  duration: number;
}

interface CompositeBloodBurst {
  whip: BloodWhipInstance;
  sparkPs: ParticleSystem;
}

/**
 * Directional Liquid Whip & Pinpoint Contact Spark Flesh-Hit VFX.
 * 1. Directional Liquid Whip: Narrow, cohesive ~1.6m elongated dark crimson streak
 *    shooting along blade slash with sharp torn edges breaking into tendrils.
 * 2. Pinpoint Contact Spark Anchor: Tight micro-burst of warm-orange sparks at exact hit point.
 * 3. Fast snappy 0.32s lifetime, clean floor (zero ground blood decals).
 */
export class BloodBurstVFX {
  private pool: CompositeBloodBurst[] = [];
  private readonly poolSize = 6;
  private currentIndex = 0;
  private batchRenderer: BatchedRenderer;
  private scene: THREE.Scene;
  private whipGeometry: THREE.BufferGeometry;
  private sparkMaterial: THREE.MeshBasicMaterial;

  constructor(batchRenderer: BatchedRenderer, sceneOrContainer?: THREE.Object3D) {
    this.batchRenderer = batchRenderer;
    this.scene = (sceneOrContainer as THREE.Scene) || (batchRenderer as unknown as THREE.Scene);
    const texFactory = VFXTextureFactory.getInstance();

    this.whipGeometry = createWhipCrossGeometry(1.6, 0.22, 28);

    this.sparkMaterial = new THREE.MeshBasicMaterial({
      map: texFactory.getSparkStreakTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    for (let i = 0; i < this.poolSize; i++) {
      // 1. Directional Liquid Whip Mesh
      const mat = new THREE.ShaderMaterial({
        vertexShader: WHIP_VERTEX_SHADER,
        fragmentShader: WHIP_FRAGMENT_SHADER,
        uniforms: {
          uProgress: { value: 0.0 },
        },
        transparent: true,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(this.whipGeometry, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);

      const whip: BloodWhipInstance = {
        mesh,
        material: mat,
        active: false,
        timer: 0,
        duration: 0.34,
      };

      // 2. Pinpoint Contact Spark Anchor
      const sparkSphere = new SphereEmitter({ radius: 0.015 });
      const sparkGradient = new Gradient(
        [
          [new Vector3(1.0, 0.78, 0.25), 0],
          [new Vector3(1.0, 0.38, 0.05), 1],
        ],
        [
          [1.0, 0],
          [0.0, 1],
        ],
      );
      const sparkColor = new ColorOverLife(sparkGradient);
      const sparkGravity = new ApplyForce(new Vector3(0, -9.8, 0), new ConstantValue(1.0));

      const sparkPs = new ParticleSystem({
        duration: 0.15,
        looping: false,
        startLife: new IntervalValue(0.08, 0.14),
        startSpeed: new IntervalValue(3.5, 7.5),
        startSize: new IntervalValue(0.04, 0.08),
        startColor: new ConstantColor(new Vector4(1.0, 0.78, 0.25, 1.0)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new IntervalValue(10, 14),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: sparkSphere,
        material: this.sparkMaterial,
        renderMode: RenderMode.StretchedBillBoard,
        speedFactor: 0.16,
        worldSpace: true,
        behaviors: [sparkColor, sparkGravity],
      });

      this.batchRenderer.addSystem(sparkPs);
      this.scene.add(sparkPs.emitter);

      this.pool.push({ whip, sparkPs });
    }
  }

  /**
   * Emits the directional liquid whip and pinpoint contact spark anchor.
   */
  public emit(
    contactPoint: THREE.Vector3 | { x: number; y: number; z: number },
    hitDirection: THREE.Vector3 | { x: number; y: number; z: number },
    isHeavy = false,
  ): void {
    const burst = this.pool[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.poolSize;

    const cp = contactPoint instanceof THREE.Vector3 ? contactPoint : new THREE.Vector3(contactPoint.x, contactPoint.y, contactPoint.z);
    const hd = hitDirection instanceof THREE.Vector3 ? hitDirection : new THREE.Vector3(hitDirection.x, hitDirection.y, hitDirection.z);

    const normDir = hd.clone().normalize();
    // Orientation: geometry extends along +X, orient +X to normDir
    const forwardX = new THREE.Vector3(1, 0, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(forwardX, normDir);
    const scale = isHeavy ? 1.35 : 1.0;

    // 1. Trigger Liquid Whip
    burst.whip.active = true;
    burst.whip.timer = 0;
    burst.whip.duration = isHeavy ? 0.38 : 0.32;
    burst.whip.material.uniforms.uProgress.value = 0.0;
    burst.whip.mesh.position.copy(cp);
    burst.whip.mesh.quaternion.copy(quat);
    burst.whip.mesh.scale.set(scale, scale, scale);
    burst.whip.mesh.visible = true;
    burst.whip.mesh.updateMatrixWorld(true);

    // 2. Trigger Pinpoint Contact Spark Anchor
    burst.sparkPs.emitter.position.copy(cp);
    burst.sparkPs.emitter.updateMatrixWorld(true);
    burst.sparkPs.restart();
  }

  public update(delta: number): void {
    for (const b of this.pool) {
      if (b.whip.active) {
        b.whip.timer += delta;
        const progress = Math.min(1.0, b.whip.timer / b.whip.duration);
        b.whip.material.uniforms.uProgress.value = progress;
        if (progress >= 1.0) {
          b.whip.active = false;
          b.whip.mesh.visible = false;
        }
      }
    }
  }

  public reset(): void {
    for (const b of this.pool) {
      b.whip.active = false;
      b.whip.mesh.visible = false;
      b.whip.timer = 0;
      b.whip.material.uniforms.uProgress.value = 0.0;
      b.sparkPs.restart();
    }
    this.currentIndex = 0;
  }

  public dispose(): void {
    for (const b of this.pool) {
      this.scene.remove(b.whip.mesh);
      b.whip.material.dispose();

      this.batchRenderer.deleteSystem(b.sparkPs);
      if (b.sparkPs.emitter.parent) b.sparkPs.emitter.parent.remove(b.sparkPs.emitter);
    }
    this.pool = [];
    this.whipGeometry.dispose();
    this.sparkMaterial.dispose();
  }
}

import * as THREE from 'three';

export interface SlashArcOptions {
  color?: number | string | THREE.Color;
  coreColor?: number | string | THREE.Color;
  innerRadius?: number;
  outerRadius?: number;
  arcAngle?: number; // radians
  duration?: number; // seconds (0.15 - 0.25)
  expansion?: number; // radial expansion factor
  intensity?: number;
}

const ARC_VERTEX_SHADER = /* glsl */ `
  uniform float uProgress;
  uniform float uExpansion;
  varying vec2 vUv;
  varying vec3 vPosition;

  void main() {
    vUv = uv;
    vec3 pos = position;
    // Radial expansion as arc expands and dissipates
    float expandFactor = 1.0 + uProgress * uExpansion;
    pos.x *= expandFactor;
    pos.z *= expandFactor;

    vPosition = pos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const ARC_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCoreColor;
  uniform float uProgress;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vPosition;

  // 2D Simplex Noise for dynamic slash energy turbulence
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187,
                        0.366025403784439,
                       -0.577350269189626,
                        0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    // vUv.x: along the curve (0.0 = tail, 1.0 = leading cutting blade)
    // vUv.y: radial width (0.0 = inner hilt radius, 1.0 = outer blade tip)

    // Animated noise scrolling backwards along the arc curve
    vec2 noiseUv = vec2(vUv.x * 4.0 - uProgress * 3.0, vUv.y * 2.2);
    float n1 = snoise(noiseUv) * 0.5 + 0.5;
    float n2 = snoise(noiseUv * 2.2 + vec2(2.1, 1.4)) * 0.5 + 0.5;
    float noiseTurbulence = mix(n1, n2, 0.45);

    // Dynamic tail dissolve: trailing edge burns away as progress advances
    float dissolveThreshold = uProgress * 1.12;
    float tailDissolve = smoothstep(dissolveThreshold, dissolveThreshold + 0.28, vUv.x + noiseTurbulence * 0.25);

    // Soft leading edge feather
    float headFeather = smoothstep(1.0, 0.88, vUv.x);

    // Radial cutting profile: crisp sharp edge near outer tip (vUv.y = 0.85 - 0.98)
    float radialEdge = smoothstep(0.05, 0.4, vUv.y) * smoothstep(1.0, 0.65, vUv.y);
    float razorLine = smoothstep(0.72, 0.94, vUv.y) * 1.6;

    // Glowing core ribbon
    float coreDist = abs(vUv.y - 0.76);
    float coreGlow = pow(clamp(1.0 - coreDist * 3.4, 0.0, 1.0), 3.0);

    float alpha = tailDissolve * (radialEdge + razorLine * 0.4) * (1.0 - uProgress);
    alpha = clamp(alpha, 0.0, 1.0);

    if (alpha < 0.005) discard;

    // Mix base emissive color with brilliant hot white core
    vec3 col = mix(uColor * uIntensity, uCoreColor * (uIntensity * 1.7), coreGlow);
    // Extra boost at the leading blade tip
    float tipBoost = pow(vUv.x, 3.2) * (1.0 - uProgress * 0.6);
    col += uCoreColor * tipBoost * 1.4;

    gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * [Purpose]: Builds a curved cylindrical ribbon mesh buffer with UVs for weapon slash trail rendering.
 * @condition Called during SlashArcRibbon initialization or when configuring custom weapon sweep geometries.
 * @param innerRadius, outerRadius, arcAngle, angularSegments, radialSegments - Geometry dimensions (m, rad) and tessellation density.
 * @returns Fully populated THREE.BufferGeometry with position, UV, and index buffers.
 */
export function createSlashArcGeometry(
  innerRadius = 0.6,
  outerRadius = 2.4,
  arcAngle = Math.PI * 0.75, // ~135 degrees
  angularSegments = 40,
  radialSegments = 4,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= radialSegments; r++) {
    const v = r / radialSegments;
    const currentRadius = innerRadius + v * (outerRadius - innerRadius);

    for (let a = 0; a <= angularSegments; a++) {
      const u = a / angularSegments;
      // Arc curves from -arcAngle / 2 to +arcAngle / 2
      const theta = (u - 0.5) * arcAngle;

      const x = Math.sin(theta) * currentRadius;
      const z = -Math.cos(theta) * currentRadius;
      const y = 0;

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const stride = angularSegments + 1;
  for (let r = 0; r < radialSegments; r++) {
    for (let a = 0; a < angularSegments; a++) {
      const p0 = r * stride + a;
      const p1 = r * stride + (a + 1);
      const p2 = (r + 1) * stride + a;
      const p3 = (r + 1) * stride + (a + 1);

      // Two triangles per quad (front + back visible with DoubleSide)
      indices.push(p0, p2, p1);
      indices.push(p1, p2, p3);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

export class SlashArcInstance {
  public mesh: THREE.Mesh;
  public material: THREE.ShaderMaterial;
  public active = false;
  public timer = 0;
  public duration = 0.2;

  constructor(geometry: THREE.BufferGeometry) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: ARC_VERTEX_SHADER,
      fragmentShader: ARC_FRAGMENT_SHADER,
      uniforms: {
        uColor: { value: new THREE.Color(0xffe066) },
        uCoreColor: { value: new THREE.Color(0xffffff) },
        uProgress: { value: 0.0 },
        uExpansion: { value: 0.22 },
        uIntensity: { value: 2.2 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }

  public activate(
    origin: THREE.Vector3,
    rotation: THREE.Euler,
    scale: number,
    colorHex: number | string | THREE.Color = 0xffe066,
    duration = 0.2,
    expansion = 0.22,
    intensity = 2.2,
  ): void {
    this.active = true;
    this.timer = 0;
    this.duration = Math.max(0.1, duration);

    this.mesh.position.copy(origin);
    this.mesh.rotation.copy(rotation);
    this.mesh.scale.setScalar(scale);
    this.mesh.visible = true;

    if (colorHex instanceof THREE.Color) {
      this.material.uniforms.uColor.value.copy(colorHex);
    } else {
      this.material.uniforms.uColor.value.set(colorHex);
    }

    this.material.uniforms.uExpansion.value = expansion;
    this.material.uniforms.uIntensity.value = intensity;
    this.material.uniforms.uProgress.value = 0.0;
  }

  public update(delta: number): boolean {
    if (!this.active) return false;

    this.timer += delta;
    const progress = Math.min(1.0, this.timer / this.duration);
    this.material.uniforms.uProgress.value = progress;

    if (this.timer >= this.duration) {
      this.active = false;
      this.mesh.visible = false;
    }

    return this.active;
  }

  public dispose(): void {
    this.material.dispose();
  }
}

interface BladeSample {
  base: THREE.Vector3;
  tip: THREE.Vector3;
  age: number;
}

const BLADE_TRAIL_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BLADE_TRAIL_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCoreColor;
  uniform float uOpacity;
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    // vUv.x: 0.0 = oldest tail, 1.0 = leading blade edge
    // vUv.y: 0.0 = blade base/hilt, 1.0 = blade tip
    float n = snoise(vec2(vUv.x * 5.0 - uTime * 4.0, vUv.y * 3.0)) * 0.5 + 0.5;

    // Smooth tail taper & crisp head cutoff
    float tailFade = smoothstep(0.0, 0.55, vUv.x + (n - 0.5) * 0.14);
    float headSoft = smoothstep(1.0, 0.94, vUv.x);

    // Blade span intensity: faint near hilt, razor-bright near outer blade edge
    float radial = smoothstep(0.05, 0.45, vUv.y) * smoothstep(1.0, 0.88, vUv.y * 0.95);
    float edgeGlow = pow(smoothstep(0.55, 0.96, vUv.y), 1.6);

    float alpha = tailFade * headSoft * (radial * 0.75 + edgeGlow * 0.55) * uOpacity;
    alpha = clamp(alpha, 0.0, 1.0);
    if (alpha < 0.004) discard;

    vec3 col = mix(uColor * uIntensity, uCoreColor * (uIntensity * 1.6), edgeGlow * 0.8);
    col += uCoreColor * pow(vUv.x, 3.0) * edgeGlow * 0.9;
    gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * Dynamic world-space blade ribbon driven frame-by-frame from physical sword base/tip locators.
 */
export class DynamicWeaponTrail {
  public readonly mesh: THREE.Mesh;
  public readonly material: THREE.ShaderMaterial;
  public active = false;
  public recording = false;
  public ownerKey = '';

  private readonly maxRawSamples = 20;
  private readonly subdivisions = 3;
  private readonly maxVertPairs = (20 - 1) * 3 + 1;
  private readonly maxSampleAge = 0.22;
  private readonly fadeOutDuration = 0.18;

  private rawSamples: BladeSample[] = [];
  private fadeTimer = 0;
  private elapsed = 0;

  private readonly positions: Float32Array;
  private readonly uvs: Float32Array;
  private readonly geometry: THREE.BufferGeometry;

  private readonly tmpBase = new THREE.Vector3();
  private readonly tmpTip = new THREE.Vector3();

  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.maxVertPairs * 2 * 3);
    this.uvs = new Float32Array(this.maxVertPairs * 2 * 2);

    const indices: number[] = [];
    for (let i = 0; i < this.maxVertPairs - 1; i++) {
      const i0 = i * 2;
      const i1 = i0 + 1;
      const i2 = i0 + 2;
      const i3 = i0 + 3;
      indices.push(i0, i1, i2, i2, i1, i3);
    }

    const posAttr = new THREE.BufferAttribute(this.positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const uvAttr = new THREE.BufferAttribute(this.uvs, 2);
    uvAttr.setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('position', posAttr);
    this.geometry.setAttribute('uv', uvAttr);
    this.geometry.setIndex(indices);
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      vertexShader: BLADE_TRAIL_VERTEX_SHADER,
      fragmentShader: BLADE_TRAIL_FRAGMENT_SHADER,
      uniforms: {
        uColor: { value: new THREE.Color(0xffe066) },
        uCoreColor: { value: new THREE.Color(0xfff7dd) },
        uOpacity: { value: 1.0 },
        uIntensity: { value: 2.2 },
        uTime: { value: 0.0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }

  public begin(
    ownerKey: string,
    colorHex: number | string | THREE.Color = 0xffe066,
    intensity = 2.2,
  ): void {
    this.ownerKey = ownerKey;
    this.active = true;
    this.recording = true;
    this.fadeTimer = 0;
    this.rawSamples = [];
    this.geometry.setDrawRange(0, 0);

    if (colorHex instanceof THREE.Color) {
      this.material.uniforms.uColor.value.copy(colorHex);
    } else {
      this.material.uniforms.uColor.value.set(colorHex);
    }
    this.material.uniforms.uIntensity.value = intensity;
    this.material.uniforms.uOpacity.value = 1.0;
    this.mesh.visible = true;
  }

  public addSample(baseWorld: THREE.Vector3, tipWorld: THREE.Vector3): void {
    if (!this.active || !this.recording) return;

    const last = this.rawSamples[this.rawSamples.length - 1];
    if (last && last.tip.distanceToSquared(tipWorld) < 0.0004 && last.base.distanceToSquared(baseWorld) < 0.0004) {
      return;
    }

    this.rawSamples.push({
      base: baseWorld.clone(),
      tip: tipWorld.clone(),
      age: 0,
    });

    if (this.rawSamples.length > this.maxRawSamples) {
      this.rawSamples.shift();
    }
    this.rebuildGeometry();
  }

  public end(): void {
    this.recording = false;
  }

  public reset(): void {
    this.active = false;
    this.recording = false;
    this.ownerKey = '';
    this.rawSamples = [];
    this.fadeTimer = 0;
    this.mesh.visible = false;
    this.geometry.setDrawRange(0, 0);
  }

  public update(delta: number): void {
    if (!this.active) return;
    this.elapsed += delta;
    this.material.uniforms.uTime.value = this.elapsed;

    for (let i = this.rawSamples.length - 1; i >= 0; i--) {
      this.rawSamples[i].age += delta;
      if (this.rawSamples[i].age > this.maxSampleAge) {
        this.rawSamples.splice(i, 1);
      }
    }

    if (!this.recording) {
      this.fadeTimer += delta;
      const opacity = Math.max(0, 1.0 - this.fadeTimer / this.fadeOutDuration);
      this.material.uniforms.uOpacity.value = opacity;
      if (opacity <= 0.005 || this.rawSamples.length < 2) {
        this.reset();
        return;
      }
    }

    this.rebuildGeometry();
  }

  private catmullRomPoint(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    t: number,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    const t2 = t * t;
    const t3 = t2 * t;
    out.set(
      0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
    );
    return out;
  }

  private rebuildGeometry(): void {
    const n = this.rawSamples.length;
    if (n < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    let pairCount = 0;
    const totalExpectedPairs = (n - 1) * this.subdivisions + 1;

    for (let i = 0; i < n - 1; i++) {
      const s0 = this.rawSamples[Math.max(0, i - 1)];
      const s1 = this.rawSamples[i];
      const s2 = this.rawSamples[i + 1];
      const s3 = this.rawSamples[Math.min(n - 1, i + 2)];

      const steps = i === n - 2 ? this.subdivisions : this.subdivisions - 1;
      for (let step = 0; step <= steps; step++) {
        if (pairCount >= this.maxVertPairs) break;
        const t = step / this.subdivisions;

        this.catmullRomPoint(s0.base, s1.base, s2.base, s3.base, t, this.tmpBase);
        this.catmullRomPoint(s0.tip, s1.tip, s2.tip, s3.tip, t, this.tmpTip);

        const vOffset = pairCount * 6;
        this.positions[vOffset] = this.tmpBase.x;
        this.positions[vOffset + 1] = this.tmpBase.y;
        this.positions[vOffset + 2] = this.tmpBase.z;
        this.positions[vOffset + 3] = this.tmpTip.x;
        this.positions[vOffset + 4] = this.tmpTip.y;
        this.positions[vOffset + 5] = this.tmpTip.z;

        const u = totalExpectedPairs > 1 ? pairCount / (totalExpectedPairs - 1) : 1.0;
        const uvOffset = pairCount * 4;
        this.uvs[uvOffset] = u;
        this.uvs[uvOffset + 1] = 0.0;
        this.uvs[uvOffset + 2] = u;
        this.uvs[uvOffset + 3] = 1.0;

        pairCount++;
      }
    }

    this.geometry.setDrawRange(0, Math.max(0, (pairCount - 1) * 6));
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('uv') as THREE.BufferAttribute).needsUpdate = true;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

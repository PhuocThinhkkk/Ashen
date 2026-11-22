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

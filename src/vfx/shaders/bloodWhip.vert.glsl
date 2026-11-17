uniform float uProgress;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;

  // Snappy fluid extension in first 22% of lifetime
  float extendFactor = clamp(uProgress / 0.22, 0.0, 1.0);
  extendFactor = 1.0 - pow(1.0 - extendFactor, 3.0);

  if (pos.x > 0.0) {
    pos.x *= extendFactor;
  }

  // Natural fluid gravity sag along length
  float sag = pow(vUv.x, 2.0) * uProgress * 0.22;
  pos.y -= sag;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
